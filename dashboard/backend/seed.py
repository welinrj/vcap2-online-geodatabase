"""
Seed the VCAP II Fisheries database with all 21 activities, 4 indicators,
and the initial admin user.

Run with:
    python seed.py
or via Docker:
    docker compose exec backend python seed.py
"""
import os
import sys
from decimal import Decimal

from dotenv import load_dotenv

load_dotenv()

# Ensure the app package is importable when run as a script
sys.path.insert(0, os.path.dirname(__file__))

from app.database import SessionLocal, engine, Base  # noqa: E402
from app import models  # noqa: E402
from app.auth import get_password_hash  # noqa: E402

# ── Create all tables (idempotent — Alembic should be used in prod) ──────────
Base.metadata.create_all(bind=engine)

# ── Activity seed data ────────────────────────────────────────────────────────
ACTIVITIES = [
    dict(
        code="1.1.1.2.a",
        description="BIORAP Assessment (Marine/Terrestrial) — 2 BIORAPs + PA site assessment",
        output="1.1.1", fund="LDCF", gl_account="72100",
        budget_usd=Decimal("102819"), q1_budget=Decimal("52819"), q2_budget=Decimal("50000"),
        q3_budget=Decimal("0"), q4_budget=Decimal("0"),
    ),
    dict(
        code="1.1.1.2.b",
        description="Travel for BIORAP assessment",
        output="1.1.1", fund="GEF/TF", gl_account="71600",
        budget_usd=Decimal("105000"), q1_budget=Decimal("70000"), q2_budget=Decimal("0"),
        q3_budget=Decimal("35000"), q4_budget=Decimal("0"),
    ),
    dict(
        code="1.1.1.2.c",
        description="Development of awareness materials by NGO",
        output="1.1.1", fund="LDCF", gl_account="72100",
        budget_usd=Decimal("3000"), q1_budget=Decimal("0"), q2_budget=Decimal("3000"),
        q3_budget=Decimal("0"), q4_budget=Decimal("0"),
    ),
    dict(
        code="1.1.1.2.d",
        description="Mapping of newly created and existing Protected Areas in all project sites",
        output="1.1.1", fund="GEF/TF", gl_account="71600",
        budget_usd=Decimal("5000"), q1_budget=Decimal("2500"), q2_budget=Decimal("2500"),
        q3_budget=Decimal("0"), q4_budget=Decimal("0"),
    ),
    dict(
        code="1.1.1.3.a",
        description="Community meetings & awareness for CCAs / Marine Protected Areas",
        output="1.1.1", fund="GEF/TF", gl_account="75700",
        budget_usd=Decimal("6000"), q1_budget=Decimal("1500"), q2_budget=Decimal("2500"),
        q3_budget=Decimal("2000"), q4_budget=Decimal("0"),
    ),
    dict(
        code="1.1.1.4.a",
        description="National Protected Area Planning Workshop",
        output="1.1.1", fund="GEF/TF", gl_account="75700",
        budget_usd=Decimal("5000"), q1_budget=Decimal("2000"), q2_budget=Decimal("3000"),
        q3_budget=Decimal("0"), q4_budget=Decimal("0"),
    ),
    dict(
        code="1.1.1.4.b",
        description="Local meetings with communities",
        output="1.1.1", fund="GEF/TF", gl_account="75700",
        budget_usd=Decimal("1000"), q1_budget=Decimal("1000"), q2_budget=Decimal("0"),
        q3_budget=Decimal("0"), q4_budget=Decimal("0"),
    ),
    dict(
        code="1.1.1.5.a",
        description="Detailed Management Plan Assessment and Preparation by NGO",
        output="1.1.1", fund="LDCF", gl_account="72100",
        budget_usd=Decimal("11900"), q1_budget=Decimal("3950"), q2_budget=Decimal("4000"),
        q3_budget=Decimal("3950"), q4_budget=Decimal("0"),
    ),
    dict(
        code="1.1.1.5.b",
        description="Management Plan Implementation by NGO for 6 PA sites",
        output="1.1.1", fund="LDCF", gl_account="72100",
        budget_usd=Decimal("60000"), q1_budget=Decimal("20000"), q2_budget=Decimal("20000"),
        q3_budget=Decimal("20000"), q4_budget=Decimal("0"),
    ),
    dict(
        code="1.1.2.1.a",
        description="Community PA management planning (FPIC process)",
        output="1.1.2", fund="GEF/TF", gl_account="75700",
        budget_usd=Decimal("6000"), q1_budget=Decimal("2000"), q2_budget=Decimal("2000"),
        q3_budget=Decimal("2000"), q4_budget=Decimal("0"),
    ),
    dict(
        code="1.1.2.1.b",
        description="GESI-responsive community activities",
        output="1.1.2", fund="GEF/TF", gl_account="75700",
        budget_usd=Decimal("2000"), q1_budget=Decimal("1000"), q2_budget=Decimal("1000"),
        q3_budget=Decimal("0"), q4_budget=Decimal("0"),
    ),
    dict(
        code="1.1.2.2.a",
        description="Meetings to draft & validate participatory community management plans",
        output="1.1.2", fund="GEF/TF", gl_account="75700",
        budget_usd=Decimal("1000"), q1_budget=Decimal("500"), q2_budget=Decimal("500"),
        q3_budget=Decimal("0"), q4_budget=Decimal("0"),
    ),
    dict(
        code="1.1.2.2.b",
        description="Review of PA management plans (8 sites)",
        output="1.1.2", fund="GEF/TF", gl_account="75700",
        budget_usd=Decimal("6000"), q1_budget=Decimal("2000"), q2_budget=Decimal("2000"),
        q3_budget=Decimal("2000"), q4_budget=Decimal("0"),
    ),
    dict(
        code="1.1.2.2.c",
        description="METT consultations in all 6 provinces",
        output="1.1.2", fund="GEF/TF", gl_account="75700",
        budget_usd=Decimal("6000"), q1_budget=Decimal("2000"), q2_budget=Decimal("2000"),
        q3_budget=Decimal("2000"), q4_budget=Decimal("0"),
    ),
    dict(
        code="1.1.2.2.d",
        description="Implementation of PA Action Plans in all provinces",
        output="1.1.2", fund="GEF/TF", gl_account="75700",
        budget_usd=Decimal("6000"), q1_budget=Decimal("2000"), q2_budget=Decimal("2000"),
        q3_budget=Decimal("2000"), q4_budget=Decimal("0"),
    ),
    dict(
        code="1.1.2.5.a",
        description="Launching of PA management plans in 6 provinces (incl. signboards)",
        output="1.1.2", fund="GEF/TF", gl_account="75700",
        budget_usd=Decimal("20000"), q1_budget=Decimal("0"), q2_budget=Decimal("10000"),
        q3_budget=Decimal("10000"), q4_budget=Decimal("0"),
    ),
    dict(
        code="1.1.3.2.a",
        description="Community meetings with provincial govts for annual workplan",
        output="1.1.3", fund="GEF/TF", gl_account="75700",
        budget_usd=Decimal("1000"), q1_budget=Decimal("1000"), q2_budget=Decimal("0"),
        q3_budget=Decimal("0"), q4_budget=Decimal("0"),
    ),
    dict(
        code="3.2.1.1.b",
        description="National PA Specialist — Coastal Review",
        output="3.2.1", fund="GEF/TF", gl_account="71200",
        budget_usd=Decimal("8000"), q1_budget=Decimal("2000"), q2_budget=Decimal("2000"),
        q3_budget=Decimal("2000"), q4_budget=Decimal("2000"),
    ),
    dict(
        code="3.2.1.2.a",
        description="ICZM consultative meetings",
        output="3.2.1", fund="GEF/TF", gl_account="75700",
        budget_usd=Decimal("5000"), q1_budget=Decimal("1250"), q2_budget=Decimal("1250"),
        q3_budget=Decimal("1250"), q4_budget=Decimal("1250"),
    ),
    dict(
        code="3.3.x",
        description="Climate change community trainings (coastal zones)",
        output="3.2.1", fund="GEF/TF", gl_account="75700",
        budget_usd=Decimal("20000"), q1_budget=Decimal("5000"), q2_budget=Decimal("5000"),
        q3_budget=Decimal("5000"), q4_budget=Decimal("5000"),
    ),
    # Activity 21 — staffing line
    dict(
        code="1.1.1.1.m",
        description="Fisheries Component Coordinator (Betgy Boedovo, 18 months, starts 3 Jul 2026)",
        output="1.1.1", fund="GEF/TF", gl_account="71800",
        budget_usd=Decimal("20642"),
        q1_budget=Decimal("0"),
        q2_budget=Decimal("5160.50"),
        q3_budget=Decimal("5160.50"),
        q4_budget=Decimal("5160.50"),
        responsible="Betgy Boedovo",
        notes="18 months starting 3 Jul 2026",
    ),
]

# ── Indicator seed data ───────────────────────────────────────────────────────
INDICATORS = [
    dict(code="2.1", name="Marine protected areas newly created",
         baseline_ha=Decimal("192"), target_ha=Decimal("191.5"), unit="ha"),
    dict(code="2.2", name="Marine PAs under improved management",
         baseline_ha=Decimal("284"), target_ha=Decimal("741"), unit="ha"),
    dict(code="CI5", name="Marine habitat under improved practices",
         baseline_ha=Decimal("0"), target_ha=Decimal("2000"), unit="ha"),
    dict(code="5.1", name="Local species action plans developed & implemented",
         baseline_ha=Decimal("0"), target_ha=Decimal("2"), unit="plans"),
]


def seed():
    db = SessionLocal()
    try:
        # ── Activities ────────────────────────────────────────────────────────
        existing_codes = {a.code for a in db.query(models.Activity.code).all()}
        added_activities = 0
        for data in ACTIVITIES:
            if data["code"] not in existing_codes:
                activity = models.Activity(**data)
                db.add(activity)
                added_activities += 1
        db.flush()
        print(f"Activities seeded: {added_activities} new rows")

        # ── Indicators ────────────────────────────────────────────────────────
        existing_ind_codes = {i.code for i in db.query(models.Indicator.code).all()}
        added_indicators = 0
        for data in INDICATORS:
            if data["code"] not in existing_ind_codes:
                indicator = models.Indicator(**data)
                db.add(indicator)
                added_indicators += 1
        db.flush()
        print(f"Indicators seeded: {added_indicators} new rows")

        # ── Admin user ────────────────────────────────────────────────────────
        admin_username = os.getenv("FIRST_ADMIN_USER", "admin")
        admin_password = os.getenv("FIRST_ADMIN_PASSWORD", "changeme")

        existing_user = db.query(models.User).filter(
            models.User.username == admin_username
        ).first()

        if not existing_user:
            admin_user = models.User(
                username=admin_username,
                hashed_password=get_password_hash(admin_password),
                is_active=True,
            )
            db.add(admin_user)
            print(f"Admin user '{admin_username}' created")
        else:
            print(f"Admin user '{admin_username}' already exists — skipping")

        db.commit()
        print("Seed complete.")

    except Exception as exc:
        db.rollback()
        print(f"Seed failed: {exc}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
