"""
Keycloak-based JWT authentication and authorisation helpers.

Flow:
  1. Client sends  Authorization: Bearer <access_token>
  2. get_current_user() fetches (and caches) the Keycloak JWKS.
  3. The token is decoded and validated (issuer, audience, expiry).
  4. A User dataclass is populated from the token claims.
  5. require_role(role) can be composed as an additional dependency to enforce
     realm-level role-based access control (RBAC).
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import ExpiredSignatureError, JWTError, jwt

from app.config import settings

logger = logging.getLogger(__name__)

# ── JWKS in-process cache ─────────────────────────────────────────────────────

_JWKS_CACHE: Dict[str, object] = {}
_JWKS_FETCHED_AT: float = 0.0
_JWKS_TTL: float = 300.0  # 5 minutes


async def _fetch_jwks() -> Dict:
    """
    Retrieve the Keycloak JWKS document and cache it for _JWKS_TTL seconds.
    Uses a module-level dict so it survives the lifetime of the process but
    is refreshed periodically to pick up key rotations.
    """
    global _JWKS_CACHE, _JWKS_FETCHED_AT

    now = time.monotonic()
    if _JWKS_CACHE and (now - _JWKS_FETCHED_AT) < _JWKS_TTL:
        return _JWKS_CACHE  # type: ignore[return-value]

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(settings.keycloak_jwks_uri)
        resp.raise_for_status()
        data: Dict = resp.json()

    _JWKS_CACHE = data
    _JWKS_FETCHED_AT = now
    logger.debug("JWKS refreshed from %s", settings.keycloak_jwks_uri)
    return data


# ── User dataclass ─────────────────────────────────────────────────────────────


@dataclass
class User:
    """Authenticated user derived from a validated Keycloak access token."""

    keycloak_id: str
    email: str
    username: str
    roles: List[str] = field(default_factory=list)
    given_name: str = ""
    family_name: str = ""

    @property
    def id(self) -> str:
        """Alias for keycloak_id for convenience."""
        return self.keycloak_id

    def has_role(self, role: str) -> bool:
        return role in self.roles


# ── Bearer scheme ─────────────────────────────────────────────────────────────

_bearer_scheme = HTTPBearer(auto_error=True)


# ── Core dependency ───────────────────────────────────────────────────────────


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer_scheme),
) -> User:
    """
    FastAPI dependency.  Validates the Bearer token and returns a User.
    Raises HTTP 401 on any validation failure.
    """
    token = credentials.credentials

    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        jwks = await _fetch_jwks()
        # python-jose can accept the full JWKS dict and will pick the right key
        # by the 'kid' header in the token.
        payload = jwt.decode(
            token,
            jwks,
            algorithms=["RS256"],
            audience=settings.KEYCLOAK_CLIENT_ID,
            issuer=settings.keycloak_issuer,
            options={"verify_at_hash": False},
        )
    except ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except JWTError as exc:
        logger.debug("JWT validation error: %s", exc)
        raise credentials_exc
    except httpx.HTTPError as exc:
        logger.error("Failed to fetch JWKS: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service unavailable.",
        )

    sub: Optional[str] = payload.get("sub")
    email: str = payload.get("email", "")
    username: str = payload.get("preferred_username", email)

    if not sub:
        raise credentials_exc

    # Extract realm roles from  realm_access.roles
    realm_access: Dict = payload.get("realm_access", {})
    roles: List[str] = realm_access.get("roles", [])

    return User(
        keycloak_id=sub,
        email=email,
        username=username,
        roles=roles,
        given_name=payload.get("given_name", ""),
        family_name=payload.get("family_name", ""),
    )


# ── Role-based access ─────────────────────────────────────────────────────────


def require_role(role: str):
    """
    Dependency factory.  Ensures the authenticated user holds the given realm
    role.  Returns the User object so downstream handlers can use it directly.

    Usage::

        @router.get("/admin")
        async def admin_only(user: User = Depends(require_role("admin"))):
            ...
    """

    async def _check(user: User = Depends(get_current_user)) -> User:
        if not user.has_role(role):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{role}' is required to access this resource.",
            )
        return user

    return _check
