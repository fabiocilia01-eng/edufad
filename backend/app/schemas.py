from __future__ import annotations

from datetime import date, datetime
from typing import List, Optional, Literal

from pydantic import BaseModel, ConfigDict, Field


# =========================
# Auth
# =========================
class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


# =========================
# Users
# =========================
class UserBasic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    role: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    role: str
    is_active: bool = True
    disclaimer_ack_at: Optional[datetime] = None


class UserCreate(BaseModel):
    username: str = Field(..., min_length=1)
    password: str = Field(..., min_length=1)
    role: str = Field("editor")


# =========================
# Profiles
# =========================
class ProfileCreate(BaseModel):
    code: str = Field(..., min_length=1)
    display_name: str = Field(..., min_length=1)
    date_of_birth: date


class ProfileUpdate(BaseModel):
    code: Optional[str] = None
    display_name: Optional[str] = None
    date_of_birth: Optional[date] = None


class ProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    display_name: str
    date_of_birth: date
    created_at: Optional[datetime] = None


# =========================
# Assessments
# =========================
AssessmentStatus = Literal["draft", "finalized"]


class AssessmentCreate(BaseModel):
    profile_id: int
    assessment_date: date
    status: AssessmentStatus = "draft"
    operator_name: Optional[str] = None
    operator_role: Optional[str] = None

    present_user_ids: Optional[List[int]] = None
    present_other: Optional[str] = None
    session_notes: Optional[str] = None


class AssessmentUpdate(BaseModel):
    profile_id: Optional[int] = None
    assessment_date: Optional[date] = None
    status: Optional[AssessmentStatus] = None
    operator_name: Optional[str] = None
    operator_role: Optional[str] = None

    present_user_ids: Optional[List[int]] = None
    present_other: Optional[str] = None
    session_notes: Optional[str] = None


class AssessmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    profile_id: int
    assessment_date: date
    status: AssessmentStatus

    operator_name: Optional[str] = None
    operator_role: Optional[str] = None

    present_user_ids: Optional[List[int]] = None
    present_other: Optional[str] = None
    session_notes: Optional[str] = None

    is_deleted: bool = False
    created_by_id: Optional[int] = None
    updated_by_id: Optional[int] = None
    deleted_by_id: Optional[int] = None
    deleted_at: Optional[datetime] = None

    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


# =========================
# Responses + Summary + Plans
# =========================
class ResponseCreate(BaseModel):
    item_id: str = Field(..., min_length=1)
    support: int = Field(..., ge=0, le=3)
    freq: Optional[str] = None
    gen: Optional[str] = None
    context: Optional[str] = None
    note: Optional[str] = None


class ResponseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    assessment_id: int
    item_id: str
    support: int
    freq: Optional[str] = None
    gen: Optional[str] = None
    context: Optional[str] = None
    note: Optional[str] = None
    updated_by_id: Optional[int] = None


class SummaryUpdate(BaseModel):
    manual_text: Optional[str] = None


class SummaryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    assessment_id: int
    auto_text: Optional[str] = None
    manual_text: Optional[str] = None
    manual_edited_at: Optional[datetime] = None
    last_generated_at: Optional[datetime] = None


class PlanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    assessment_id: int
    version: int
    content_json: Optional[dict] = None
    content_text: str
    is_active: bool = True
    generated_by_id: Optional[int] = None
    generated_at: Optional[datetime] = None


# =========================
# Work groups
# =========================
class WorkGroupCreate(BaseModel):
    title: str
    item_id: str
    area_id: str
    support_min: int = 0
    support_max: int = 1
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    notes: Optional[str] = None
    status: str = "active"

    member_profile_ids: List[int] = Field(default_factory=list)
    assignee_user_ids: List[int] = Field(default_factory=list)


class WorkGroupUpdate(BaseModel):
    title: Optional[str] = None
    item_id: Optional[str] = None
    area_id: Optional[str] = None
    support_min: Optional[int] = None
    support_max: Optional[int] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    notes: Optional[str] = None
    status: Optional[str] = None

    member_profile_ids: Optional[List[int]] = None
    assignee_user_ids: Optional[List[int]] = None


class WorkGroupOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    item_id: str
    area_id: str
    support_min: int
    support_max: int
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    notes: Optional[str] = None
    status: str

    created_by_id: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    members: List[int] = Field(default_factory=list)
    assignees: List[int] = Field(default_factory=list)


# =========================
# Audit (minimo)
# =========================
class AuditOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    actor_user_id: Optional[int] = None
    action: str
    entity_type: Optional[str] = None
    entity_id: Optional[int] = None
    details: Optional[str] = None
