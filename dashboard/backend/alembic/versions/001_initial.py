"""Initial schema: activities, activity_progress, indicators, indicator_progress, users

Revision ID: 001
Revises:
Create Date: 2026-03-24
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── users ────────────────────────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("username", sa.Text(), nullable=False),
        sa.Column("hashed_password", sa.Text(), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.UniqueConstraint("username", name="uq_users_username"),
    )

    # ── activities ───────────────────────────────────────────────────────────
    op.create_table(
        "activities",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("output", sa.Text(), nullable=False),
        sa.Column("fund", sa.Text(), nullable=False),
        sa.Column("gl_account", sa.Text(), nullable=False),
        sa.Column("budget_usd", sa.Numeric(12, 2), nullable=True),
        sa.Column("q1_budget", sa.Numeric(12, 2), nullable=True),
        sa.Column("q2_budget", sa.Numeric(12, 2), nullable=True),
        sa.Column("q3_budget", sa.Numeric(12, 2), nullable=True),
        sa.Column("q4_budget", sa.Numeric(12, 2), nullable=True),
        sa.Column("responsible", sa.Text(), server_default=sa.text("'IP 009198'"), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
    )

    # ── activity_progress ────────────────────────────────────────────────────
    op.create_table(
        "activity_progress",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("activity_id", sa.Integer(), sa.ForeignKey("activities.id", ondelete="CASCADE"), nullable=False),
        sa.Column("quarter", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False),
        sa.Column("actual_usd", sa.Numeric(12, 2), server_default=sa.text("0"), nullable=True),
        sa.Column("percent_done", sa.Integer(), server_default=sa.text("0"), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=True,
        ),
        sa.Column("updated_by", sa.Text(), nullable=True),
    )

    # ── indicators ───────────────────────────────────────────────────────────
    op.create_table(
        "indicators",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("baseline_ha", sa.Numeric(10, 2), nullable=True),
        sa.Column("target_ha", sa.Numeric(10, 2), nullable=True),
        sa.Column("unit", sa.Text(), server_default=sa.text("'ha'"), nullable=True),
    )

    # ── indicator_progress ───────────────────────────────────────────────────
    op.create_table(
        "indicator_progress",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("indicator_id", sa.Integer(), sa.ForeignKey("indicators.id", ondelete="CASCADE"), nullable=False),
        sa.Column("quarter", sa.Text(), nullable=False),
        sa.Column("value", sa.Numeric(10, 2), nullable=True),
        sa.Column(
            "recorded_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=True,
        ),
        sa.Column("notes", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("indicator_progress")
    op.drop_table("indicators")
    op.drop_table("activity_progress")
    op.drop_table("activities")
    op.drop_table("users")
