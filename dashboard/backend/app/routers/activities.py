from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.auth import get_current_user

router = APIRouter(prefix="/api/activities", tags=["activities"])


def _activity_with_progress(activity: models.Activity) -> dict:
    """Return activity dict with progress keyed by quarter."""
    progress_by_quarter = {}
    for p in activity.progress:
        progress_by_quarter[p.quarter] = schemas.ActivityProgressOut.model_validate(p).model_dump()

    base = schemas.ActivityOut.model_validate(activity).model_dump()
    base["progress"] = progress_by_quarter
    return base


@router.get("", response_model=List[dict])
def list_activities(db: Session = Depends(get_db)):
    activities = db.query(models.Activity).order_by(models.Activity.id).all()
    return [_activity_with_progress(a) for a in activities]


@router.get("/{activity_id}", response_model=dict)
def get_activity(activity_id: int, db: Session = Depends(get_db)):
    activity = db.query(models.Activity).filter(models.Activity.id == activity_id).first()
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")
    return _activity_with_progress(activity)


@router.put("/{activity_id}/progress", response_model=schemas.ActivityProgressOut)
def update_activity_progress(
    activity_id: int,
    payload: schemas.ActivityProgressUpdate,
    quarter: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Update (or create) progress for a single quarter of an activity."""
    activity = db.query(models.Activity).filter(models.Activity.id == activity_id).first()
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")

    if quarter not in ("Q1", "Q2", "Q3", "Q4"):
        raise HTTPException(status_code=400, detail="quarter must be Q1, Q2, Q3, or Q4")

    progress = (
        db.query(models.ActivityProgress)
        .filter(
            models.ActivityProgress.activity_id == activity_id,
            models.ActivityProgress.quarter == quarter,
        )
        .first()
    )

    if progress is None:
        progress = models.ActivityProgress(
            activity_id=activity_id,
            quarter=quarter,
            status=payload.status or "not_started",
            actual_usd=payload.actual_usd or 0,
            percent_done=payload.percent_done or 0,
            notes=payload.notes,
            updated_by=payload.updated_by or current_user.username,
        )
        db.add(progress)
    else:
        if payload.status is not None:
            progress.status = payload.status
        if payload.actual_usd is not None:
            progress.actual_usd = payload.actual_usd
        if payload.percent_done is not None:
            progress.percent_done = payload.percent_done
        if payload.notes is not None:
            progress.notes = payload.notes
        progress.updated_by = payload.updated_by or current_user.username

    db.commit()
    db.refresh(progress)
    return progress
