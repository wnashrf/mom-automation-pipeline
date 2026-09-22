# backend/routes/pipeline.py
import uuid
import shutil
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel

from scripts.whisper_engine import MeetingTranscriber
from scripts.extraction_agent import run_extraction

router = APIRouter(prefix="/api", tags=["Pipeline"])

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
UPLOADS_DIR = ROOT_DIR / "data" / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

# Initialize the transcriber once using the int8 large-v3-turbo engine
transcriber = MeetingTranscriber(model_size="large-v3-turbo")

class ExtractPayload(BaseModel):
    transcript: str

@router.post("/transcribe")
async def transcribe_audio_file(file: UploadFile = File(...)):
    """Saves incoming audio and executes faster-whisper (large-v3-turbo int8)."""
    file_id = str(uuid.uuid4())[:8]
    saved_path = UPLOADS_DIR / f"{file_id}_{file.filename}"

    with open(saved_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    try:
        segments = []
        full_text_parts = []
        for segment in transcriber.stream_transcribe(str(saved_path)):
            segments.append(segment)
            full_text_parts.append(segment["text"])

        transcript_text = " ".join(full_text_parts)

        return {
            "status": "success",
            "filename": file.filename,
            "transcript": transcript_text,
            "segments_count": len(segments),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ralat transkripsi: {str(e)}")

@router.post("/extract")
async def extract_meeting_minutes(payload: ExtractPayload):
    """Passes raw transcript to Claude Sonnet governed by mom-rules.md."""
    if not payload.transcript.strip():
        raise HTTPException(status_code=400, detail="Transkrip kosong.")

    try:
        extracted = run_extraction(payload.transcript)
        return {"status": "success", "data": extracted}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ralat pengekstrakan: {str(e)}")