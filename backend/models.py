# backend/models.py
from typing import List, Optional
from pydantic import BaseModel, Field

class ParticipantModel(BaseModel):
    label: str = ""
    department: Optional[str] = ""

class AgendaItemModel(BaseModel):
    title: str = ""
    summary: str = ""
    decision: Optional[str] = ""

class ActionItemModel(BaseModel):
    task: str = ""
    assignee: Optional[str] = "Belum Ditetapkan"
    deadline: Optional[str] = "-"
    status: Optional[str] = "Belum Mula"

class MeetingModel(BaseModel):
    id: Optional[str] = None
    meeting_title: str = "Mesyuarat Tanpa Tajuk"
    meeting_number: Optional[str] = ""
    location: Optional[str] = ""
    date: Optional[str] = ""
    start_time: Optional[str] = ""
    end_time: Optional[str] = ""
    chairperson_name: Optional[str] = ""
    chairperson_role: Optional[str] = ""
    status: Optional[str] = "Draf"
    
    # Missing models restored:
    participants: List[ParticipantModel] = Field(default_factory=list)
    agenda_items: List[AgendaItemModel] = Field(default_factory=list)
    action_items: List[ActionItemModel] = Field(default_factory=list)
    
    raw_transcript: Optional[str] = ""

    class Config:
        extra = "allow"