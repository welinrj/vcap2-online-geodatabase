"""
File upload / data ingestion endpoints.

Routes:
  POST /api/uploads/csv        – parse CSV, validate columns, bulk insert
  POST /api/uploads/field-data – accept offline sync payload, insert engagements
"""

from __future__ import annotations

import io
import logging
import uuid
from datetime import date
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Dict, List, Optional

import aiofiles
import pandas as pd
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import User, get_current_user, require_data_entry
from app.config import settings
from app.rate_limit import limiter
from app.database import get_db
from app.models.events import CommunityEngagement, LDEvent
from app.models.financials import FinancialTransaction
from app.models.indicators import IndicatorValue
from app.models.users import DocumentUpload

logger = logging.getLogger(__name__)
router = APIRouter()

# ── Supported CSV target types ─────────────────────────────────────────────────

_REQUIRED_COLUMNS: Dict[str, List[str]] = {
    "indicator_values": ["indicator_id", "value", "recorded_date"],
    "financial_transactions": [
        "transaction_date",
        "transaction_type",
        "amount",
        "domain",
    ],
    "ld_events": ["title", "event_type", "event_date"],
    "community_engagements": ["title", "engagement_type", "engagement_date"],
}

# ── Offline sync payload schema ────────────────────────────────────────────────


class OfflineEngagementRecord(BaseModel):
    engagement_date: date
    title: str
    engagement_type: str
    province: Optional[str] = None
    island: Optional[str] = None
    community: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    total_participants: int = 0
    male_participants: int = 0
    female_participants: int = 0
    youth_participants: int = 0
    elderly_participants: int = 0
    disability_participants: int = 0
    indigenous_participants: int = 0
    facilitator: Optional[str] = None
    key_issues_raised: Optional[str] = None
    outcomes: Optional[str] = None
    activity_code: Optional[str] = None


class OfflineSyncPayload(BaseModel):
    device_id: str = Field(..., description="Unique identifier for the field device.", max_length=200)
    sync_timestamp: str = Field(..., max_length=100)
    engagements: List[OfflineEngagementRecord] = Field(default_factory=list, max_length=500)


# ── Helpers ───────────────────────────────────────────────────────────────────


async def _save_upload(file: UploadFile, user_email: str) -> Path:
    """Persist the uploaded file to UPLOAD_DIR and return the saved path.

    Reads the file in chunks to prevent memory exhaustion from oversized uploads.
    """
    upload_dir = Path(settings.UPLOAD_DIR)
    upload_dir.mkdir(parents=True, exist_ok=True)

    # Sanitise filename: strip directory components and limit length
    raw_name = Path(file.filename or "upload").name
    # Remove any non-alphanumeric chars except dots, hyphens, underscores
    import re
    safe_suffix = re.sub(r"[^\w.\-]", "_", raw_name)[:200]
    safe_name = f"{uuid.uuid4().hex}_{safe_suffix}"
    dest = upload_dir / safe_name

    max_bytes = settings.max_upload_bytes
    total_written = 0
    chunk_size = 256 * 1024  # 256 KB chunks

    async with aiofiles.open(dest, "wb") as fp:
        while True:
            chunk = await file.read(chunk_size)
            if not chunk:
                break
            total_written += len(chunk)
            if total_written > max_bytes:
                # Clean up the partial file before rejecting
                await fp.close()
                dest.unlink(missing_ok=True)
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail=f"File exceeds maximum allowed size of {settings.MAX_UPLOAD_SIZE_MB} MB.",
                )
            await fp.write(chunk)

    return dest


def _coerce_date(val: Any) -> Optional[date]:
    if pd.isna(val):
        return None
    if isinstance(val, date):
        return val
    try:
        return pd.to_datetime(str(val)).date()
    except Exception:
        return None


def _coerce_decimal(val: Any) -> Optional[Decimal]:
    try:
        return Decimal(str(val))
    except InvalidOperation:
        return None


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.post("/uploads/csv", status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
async def upload_csv(
    request: Request,
    target: str = "indicator_values",
    file: UploadFile = File(..., description="CSV file to ingest"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_data_entry),
) -> dict:
    """
    Parse an uploaded CSV file, validate required columns, and bulk-insert rows
    into the appropriate PostgreSQL table.

    Supported `target` values:
    - `indicator_values`
    - `financial_transactions`
    - `ld_events`
    - `community_engagements`
    """
    if target not in _REQUIRED_COLUMNS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown target '{target}'. Supported: {list(_REQUIRED_COLUMNS)}",
        )

    if file.content_type not in ("text/csv", "application/csv", "text/plain"):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only CSV files are accepted.",
        )

    # Validate file extension as well (content-type alone is attacker-controlled)
    _ext = Path(file.filename or "").suffix.lower()
    if _ext not in (".csv",):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only .csv file extensions are accepted.",
        )

    saved_path = await _save_upload(file, user.email)

    # Parse CSV with safety limits to prevent memory exhaustion
    try:
        df = pd.read_csv(saved_path, nrows=10_000, low_memory=True)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Could not parse CSV file.",
        )

    # Validate required columns
    required = _REQUIRED_COLUMNS[target]
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Missing required columns: {missing}",
        )

    # Cap row count to prevent memory exhaustion / DoS via huge CSVs
    MAX_CSV_ROWS = 10_000
    if len(df) > MAX_CSV_ROWS:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"CSV contains {len(df)} rows, exceeding the maximum of {MAX_CSV_ROWS}.",
        )

    df = df.where(pd.notna(df), None)  # Replace NaN with None
    inserted = 0
    errors: List[str] = []

    if target == "indicator_values":
        for idx, row in df.iterrows():
            try:
                val = IndicatorValue(
                    indicator_id=int(row["indicator_id"]),
                    value=_coerce_decimal(row["value"]),
                    recorded_date=_coerce_date(row["recorded_date"]),
                    period_label=row.get("period_label"),
                    notes=row.get("notes"),
                    recorded_by=user.email,
                )
                db.add(val)
                inserted += 1
            except Exception as exc:
                errors.append(f"Row {idx}: {exc}")

    elif target == "financial_transactions":
        for idx, row in df.iterrows():
            try:
                tx = FinancialTransaction(
                    transaction_date=_coerce_date(row["transaction_date"]),
                    transaction_type=str(row["transaction_type"]),
                    amount=_coerce_decimal(row["amount"]),
                    domain=str(row["domain"]),
                    currency=str(row.get("currency") or "VUV"),
                    period_label=row.get("period_label"),
                    description=row.get("description"),
                    donor=row.get("donor"),
                    funding_source=row.get("funding_source"),
                    created_by=user.email,
                )
                db.add(tx)
                inserted += 1
            except Exception as exc:
                errors.append(f"Row {idx}: {exc}")

    elif target == "ld_events":
        for idx, row in df.iterrows():
            try:
                event = LDEvent(
                    title=str(row["title"]),
                    event_type=str(row["event_type"]),
                    event_date=_coerce_date(row["event_date"]),
                    province=row.get("province"),
                    island=row.get("island"),
                    community=row.get("community"),
                    latitude=row.get("latitude"),
                    longitude=row.get("longitude"),
                    affected_people=(
                        int(row["affected_people"])
                        if row.get("affected_people") is not None
                        else None
                    ),
                    created_by=user.email,
                )
                db.add(event)
                inserted += 1
            except Exception as exc:
                errors.append(f"Row {idx}: {exc}")

    elif target == "community_engagements":
        for idx, row in df.iterrows():
            try:
                eng = CommunityEngagement(
                    title=str(row["title"]),
                    engagement_type=str(row["engagement_type"]),
                    engagement_date=_coerce_date(row["engagement_date"]),
                    province=row.get("province"),
                    community=row.get("community"),
                    total_participants=int(row.get("total_participants") or 0),
                    male_participants=int(row.get("male_participants") or 0),
                    female_participants=int(row.get("female_participants") or 0),
                    youth_participants=int(row.get("youth_participants") or 0),
                    disability_participants=int(
                        row.get("disability_participants") or 0
                    ),
                    created_by=user.email,
                )
                db.add(eng)
                inserted += 1
            except Exception as exc:
                errors.append(f"Row {idx}: {exc}")

    # Persist the document upload metadata record
    # Sanitise the original filename to prevent stored XSS
    _raw_original = Path(file.filename or "upload.csv").name[:500]
    doc = DocumentUpload(
        filename=saved_path.name,
        original_filename=_raw_original,
        file_path=str(saved_path),
        file_size_bytes=saved_path.stat().st_size,
        content_type="text/csv",
        document_type="field_data",
        related_entity_type=target,
        uploaded_by=user.email,
        is_processed=True,
        processing_notes=f"Inserted {inserted} rows; {len(errors)} errors.",
    )
    db.add(doc)
    await db.flush()

    return {
        "status": "ok",
        "target": target,
        "rows_processed": len(df),
        "rows_inserted": inserted,
        "errors": errors[:50],  # cap error list for response size
    }


@router.post("/uploads/field-data", status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
async def upload_field_data(
    request: Request,
    payload: OfflineSyncPayload,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_data_entry),
) -> dict:
    """
    Accept an offline field data synchronisation payload and insert
    community engagement records into the database.

    Designed for mobile / offline field tools that batch records locally
    and sync when connectivity is restored.
    """
    inserted = 0
    errors: List[str] = []

    for idx, record in enumerate(payload.engagements):
        try:
            eng = CommunityEngagement(
                engagement_date=record.engagement_date,
                title=record.title,
                engagement_type=record.engagement_type,
                province=record.province,
                island=record.island,
                community=record.community,
                latitude=record.latitude,
                longitude=record.longitude,
                total_participants=record.total_participants,
                male_participants=record.male_participants,
                female_participants=record.female_participants,
                youth_participants=record.youth_participants,
                elderly_participants=record.elderly_participants,
                disability_participants=record.disability_participants,
                indigenous_participants=record.indigenous_participants,
                facilitator=record.facilitator,
                key_issues_raised=record.key_issues_raised,
                outcomes=record.outcomes,
                activity_code=record.activity_code,
                created_by=user.email,
            )
            db.add(eng)
            inserted += 1
        except Exception as exc:
            errors.append(f"Record {idx}: {exc}")

    await db.flush()

    logger.info(
        "Field data sync from device %s: %d engagements inserted, %d errors.",
        payload.device_id,
        inserted,
        len(errors),
    )

    return {
        "status": "ok",
        "device_id": payload.device_id,
        "sync_timestamp": payload.sync_timestamp,
        "records_received": len(payload.engagements),
        "records_inserted": inserted,
        "errors": errors[:50],
    }
