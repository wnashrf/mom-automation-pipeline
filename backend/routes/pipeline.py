import uuid
import shutil
import json
import os
import hashlib
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, HTTPException, Form
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel
from huggingface_hub import constants

from scripts.whisper_engine import MeetingTranscriber
from scripts.extraction_agent import run_extraction

router = APIRouter(prefix="/api", tags=["Pipeline"])

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
UPLOADS_DIR = ROOT_DIR / "data" / "uploads"
TRANSCRIPTS_DIR = ROOT_DIR / "data" / "transcripts"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
TRANSCRIPTS_DIR.mkdir(parents=True, exist_ok=True)

# Cache transcriber instances in memory so models are not reloaded on every request
transcriber_instances = {}

def get_transcriber(model_size: str) -> MeetingTranscriber:
    if model_size not in transcriber_instances:
        transcriber_instances[model_size] = MeetingTranscriber(model_size=model_size)
    return transcriber_instances[model_size]

def format_timestamp(seconds: float) -> str:
    """Converts a float seconds value to a [MM:SS] timestamp string."""
    total_seconds = int(seconds)
    minutes = total_seconds // 60
    secs = total_seconds % 60
    return f"[{minutes:02d}:{secs:02d}]"

def get_file_hash(path: Path) -> str:
    """Returns a SHA-256 content hash (16 hex chars) of the given file."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()[:16]

def get_transcript_cache_path(transcript_id: str) -> Path:
    return TRANSCRIPTS_DIR / f"{transcript_id}.txt"

def is_model_cached(model_size: str) -> bool:
    """Checks whether the faster-whisper model weights exist locally in Hugging Face cache."""
    repo_map = {
        "tiny": "Systran/faster-whisper-tiny",
        "base": "Systran/faster-whisper-base",
        "small": "Systran/faster-whisper-small",
        "large-v3-turbo": "deepdml/faster-whisper-large-v3-turbo",
    }
    repo_id = repo_map.get(model_size, f"Systran/faster-whisper-{model_size}")
    folder_name = "models--" + repo_id.replace("/", "--")
    
    hf_cache_dir = Path(os.getenv("HF_HOME", constants.HF_HUB_CACHE))
    model_dir = hf_cache_dir / folder_name
    return model_dir.exists() and (model_dir / "snapshots").exists()

class ExtractPayload(BaseModel):
    transcript: str

@router.get("/transcript/{transcript_id}")
async def get_cached_transcript(transcript_id: str):
    """
    Retrieve a previously transcribed result by its content-hash ID.
    The frontend stores only this short ID in sessionStorage; the actual
    transcript text never lives in the browser.
    """
    # Validate ID format to prevent path traversal
    if not transcript_id.isalnum() or len(transcript_id) != 16:
        raise HTTPException(status_code=400, detail="ID transkrip tidak sah.")

    cache_path = get_transcript_cache_path(transcript_id)
    if not cache_path.exists():
        raise HTTPException(status_code=404, detail="Transkrip tidak dijumpai.")

    text = cache_path.read_text(encoding="utf-8")
    return JSONResponse({"transcript_id": transcript_id, "transcript": text})

@router.post("/transcribe")
async def transcribe_audio_file(
    file: UploadFile = File(...),
    model_size: str = Form("base")
):
    file_id = str(uuid.uuid4())[:8]
    saved_path = UPLOADS_DIR / f"{file_id}_{file.filename}"

    with open(saved_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    def event_generator():
        try:
            # --- Compute content hash and check transcript cache ---
            transcript_id = get_file_hash(saved_path)
            cache_path = get_transcript_cache_path(transcript_id)

            if cache_path.exists():
                # Cache hit: skip Whisper entirely, stream back the saved result
                cached_text = cache_path.read_text(encoding="utf-8")
                yield f"data: {json.dumps({'type': 'complete', 'transcript': cached_text, 'transcript_id': transcript_id, 'filename': file.filename, 'cached': True})}\n\n"
                return

            # --- Cache miss: run Whisper ---
            if not is_model_cached(model_size):
                yield f"data: {json.dumps({'type': 'status', 'stage': 'downloading', 'message': f'Memuat turun model Whisper ({model_size})...'})}\n\n"

            engine = get_transcriber(model_size)

            full_text_parts = []
            segments, info = engine.model.transcribe(str(saved_path), beam_size=1)
            total_duration = info.duration if info and info.duration else 1.0

            for segment in segments:
                text_piece = segment.text.strip()
                if not text_piece:
                    continue

                start_time = float(segment.start)
                end_time = float(segment.end)
                timestamp = format_timestamp(start_time)
                formatted_line = f"{timestamp} {text_piece}"
                full_text_parts.append(formatted_line)

                progress_val = min(99, int((end_time / total_duration) * 100))

                payload = {
                    "type": "progress",
                    "progress": progress_val,
                    "text": formatted_line,
                    "currentTime": round(end_time, 1),
                    "totalTime": round(total_duration, 1)
                }
                yield f"data: {json.dumps(payload)}\n\n"

            full_transcript = '\n'.join(full_text_parts)

            # Persist transcript to disk cache
            cache_path.write_text(full_transcript, encoding="utf-8")

            # Final completed event — includes transcript_id for the frontend to store
            yield f"data: {json.dumps({'type': 'complete', 'transcript': full_transcript, 'transcript_id': transcript_id, 'filename': file.filename})}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

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