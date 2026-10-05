# backend/routes/meetings.py
import json
import uuid
from pathlib import Path
from typing import List
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from backend.models import MeetingModel
from backend.services.document_generator import generate_docx

router = APIRouter(prefix="/api/meetings", tags=["Meetings"])

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
MEETINGS_DIR = ROOT_DIR / "data" / "meetings"
MEETINGS_DIR.mkdir(parents=True, exist_ok=True)


def _load_meeting_file(file_path: Path) -> dict:
    """Read a meeting JSON file, returning {} on any parse error."""
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


@router.get("", response_model=List[dict])
def get_all_meetings():
    """Retrieves all stored meeting records from data/meetings/."""
    meetings = []
    for file_path in sorted(MEETINGS_DIR.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
        data = _load_meeting_file(file_path)
        if data:
            meetings.append(data)
    return meetings


@router.get("/{meeting_id}")
def get_single_meeting(meeting_id: str):
    """Retrieves a single meeting record by its ID."""
    file_path = MEETINGS_DIR / f"{meeting_id}.json"
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Minit mesyuarat tidak dijumpai.")
    data = _load_meeting_file(file_path)
    if not data:
        raise HTTPException(status_code=500, detail="Gagal membaca rekod minit.")
    return data


_EMPTY_TITLES = {"", "draf tanpa tajuk", "mesyuarat tanpa tajuk"}

def _is_empty_draft(meeting: MeetingModel) -> bool:
    """
    Returns True when a payload carries no meaningful content.
    Used to silently reject blank form submissions that originate from
    'Minit Baharu' being opened and immediately navigated away from.
    """
    title = (meeting.meeting_title or "").strip().lower()
    if title not in _EMPTY_TITLES:
        return False   # has a real title → always save
    if meeting.participants and any((p.name or "").strip() for p in meeting.participants):
        return False
    if meeting.agenda_items and any((a.title or "").strip() for a in meeting.agenda_items):
        return False
    if meeting.action_items:
        return False
    if (meeting.matters_arising or "").strip():
        return False
    return True


@router.post("/save")
def save_meeting_record(meeting: MeetingModel):
    """
    Upsert a meeting record as JSON.

    ID contract
    -----------
    - If the payload already carries an `id`, that file is overwritten in-place.
    - If `id` is absent/null, a fresh `meet_<8hex>` is minted once.

    Empty-draft guard
    -----------------
    Payloads with a default/blank title AND no participants/agenda/action items
    are silently skipped — no file is written.
    """
    # ── Reject empty drafts ───────────────────────────────────────────────────
    if _is_empty_draft(meeting):
        return {"status": "skipped", "message": "Ignored empty draft"}

    # ── Stable ID ─────────────────────────────────────────────────────────────
    meeting_id = (meeting.id or "").strip()
    if not meeting_id:
        meeting_id = f"meet_{uuid.uuid4().hex[:8]}"
    meeting.id = meeting_id

    # ── Serialise (Pydantic validator has already normalised participants) ────
    data = meeting.model_dump()

    # ── Write / overwrite the single canonical file ──────────────────────────
    file_path = MEETINGS_DIR / f"{meeting_id}.json"
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    return {"status": "success", "id": meeting_id, "data": data}


@router.get("/{meeting_id}/export")
def export_meeting_docx(meeting_id: str):
    """Generates and streams a PKPA-formatted .docx file for the given meeting."""
    file_path = MEETINGS_DIR / f"{meeting_id}.json"
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Minit mesyuarat tidak dijumpai.")
    meeting_data = _load_meeting_file(file_path)
    if not meeting_data:
        raise HTTPException(status_code=500, detail="Gagal membaca rekod minit.")

    docx_bytes = generate_docx(meeting_data)
    safe_title = (meeting_data.get("meeting_title") or "minit_mesyuarat").strip()
    # Sanitise filename — keep alphanumerics, spaces, hyphens only
    safe_title = "".join(c if c.isalnum() or c in " -_" else "_" for c in safe_title)[:60]
    filename   = f"{safe_title}.docx"

    return Response(
        content     = docx_bytes,
        media_type  = "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers     = {"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.delete("/{meeting_id}")
def delete_meeting_record(meeting_id: str):
    """Deletes a meeting file by its ID."""
    file_path = MEETINGS_DIR / f"{meeting_id}.json"
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Minit tidak dijumpai.")
    file_path.unlink()
    return {"status": "deleted", "id": meeting_id}
