# backend/routes/meetings.py
import json
import uuid
from pathlib import Path
from typing import List
from fastapi import APIRouter, HTTPException

from backend.models import MeetingModel

router = APIRouter(prefix="/api/meetings", tags=["Meetings"])

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
MEETINGS_DIR = ROOT_DIR / "data" / "meetings"
MEETINGS_DIR.mkdir(parents=True, exist_ok=True)

@router.get("", response_model=List[dict])
def get_all_meetings():
    """Retrieves all stored meeting records from data/meetings/."""
    meetings = []
    for file_path in MEETINGS_DIR.glob("*.json"):
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                meetings.append(json.load(f))
        except Exception:
            continue
    return meetings

@router.get("/{meeting_id}")
def get_single_meeting(meeting_id: str):
    """Retrieves a single meeting record by its ID."""
    file_path = MEETINGS_DIR / f"{meeting_id}.json"
    if file_path.exists():
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)
    raise HTTPException(status_code=404, detail="Minit mesyuarat tidak dijumpai.")

@router.post("/save")
def save_meeting_record(meeting: MeetingModel):
    """Saves or updates a meeting record as JSON."""
    meeting_id = meeting.id or f"meet_{uuid.uuid4().hex[:8]}"
    meeting.id = meeting_id

    data = meeting.model_dump() if hasattr(meeting, "model_dump") else meeting.dict()

    file_path = MEETINGS_DIR / f"{meeting_id}.json"
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    return {"status": "success", "id": meeting_id, "data": data}

@router.delete("/{meeting_id}")
def delete_meeting_record(meeting_id: str):
    """Deletes a meeting file by its ID."""
    file_path = MEETINGS_DIR / f"{meeting_id}.json"
    if file_path.exists():
        file_path.unlink()
        return {"status": "deleted", "id": meeting_id}
    raise HTTPException(status_code=404, detail="Minit tidak dijumpai.")