"""initial

Revision ID: 0001_initial
Revises: 
Create Date: 2025-02-14 00:00:00
"""

from alembic import op
import sqlalchemy as sa


revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("username", sa.String(length=50), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("role", sa.String(length=20), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("disclaimer_ack_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_users_username"), "users", ["username"], unique=True)

    op.create_table(
        "profiles",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column("display_name", sa.String(length=150), nullable=False),
        sa.Column("date_of_birth", sa.Date(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_profiles_code"), "profiles", ["code"], unique=True)

    op.create_table(
        "assessments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("profile_id", sa.Integer(), nullable=False),
        sa.Column("assessment_date", sa.Date(), nullable=False),
        sa.Column("created_by_id", sa.Integer(), nullable=False),
        sa.Column("updated_by_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("operator_name", sa.String(length=150), nullable=False),
        sa.Column("operator_role", sa.String(length=80), nullable=False),
        sa.Column("present_user_ids", sa.JSON(), nullable=True),
        sa.Column("present_other", sa.Text(), nullable=True),
        sa.Column("session_notes", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("is_deleted", sa.Boolean(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_by_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["deleted_by_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["profile_id"], ["profiles.id"]),
        sa.ForeignKeyConstraint(["updated_by_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "responses",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("assessment_id", sa.Integer(), nullable=False),
        sa.Column("item_id", sa.String(length=20), nullable=False),
        sa.Column("support", sa.Integer(), nullable=False),
        sa.Column("freq", sa.String(length=10), nullable=True),
        sa.Column("gen", sa.String(length=10), nullable=True),
        sa.Column("context", sa.Text(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_by_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["assessment_id"], ["assessments.id"]),
        sa.ForeignKeyConstraint(["updated_by_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("assessment_id", "item_id", name="uq_assessment_item"),
    )

    op.create_table(
        "summaries",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("assessment_id", sa.Integer(), nullable=False),
        sa.Column("auto_text", sa.Text(), nullable=False),
        sa.Column("manual_text", sa.Text(), nullable=True),
        sa.Column("manual_edited_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_generated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["assessment_id"], ["assessments.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("assessment_id"),
    )

    op.create_table(
        "plans",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("assessment_id", sa.Integer(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("generated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("generated_by_id", sa.Integer(), nullable=False),
        sa.Column("content_json", sa.Text(), nullable=False),
        sa.Column("content_text", sa.Text(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["assessment_id"], ["assessments.id"]),
        sa.ForeignKeyConstraint(["generated_by_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "work_groups",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=150), nullable=False),
        sa.Column("item_id", sa.String(length=20), nullable=False),
        sa.Column("area_id", sa.String(length=50), nullable=False),
        sa.Column("support_min", sa.Integer(), nullable=False),
        sa.Column("support_max", sa.Integer(), nullable=False),
        sa.Column("created_by_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "group_members",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("group_id", sa.Integer(), nullable=False),
        sa.Column("profile_id", sa.Integer(), nullable=False),
        sa.Column("last_support", sa.Integer(), nullable=True),
        sa.Column("last_assessment_date", sa.Date(), nullable=True),
        sa.ForeignKeyConstraint(["group_id"], ["work_groups.id"]),
        sa.ForeignKeyConstraint(["profile_id"], ["profiles.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("group_id", "profile_id", name="uq_group_profile"),
    )

    op.create_table(
        "group_assignees",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("group_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["group_id"], ["work_groups.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("group_id", "user_id", name="uq_group_user"),
    )

    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("action", sa.String(length=50), nullable=False),
        sa.Column("entity_type", sa.String(length=50), nullable=False),
        sa.Column("entity_id", sa.Integer(), nullable=True),
        sa.Column("details", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade():
    op.drop_table("audit_logs")
    op.drop_table("group_assignees")
    op.drop_table("group_members")
    op.drop_table("work_groups")
    op.drop_table("plans")
    op.drop_table("summaries")
    op.drop_table("responses")
    op.drop_table("assessments")
    op.drop_index(op.f("ix_profiles_code"), table_name="profiles")
    op.drop_table("profiles")
    op.drop_index(op.f("ix_users_username"), table_name="users")
    op.drop_table("users")
