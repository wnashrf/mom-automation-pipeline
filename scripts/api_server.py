# scripts/api_server.py
import json
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="Meeting Minutes Ingestion API",
    version="1.0.0",
    description="API providing latest structured Minutes of Meeting extracted by Claude Sonnet"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

MOM_PATH = Path("data/extracted_mom.json")

@app.get("/api/v1/latest-mom", summary="Retrieve Latest Meeting Minutes")
def get_latest_mom():
    """Returns the most recent validated Minutes of Meeting JSON."""
    if not MOM_PATH.exists():
        raise HTTPException(status_code=404, detail="No extracted MoM found on disk.")
    with open(MOM_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

@app.get("/health", summary="Healthcheck")
def healthcheck():
    return {"status": "ok"}