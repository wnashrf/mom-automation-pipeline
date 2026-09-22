import os
import sys
import json
import uuid
import shutil
from pathlib import Path
from datetime import datetime
from typing import List, Optional

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Ensure project root is in Python path to import scripts cleanly
ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.append(str(ROOT_DIR))

from scripts.whisper_engine import run_transcription
from scripts.extraction_agent import run_extraction
from scripts.output_writer import write_mom_output

app = FastAPI(title="Penjana Minit Mesyuarat API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_DIR = ROOT_DIR / "data"
MEETINGS_DIR = DATA_DIR / "meetings"
UPLOADS_DIR = DATA_DIR / "uploads"
STATIC_DIR = ROOT_DIR / "static"

MEETINGS_DIR.mkdir(parents=True, exist_ok=True)
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
STATIC_DIR.mkdir(parents=True, exist_ok=True)

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

# --- Pydantic Models for Form Persistence ---

class ActionItemModel(BaseModel):
    task: str
    assignee: Optional[str] = "Belum Ditetapkan"
    deadline: Optional[str] = "-"
    status: Optional[str] = "Belum Mula"

class MeetingModel(BaseModel):
    id: Optional[str] = None
    meeting_title: str
    meeting_number: Optional[str] = ""
    location: Optional[str] = ""
    date: Optional[str] = ""
    start_time: Optional[str] = ""
    end_time: Optional[str] = ""
    chairperson_name: Optional[str] = ""
    chairperson_role: Optional[str] = ""
    status: Optional[str] = "Draf"
    action_items: List[ActionItemModel] = []
    raw_transcript: Optional[str] = ""

# --- Routes ---

@app.get("/")
def serve_ui():
    return FileResponse(str(STATIC_DIR / "index.html"))

@app.get("/api/meetings")
def get_all_meetings():
    meetings = []
    for file_path in MEETINGS_DIR.glob("*.json"):
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                meetings.append(data)
        except Exception:
            continue
    # Sort descending by creation date if available
    return meetings

@app.post("/api/transcribe")
async def transcribe_audio_file(file: UploadFile = File(...)):
    """Saves incoming audio and runs faster-whisper (large-v3-turbo int8)."""
    file_id = str(uuid.uuid4())[:8]
    ext = Path(file.filename).suffix
    saved_path = UPLOADS_DIR / f"{file_id}_{file.filename}"
    
    with open(saved_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    try:
        transcript_text, segments = run_transcription(str(saved_path), model_size="large-v3-turbo")
        return {
            "status": "success",
            "filename": file.filename,
            "transcript": transcript_text,
            "segments_count": len(segments)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ralat transkripsi: {str(e)}")

@app.post("/api/extract")
async def extract_meeting_minutes(payload: dict):
    """Passes raw transcript to Claude Sonnet steered by mom-rules.md."""
    transcript_text = payload.get("transcript", "")
    if not transcript_text.strip():
        raise HTTPException(status_code=400, detail="Transkrip kosong.")

    try:
        extracted = run_extraction(transcript_text)
        return {"status": "success", "data": extracted}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ralat pengekstrakan: {str(e)}")

@app.post("/api/meetings/save")
def save_meeting_record(meeting: MeetingModel):
    """Saves or updates a meeting record as JSON in data/meetings/."""
    meeting_id = meeting.id or f"meet_{uuid.uuid4().hex[:8]}"
    meeting.id = meeting_id
    
    file_path = MEETINGS_DIR / f"{meeting_id}.json"
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(meeting.dict(), f, indent=2, ensure_ascii=False)
        
    return {"status": "success", "id": meeting_id, "data": meeting.dict()}

@app.delete("/api/meetings/{meeting_id}")
def delete_meeting_record(meeting_id: str):
    file_path = MEETINGS_DIR / f"{meeting_id}.json"
    if file_path.exists():
        file_path.unlink()
        return {"status": "deleted"}
    raise HTTPException(status_code=404, detail="Minit tidak dijumpai.")