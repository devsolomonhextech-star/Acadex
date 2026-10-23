"""Add teacher invitations, subject assignments, and class attendance."""
import sqlalchemy as sa
from alembic import op

revision = "0004_teachers_attendance"
down_revision = "0003_academic_structure"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_unique_constraint("uq_memberships_school_id", "school_memberships", ["school_id", "id"])
    op.create_unique_constraint("uq_class_groups_school_id", "class_groups", ["school_id", "id"])
    op.create_table(
        "school_invitations",
        sa.Column("id", sa.Uuid(), nullable=False), sa.Column("school_id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(254), nullable=False), sa.Column("display_name", sa.String(160), nullable=False),
        sa.Column("role", sa.Enum("SCHOOL_ADMIN", "PRINCIPAL", "TEACHER", "FINANCE", "REGISTRAR", "PARENT", "STUDENT", "STAFF", name="membership_role", create_type=False), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False), sa.Column("status", sa.String(20), server_default="pending", nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False), sa.Column("accepted_at", sa.DateTime(timezone=True)),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["school_id"], ["schools.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"), sa.UniqueConstraint("token_hash"),
    )
    op.create_index("ix_invitations_school_email_status", "school_invitations", ["school_id", "email", "status"])
    op.create_table(
        "subjects",
        sa.Column("id", sa.Uuid(), nullable=False), sa.Column("school_id", sa.Uuid(), nullable=False),
        sa.Column("code", sa.String(24), nullable=False), sa.Column("name", sa.String(100), nullable=False),
        sa.Column("status", sa.String(20), server_default="active", nullable=False),
        sa.ForeignKeyConstraint(["school_id"], ["schools.id"], ondelete="RESTRICT"), sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("school_id", "code", name="uq_subjects_school_code"),
        sa.UniqueConstraint("school_id", "id", name="uq_subjects_school_id"),
    )
    op.create_index("ix_subjects_school_name", "subjects", ["school_id", "name"])
    op.create_table(
        "class_subject_assignments",
        sa.Column("id", sa.Uuid(), nullable=False), sa.Column("school_id", sa.Uuid(), nullable=False),
        sa.Column("class_group_id", sa.Uuid(), nullable=False), sa.Column("subject_id", sa.Uuid(), nullable=False),
        sa.Column("teacher_membership_id", sa.Uuid(), nullable=False), sa.Column("assigned_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["school_id", "class_group_id"], ["class_groups.school_id", "class_groups.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["school_id", "subject_id"], ["subjects.school_id", "subjects.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["school_id", "teacher_membership_id"], ["school_memberships.school_id", "school_memberships.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"), sa.UniqueConstraint("school_id", "class_group_id", "subject_id", "teacher_membership_id", name="uq_assignments_class_subject_teacher"),
    )
    op.create_index("ix_assignments_school_class", "class_subject_assignments", ["school_id", "class_group_id"])
    op.create_index("ix_assignments_teacher_class", "class_subject_assignments", ["school_id", "teacher_membership_id", "class_group_id"])
    op.create_table(
        "attendance_sessions",
        sa.Column("id", sa.Uuid(), nullable=False), sa.Column("school_id", sa.Uuid(), nullable=False),
        sa.Column("class_group_id", sa.Uuid(), nullable=False), sa.Column("attendance_date", sa.Date(), nullable=False),
        sa.Column("recorded_by_membership_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["school_id", "class_group_id"], ["class_groups.school_id", "class_groups.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["school_id", "recorded_by_membership_id"], ["school_memberships.school_id", "school_memberships.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"), sa.UniqueConstraint("school_id", "class_group_id", "attendance_date", name="uq_attendance_class_date"),
        sa.UniqueConstraint("school_id", "id", name="uq_attendance_sessions_school_id"),
    )
    op.create_index("ix_attendance_school_date", "attendance_sessions", ["school_id", "attendance_date"])
    op.create_table(
        "attendance_records",
        sa.Column("id", sa.Uuid(), nullable=False), sa.Column("school_id", sa.Uuid(), nullable=False),
        sa.Column("session_id", sa.Uuid(), nullable=False), sa.Column("student_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False), sa.Column("note", sa.String(240)),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["school_id", "session_id"], ["attendance_sessions.school_id", "attendance_sessions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["school_id", "student_id"], ["students.school_id", "students.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"), sa.UniqueConstraint("school_id", "session_id", "student_id", name="uq_attendance_record_student"),
        sa.CheckConstraint("status IN ('present', 'absent', 'late', 'excused')", name="ck_attendance_record_status"),
    )
    op.create_index("ix_attendance_records_school_student", "attendance_records", ["school_id", "student_id"])


def downgrade() -> None:
    op.drop_index("ix_attendance_records_school_student", table_name="attendance_records")
    op.drop_table("attendance_records")
    op.drop_index("ix_attendance_school_date", table_name="attendance_sessions")
    op.drop_table("attendance_sessions")
    op.drop_index("ix_assignments_teacher_class", table_name="class_subject_assignments")
    op.drop_index("ix_assignments_school_class", table_name="class_subject_assignments")
    op.drop_table("class_subject_assignments")
    op.drop_index("ix_subjects_school_name", table_name="subjects")
    op.drop_table("subjects")
    op.drop_index("ix_invitations_school_email_status", table_name="school_invitations")
    op.drop_table("school_invitations")
    op.drop_constraint("uq_class_groups_school_id", "class_groups", type_="unique")
    op.drop_constraint("uq_memberships_school_id", "school_memberships", type_="unique")
