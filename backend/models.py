# backend/models.py
from typing import List, Optional
from pydantic import BaseModel

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