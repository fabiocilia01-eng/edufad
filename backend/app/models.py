from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), default="editor")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    disclaimer_ack_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Profile(Base):
    __tablename__ = "profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(150))
    date_of_birth: Mapped[date] = mapped_column(Date)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    assessments: Mapped[list["Assessment"]] = relationship(back_populates="profile")


class Assessment(Base):
    __tablename__ = "assessments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("profiles.id"))
    assessment_date: Mapped[date] = mapped_column(Date)
    created_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    updated_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    operator_name: Mapped[str] = mapped_column(String(150))
    operator_role: Mapped[str] = mapped_column(String(80))
    present_user_ids: Mapped[list[int] | None] = mapped_column(JSON, nullable=True)
    present_other: Mapped[str | None] = mapped_column(Text, nullable=True)
    session_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    profile: Mapped["Profile"] = relationship(back_populates="assessments")
    responses: Mapped[list["Response"]] = relationship(back_populates="assessment", cascade="all, delete-orphan")
    summary: Mapped["Summary"] = relationship(back_populates="assessment", cascade="all, delete-orphan", uselist=False)
    plans: Mapped[list["Plan"]] = relationship(back_populates="assessment", cascade="all, delete-orphan")


class Response(Base):
    __tablename__ = "responses"
    __table_args__ = (UniqueConstraint("assessment_id", "item_id", name="uq_assessment_item"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    assessment_id: Mapped[int] = mapped_column(ForeignKey("assessments.id"))
    item_id: Mapped[str] = mapped_column(String(20))
    support: Mapped[int] = mapped_column(Integer)
    freq: Mapped[str | None] = mapped_column(String(10), nullable=True)
    gen: Mapped[str | None] = mapped_column(String(10), nullable=True)
    context: Mapped[str | None] = mapped_column(Text, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    updated_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))

    assessment: Mapped["Assessment"] = relationship(back_populates="responses")


class Summary(Base):
    __tablename__ = "summaries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    assessment_id: Mapped[int] = mapped_column(ForeignKey("assessments.id"), unique=True)
    auto_text: Mapped[str] = mapped_column(Text)
    manual_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    manual_edited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    assessment: Mapped["Assessment"] = relationship(back_populates="summary")


class Plan(Base):
    __tablename__ = "plans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    assessment_id: Mapped[int] = mapped_column(ForeignKey("assessments.id"))
    version: Mapped[int] = mapped_column(Integer, default=1)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    generated_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    content_json: Mapped[str] = mapped_column(Text)
    content_text: Mapped[str] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    assessment: Mapped["Assessment"] = relationship(back_populates="plans")


class WorkGroup(Base):
    __tablename__ = "work_groups"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(150))
    item_id: Mapped[str] = mapped_column(String(20))
    area_id: Mapped[str] = mapped_column(String(50))
    support_min: Mapped[int] = mapped_column(Integer)
    support_max: Mapped[int] = mapped_column(Integer)
    created_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="active")

    members: Mapped[list["GroupMember"]] = relationship(back_populates="group", cascade="all, delete-orphan")
    assignees: Mapped[list["GroupAssignee"]] = relationship(back_populates="group", cascade="all, delete-orphan")


class GroupMember(Base):
    __tablename__ = "group_members"
    __table_args__ = (UniqueConstraint("group_id", "profile_id", name="uq_group_profile"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    group_id: Mapped[int] = mapped_column(ForeignKey("work_groups.id"))
    profile_id: Mapped[int] = mapped_column(ForeignKey("profiles.id"))
    last_support: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_assessment_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    group: Mapped["WorkGroup"] = relationship(back_populates="members")


class GroupAssignee(Base):
    __tablename__ = "group_assignees"
    __table_args__ = (UniqueConstraint("group_id", "user_id", name="uq_group_user"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    group_id: Mapped[int] = mapped_column(ForeignKey("work_groups.id"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))

    group: Mapped["WorkGroup"] = relationship(back_populates="assignees")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    action: Mapped[str] = mapped_column(String(50))
    entity_type: Mapped[str] = mapped_column(String(50))
    entity_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    details: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
