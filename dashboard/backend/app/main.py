import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from app.routers import activities, indicators, summary, auth

load_dotenv()

app = FastAPI(
    title="VCAP II Fisheries Dashboard API",
    version="1.0.0",
    description="API for the VCAP II Fisheries Component tracking dashboard",
)

# CORS — allow the Vite dev server and any deployed frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://frontend:5173", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(activities.router)
app.include_router(indicators.router)
app.include_router(summary.router)
app.include_router(auth.router)


@app.get("/")
def root():
    return {"message": "VCAP II Fisheries Dashboard API", "docs": "/docs"}
