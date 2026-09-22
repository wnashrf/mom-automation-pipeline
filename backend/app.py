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

FRONTEND_DIR = ROOT_DIR / "frontend"
FRONTEND_DIR.mkdir(parents=True, exist_ok=True)

# Mount static asset directory
app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")

# Register Modular Routers
app.include_router(pipeline.router)
app.include_router(meetings.router)
app.include_router(export.router)

@app.get("/")
def serve_ui():
    return FileResponse(str(FRONTEND_DIR / "index.html"))