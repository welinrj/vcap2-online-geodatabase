"""
ORM models and Pydantic schemas for Users, Document Uploads, and Learning Entries.

Tables (schema: merl):
  - merl.users            – application user profiles (mirrors Keycloak)
  - merl.document_uploads – uploaded files / attachments
  - merl.learning_entries – lessons learned / knowledge management entries
"""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from sqlalchemy import Boolean, DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

# ── ORM Models ────────────────────────────────────────────────────────────────


class User(Base):
    """Application user profile synchronised from Keycloak."""

    __tablename__ = "users"
    __table_args__ = {"schema": "merl"}

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    keycloak_id: Mapped[str] = mapped_column(
        String(100), unique=True, nullable=False, index=True
    )
    email: Mapped[str] = mapped_column(
        String(255), unique=True, nullable=False, index=True
    )
    username: Mapped[str] = mapped_column(String(150), nullable=False)
    given_name: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    family_name: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    organisation: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    province: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    role: Mapped[str] = mapped_column(
        String(50), nullable=False, default="viewer"
    )  # admin | data_entry | analyst | viewer
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    last_login: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class DocumentUpload(Base):
    """Metadata record for an uploaded file."""

    __tablename__ = "document_uploads"
    __table_args__ = {"schema": "merl"}

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    filename: Mapped[str] = mapped_column(String(500), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(500), nullable=False)
    file_path: Mapped[str] = mapped_column(String(1000), nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    document_type: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True
    )  # report | field_data | photo | other
    related_entity_type: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True
    )  # indicator | activity | event | engagement
    related_entity_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    uploaded_by: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    is_processed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    processing_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    s3_key: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class LearningEntry(Base):
    """A lesson learned or knowledge management entry."""

    __tablename__ = "learning_entries"
    __table_args__ = {"schema": "merl"}

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    entry_type: Mapped[str] = mapped_column(
        String(100), nullable=False
    )  # lesson_learned | best_practice | challenge | recommendation
    domain: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    activity_code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    context: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    recommendations: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tags: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    is_published: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    author: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    reviewed_by: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    review_date: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


# ── Pydantic Schemas ──────────────────────────────────────────────────────────

from pydantic import BaseModel, ConfigDict, EmailStr, Field  # noqa: E402


class UserCreate(BaseModel):
    keycloak_id: str
    email: EmailStr
    username: str = Field(..., max_length=150)
    given_name: Optional[str] = None
    family_name: Optional[str] = None
    organisation: Optional[str] = None
    province: Optional[str] = None
    role: str = Field(default="viewer", pattern="^(admin|data_entry|analyst|viewer)$")


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    keycloak_id: str
    email: str
    username: str
    given_name: Optional[str]
    family_name: Optional[str]
    organisation: Optional[str]
    province: Optional[str]
    role: str
    is_active: bool
    last_login: Optional[datetime]
    created_at: datetime
    updated_at: datetime


class DocumentUploadResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    filename: str
    original_filename: str
    file_size_bytes: int
    content_type: str
    document_type: Optional[str]
    related_entity_type: Optional[str]
    related_entity_id: Optional[int]
    description: Optional[str]
    uploaded_by: Optional[str]
    is_processed: bool
    s3_key: Optional[str]
    created_at: datetime


class LearningEntryCreate(BaseModel):
    title: str = Field(..., max_length=500)
    entry_type: str = Field(
        ...,
        pattern="^(lesson_learned|best_practice|challenge|recommendation)$",
    )
    domain: Optional[str] = None
    activity_code: Optional[str] = None
    description: str
    context: Optional[str] = None
    recommendations: Optional[str] = None
    tags: Optional[str] = None


class LearningEntryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    entry_type: str
    domain: Optional[str]
    activity_code: Optional[str]
    description: str
    context: Optional[str]
    recommendations: Optional[str]
    tags: Optional[str]
    is_published: bool
    author: Optional[str]
    reviewed_by: Optional[str]
    review_date: Optional[datetime]
    created_at: datetime
    updated_at: datetime
