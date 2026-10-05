# backend/models.py
from typing import List, Optional
from pydantic import BaseModel, Field, model_validator


class ParticipantModel(BaseModel):
    """
    Flexible participant record that survives both the legacy shape
    (label / department) and the new extraction shape
    (name / jawatan / organisation / status).

    model_validator normalises everything into a single canonical form
    so model_dump() always emits the full set of fields.
    """
    # Canonical fields (new schema)
    name: str = ""
    jawatan: str = ""
    organisation: str = ""
    status: str = "Hadir"

    # Legacy / alias fields — kept so existing JSON files round-trip safely
    label: Optional[str] = None
    department: Optional[str] = None
    position: Optional[str] = None
    role: Optional[str] = None

    class Config:
        extra = "allow"   # absorb any unexpected keys from older records

    @model_validator(mode="after")
    def _normalise(self) -> "ParticipantModel":
        """Merge legacy aliases into canonical fields, then clear the aliases."""
        # name: prefer canonical, fall back to legacy label
        if not self.name:
            self.name = self.label or ""
        # jawatan: prefer canonical, fall back to position / role
        if not self.jawatan:
            self.jawatan = self.position or self.role or ""
        # organisation: prefer canonical, fall back to department
        if not self.organisation:
            self.organisation = self.department or ""
        # Keep legacy mirrors in sync so old readers still work
        self.label = self.name
        self.department = self.organisation
        return self


class AgendaItemModel(BaseModel):
    title: str = ""
    summary: str = ""
    decision: Optional[str] = ""

    class Config:
        extra = "allow"


class ActionItemModel(BaseModel):
    task: str = ""
    assignee: Optional[str] = ""
    deadline: Optional[str] = ""
    status: Optional[str] = "Belum Mula"

    class Config:
        extra = "allow"


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
    secretary_name: Optional[str] = ""
    secretary_role: Optional[str] = ""
    matters_arising: Optional[str] = ""
    status: Optional[str] = "Draf"

    participants: List[ParticipantModel] = Field(default_factory=list)
    agenda_items: List[AgendaItemModel] = Field(default_factory=list)
    action_items: List[ActionItemModel] = Field(default_factory=list)

    raw_transcript: Optional[str] = ""

    class Config:
        extra = "allow"
