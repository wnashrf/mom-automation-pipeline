# backend/services/formatter.py
from datetime import datetime
from typing import Dict, Any, List

def format_malay_date(date_str: str) -> str:
    """Formats ISO date (YYYY-MM-DD) into standard Malay official date format."""
    if not date_str:
        return "-"
    months_ms = {
        1: "Januari", 2: "Februari", 3: "Mac", 4: "April",
        5: "Mei", 6: "Jun", 7: "Julai", 8: "Ogos",
        9: "September", 10: "Oktober", 11: "November", 12: "Disember"
    }
    try:
        dt = datetime.strptime(date_str.strip(), "%Y-%m-%d")
        return f"{dt.day} {months_ms[dt.month]} {dt.year}"
    except Exception:
        return date_str

def format_agenda_items(agenda_items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Normalizes agenda item numbers and actions for PKPA compliance."""
    formatted = []
    for idx, item in enumerate(agenda_items, start=1):
        formatted.append({
            "index": idx,
            "title": item.get("title", f"Perkara {idx}"),
            "discussion": item.get("discussion", ""),
            "action_by": item.get("action_by", "Makluman")
        })
    return formatted