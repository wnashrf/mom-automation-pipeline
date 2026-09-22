# backend/routes/export.py
import json
from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse

from backend.services.document_generator import generate_official_mom_html

router = APIRouter(prefix="/api/export", tags=["Export"])

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
MEETINGS_DIR = ROOT_DIR / "data" / "meetings"

@router.get("/{meeting_id}/html", response_class=HTMLResponse)
def export_meeting_html(meeting_id: str):
    """Renders the official government MoM layout as standalone HTML for printing or PDF save."""
    file_path = MEETINGS_DIR / f"{meeting_id}.json"
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Mesyuarat tidak dijumpai.")

    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    return generate_official_mom_html(data)