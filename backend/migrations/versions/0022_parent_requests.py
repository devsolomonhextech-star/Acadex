"""Add parent request threads and their messages."""
import sqlalchemy as sa
from alembic import op

revision = "0022_parent_requests"
down_revision = "0021_mobile_push_devices"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "parent_requests",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("school_id", sa.Uuid(), nullable=False),
        sa.Column("reference", sa.String(length=12), nullable=False),
        sa.Column("student_id", sa.Uuid(), nullable=True),
        sa.Column("guardian_id", sa.Uuid(), nullable=False),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=False),
        sa.Column("topic", sa.String(length=24), nullable=False),
        sa.Column("subject", sa.String(length=160), nullable=False),
        sa.Column("status", sa.String(length=24), server_default="open", nullable=False),
        sa.Column("last_message_by", sa.String(length=12), server_default="parent", nullable=False),
        sa.Column("last_message_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_message_preview", sa.String(length=200), server_default="", nullable=False),
        sa.Column("parent_last_read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("school_last_read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("first_school_reply_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["school_id"], ["schools.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["resolved_by_user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["school_id", "student_id"], ["students.school_id", "students.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["school_id", "guardian_id"], ["guardians.school_id", "guardians.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("school_id", "id", name="uq_parent_requests_school_id"),
        sa.UniqueConstraint("school_id", "reference", name="uq_parent_requests_reference"),
        sa.CheckConstraint(
            "status IN ('open', 'awaiting_parent', 'resolved')", name="ck_parent_requests_status"
        ),
        sa.CheckConstraint(
            "topic IN ('absence', 'documents', 'meeting', 'fees', 'details', 'other')",
            name="ck_parent_requests_topic",
        ),
        sa.CheckConstraint(
            "last_message_by IN ('parent', 'school')", name="ck_parent_requests_last_sender"
        ),
    )
    op.create_index(
        "ix_parent_requests_school_status",
        "parent_requests",
        ["school_id", "status", "last_message_at"],
    )
    op.create_index(
        "ix_parent_requests_guardian", "parent_requests", ["guardian_id", "last_message_at"]
    )

    op.create_table(
        "parent_request_messages",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("school_id", sa.Uuid(), nullable=False),
        sa.Column("request_id", sa.Uuid(), nullable=False),
        sa.Column("author_user_id", sa.Uuid(), nullable=False),
        sa.Column("author_role", sa.String(length=12), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["school_id"], ["schools.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["author_user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["school_id", "request_id"],
            ["parent_requests.school_id", "parent_requests.id"],
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(
            "author_role IN ('parent', 'school')", name="ck_parent_request_messages_author"
        ),
    )
    op.create_index(
        "ix_parent_request_messages_thread",
        "parent_request_messages",
        ["school_id", "request_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_parent_request_messages_thread", table_name="parent_request_messages")
    op.drop_table("parent_request_messages")
    op.drop_index("ix_parent_requests_guardian", table_name="parent_requests")
    op.drop_index("ix_parent_requests_school_status", table_name="parent_requests")
    op.drop_table("parent_requests")
