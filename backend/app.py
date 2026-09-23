# backend/app.py
import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware

# Ensure root path is accessible
ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.append(str(ROOT_DIR))

from backend.routes import pipeline, meetings, export

app = FastAPI(
    title="Penjana Minit Mesyuarat API",
    version="1.0.0",
    description="Sistem Penjanaan Minit Rasmi Sektor Awam Malaysia"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register Modular Routers
app.include_router(pipeline.router)
app.include_router(meetings.router)
app.include_router(export.router)

# Mount Compiled React Static Bundle
STATIC_DIR = Path(__file__).resolve().parent / "static"
if STATIC_DIR.exists():
    app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")