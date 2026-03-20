"""
Centralized rate-limiter instance.

Separated from main.py to avoid circular imports when routers need to apply
endpoint-specific rate limits.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address, default_limits=["60/minute"])
