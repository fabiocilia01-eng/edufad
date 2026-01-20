from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserBase(BaseModel):
    username: str
    role: str
    is_active: bool


class UserCreate(BaseModel):
    username: str
    password: str
    role: str = "editor"


class UserOut(UserBase):
    id: int
    created_at: datetime
    disclaimer_ack_at: Optional[datetime] = None

    class Config:
        orm_mode = True


class UserBasic(BaseModel):
    id: int
    username: str
    role: str
    is_active: bool

    class Config:
        orm_mode = True


class ProfileBase(BaseModel):
    code: str
    display_name: str
    date_of_birth: date
    notes: Optional[str] = None


class ProfileCreate(ProfileBase):
    pass


class ProfileUpdate(BaseModel):
    display_name: Optional[str] = None
    date_of_birth: Optional[date] = None
    notes: Optional[str] = None


class ProfileOut(ProfileBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        orm_mode = True


class AssessmentBase(BaseModel):
    profile_id: int
    assessment_date: date
    operator_name: str
    operator_role: str
    present_user_ids: Optional[List[int]] = None
    present_other: Optional[str] = None
    session_notes: Optional[str] = None
    stato: str = Field("bozza", pattern="^(bozza|finalizzato)$")



class AssessmentCreate(AssessmentBase):
    pass


class AssessmentUpdate(BaseModel):
    assessment_date: Optional[date] = None
    operator_name: Optional[str] = None
    operator_role: Optional[str] = None
    present_user_ids: Optional[List[int]] = None
    present_other: Optional[str] = None
    session_notes: Optional[str] = None
    status: Optional[str] = Field(None, regex="^(draft|finalized)$")


class AssessmentOut(AssessmentBase):
    id: int
    created_by_id: int
    updated_by_id: Optional[int]
    created_at: datetime
    updated_at: datetime
    is_deleted: bool

    class Config:
        orm_mode = True


class ResponseBase(BaseModel):
    item_id: str
    support: int = Field(ge=0, le=3)
    freq: Optional[str] = Field(None, regex="^F[0-4]$")
    gen: Optional[str] = Field(None, regex="^G[0-3]$")
    context: Optional[str] = None
    note: Optional[str] = None


class ResponseCreate(ResponseBase):
    pass


class ResponseOut(ResponseBase):
    id: int
    assessment_id: int
    updated_at: datetime
    updated_by_id: int

    class Config:
        orm_mode = True


class SummaryOut(BaseModel):
    auto_text: str
    manual_text: Optional[str] = None
    manual_edited_at: Optional[datetime] = None
    last_generated_at: datetime

    class Config:
        orm_mode = True


class SummaryUpdate(BaseModel):
    manual_text: Optional[str] = None


class PlanOut(BaseModel):
    id: int
    version: int
    generated_at: datetime
    generated_by_id: int
    content_json: str
    content_text: str
    is_active: bool

    class Config:
        orm_mode = True


class WorkGroupBase(BaseModel):
    title: str
    item_id: str
    area_id: str
    support_min: int
    support_max: int
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    notes: Optional[str] = None
    status: str = "active"


class WorkGroupCreate(WorkGroupBase):
    member_profile_ids: List[int] = []
    assignee_user_ids: List[int] = []


class WorkGroupUpdate(BaseModel):
    title: Optional[str] = None
    support_min: Optional[int] = None
    support_max: Optional[int] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    notes: Optional[str] = None
    status: Optional[str] = None
    member_profile_ids: Optional[List[int]] = None
    assignee_user_ids: Optional[List[int]] = None


class WorkGroupOut(WorkGroupBase):
    id: int
    created_by_id: int
    created_at: datetime
    updated_at: datetime
    members: List[int] = []
    assignees: List[int] = []

    class Config:
        orm_mode = True


class AuditOut(BaseModel):
    id: int
    user_id: Optional[int]
    action: str
    entity_type: str
    entity_id: Optional[int]
    details: Optional[str]
    created_at: datetime

    class Config:
        orm_mode = True
