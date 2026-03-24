from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.auth import get_current_user

router = APIRouter(prefix="/api/indicators", tags=["indicators"])


def _indicator_with_latest(indicator: models.Indicator) -> dict:
    """Return indicator dict with latest_value per quarter."""
    # Build a dict of quarter -> latest recorded value
    latest: dict = {}
    for p in sorted(indicator.progress, key=lambda x: x.recorded_at or 0):
        latest[p.quarter] = {
            "id": p.id,
            "quarter": p.quarter,
            "value": float(p.value) if p.value is not None else None,
            "recorded_at": p.recorded_at.isoformat() if p.recorded_at else None,
            "notes": p.notes,
        }

    base = {
        "id": indicator.id,
        "code": indicator.code,
        "name": indicator.name,
        "baseline_ha": float(indicator.baseline_ha) if indicator.baseline_ha is not None else None,
        "target_ha": float(indicator.target_ha) if indicator.target_ha is not None else None,
        "unit": indicator.unit,
        "latest_by_quarter": latest,
    }
    return base


@router.get("", response_model=List[dict])
def list_indicators(db: Session = Depends(get_db)):
    indicators = db.query(models.Indicator).order_by(models.Indicator.id).all()
    return [_indicator_with_latest(i) for i in indicators]


@router.put("/{indicator_id}/progress", response_model=schemas.IndicatorProgressOut)
def record_indicator_progress(
    indicator_id: int,
    payload: schemas.IndicatorProgressCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    indicator = db.query(models.Indicator).filter(models.Indicator.id == indicator_id).first()
    if not indicator:
        raise HTTPException(status_code=404, detail="Indicator not found")

    if payload.quarter not in ("Q1", "Q2", "Q3", "Q4"):
        raise HTTPException(status_code=400, detail="quarter must be Q1, Q2, Q3, or Q4")

    entry = models.IndicatorProgress(
        indicator_id=indicator_id,
        quarter=payload.quarter,
        value=payload.value,
        notes=payload.notes,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry
