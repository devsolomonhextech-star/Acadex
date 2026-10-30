from datetime import UTC, date, datetime, time
from decimal import Decimal
from enum import StrEnum
from uuid import UUID, uuid4

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    Time,
    UniqueConstraint,
    Uuid,
    func,
    text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def utcnow() -> datetime:
    return datetime.now(UTC)


class Base(DeclarativeBase):
    pass


class MembershipRole(StrEnum):
    SCHOOL_ADMIN = "school_admin"
    PRINCIPAL = "principal"
    TEACHER = "teacher"
    FINANCE = "finance"
    REGISTRAR = "registrar"
    PARENT = "parent"
    STUDENT = "student"
    STAFF = "staff"


class School(Base):
    __tablename__ = "schools"
    __table_args__ = (UniqueConstraint("slug", name="uq_schools_slug"),)

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    slug: Mapped[str] = mapped_column(String(80), nullable=False)
    contact_phone: Mapped[str | None] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="active")
    trial_ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    memberships: Mapped[list["SchoolMembership"]] = relationship(back_populates="school")


class SchoolSubscription(Base):
    __tablename__ = "school_subscriptions"
    __table_args__ = (
        UniqueConstraint("school_id", name="uq_school_subscriptions_school"),
        CheckConstraint("student_limit >= 0", name="ck_school_subscriptions_student_limit"),
        CheckConstraint("status IN ('inactive', 'active')", name="ck_school_subscriptions_status"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id", ondelete="RESTRICT"), nullable=False)
    student_limit: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="inactive", server_default="inactive")
    current_period_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    current_period_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SubscriptionPayment(Base):
    __tablename__ = "subscription_payments"
    __table_args__ = (
        UniqueConstraint("reference", name="uq_subscription_payments_reference"),
        CheckConstraint("student_limit >= 1", name="ck_subscription_payments_student_limit"),
        CheckConstraint("amount_pesewas > 0", name="ck_subscription_payments_amount"),
        CheckConstraint("status IN ('pending', 'paid', 'failed')", name="ck_subscription_payments_status"),
        Index("ix_subscription_payments_school_created", "school_id", "created_at"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id", ondelete="RESTRICT"), nullable=False)
    created_by_user_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    reference: Mapped[str] = mapped_column(String(100), nullable=False)
    student_limit: Mapped[int] = mapped_column(Integer, nullable=False)
    amount_pesewas: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="GHS", server_default="GHS")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending", server_default="pending")
    checkout_url: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class User(Base):
    __tablename__ = "users"
    __table_args__ = (UniqueConstraint("email", name="uq_users_email"),)

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    email: Mapped[str] = mapped_column(String(254), nullable=False)
    display_name: Mapped[str] = mapped_column(String(160), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    totp_secret_encrypted: Mapped[str | None] = mapped_column(Text)
    totp_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))
    totp_last_counter: Mapped[int | None] = mapped_column(BigInteger)
    totp_setup_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    memberships: Mapped[list["SchoolMembership"]] = relationship(back_populates="user")


class AccountActionToken(Base):
    """Hashed, one-time email verification and password recovery tokens."""
    __tablename__ = "account_action_tokens"
    __table_args__ = (
        Index("ix_account_action_tokens_user_kind", "user_id", "kind", "expires_at"),
        CheckConstraint("kind IN ('email_verification', 'password_reset')", name="ck_account_action_tokens_kind"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SchoolMembership(Base):
    __tablename__ = "school_memberships"
    __table_args__ = (
        UniqueConstraint("school_id", "user_id", name="uq_memberships_school_user"),
        UniqueConstraint("school_id", "id", name="uq_memberships_school_id"),
        Index("ix_memberships_user_status", "user_id", "status"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id", ondelete="RESTRICT"), nullable=False)
    user_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    role: Mapped[MembershipRole] = mapped_column(Enum(MembershipRole, name="membership_role"), nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    school: Mapped[School] = relationship(back_populates="memberships")
    user: Mapped[User] = relationship(back_populates="memberships")


class RefreshSession(Base):
    __tablename__ = "refresh_sessions"
    __table_args__ = (
        Index("ix_refresh_sessions_user_expiry", "user_id", "expires_at"),
        Index("ix_refresh_sessions_family", "family_id"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id", ondelete="RESTRICT"), nullable=False)
    family_id: Mapped[UUID] = mapped_column(Uuid, nullable=False, default=uuid4)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class AuditEvent(Base):
    __tablename__ = "audit_events"
    __table_args__ = (Index("ix_audit_school_created", "school_id", "created_at"),)

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id", ondelete="RESTRICT"), nullable=False)
    actor_user_id: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="RESTRICT"))
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(80), nullable=False)
    resource_id: Mapped[UUID | None] = mapped_column(Uuid)
    details: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Student(Base):
    __tablename__ = "students"
    __table_args__ = (
        UniqueConstraint("school_id", "admission_number", name="uq_students_school_admission"),
        UniqueConstraint("school_id", "id", name="uq_students_school_id"),
        Index("ix_students_school_status_name", "school_id", "status", "last_name", "first_name"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id", ondelete="RESTRICT"), nullable=False)
    admission_number: Mapped[str] = mapped_column(String(40), nullable=False)
    first_name: Mapped[str] = mapped_column(String(80), nullable=False)
    last_name: Mapped[str] = mapped_column(String(80), nullable=False)
    date_of_birth: Mapped[date | None] = mapped_column(Date)
    gender: Mapped[str | None] = mapped_column(String(16))
    phone: Mapped[str | None] = mapped_column(String(40))
    email: Mapped[str | None] = mapped_column(String(254))
    user_id: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="RESTRICT"))
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="active", server_default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AcademicYear(Base):
    __tablename__ = "academic_years"
    __table_args__ = (
        UniqueConstraint("school_id", "name", name="uq_academic_years_school_name"),
        UniqueConstraint("school_id", "id", name="uq_academic_years_school_id"),
        CheckConstraint("starts_on <= ends_on", name="ck_academic_years_dates"),
        Index("ix_academic_years_school_dates", "school_id", "starts_on"),
    )
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id", ondelete="RESTRICT"), nullable=False)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    starts_on: Mapped[date] = mapped_column(Date, nullable=False)
    ends_on: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="planned", server_default="planned")


class AcademicTerm(Base):
    __tablename__ = "academic_terms"
    __table_args__ = (
        ForeignKeyConstraint(["school_id", "academic_year_id"], ["academic_years.school_id", "academic_years.id"], ondelete="RESTRICT"),
        UniqueConstraint("school_id", "academic_year_id", "ordinal", name="uq_terms_year_ordinal"),
        UniqueConstraint("school_id", "academic_year_id", "name", name="uq_terms_year_name"),
        UniqueConstraint("school_id", "academic_year_id", "id", name="uq_terms_school_year_id"),
        CheckConstraint("starts_on <= ends_on", name="ck_terms_dates"),
        Index("ix_terms_school_year", "school_id", "academic_year_id"),
    )
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id", ondelete="RESTRICT"), nullable=False)
    academic_year_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    ordinal: Mapped[int] = mapped_column(nullable=False)
    starts_on: Mapped[date] = mapped_column(Date, nullable=False)
    ends_on: Mapped[date] = mapped_column(Date, nullable=False)


class AcademicCalendarEvent(Base):
    __tablename__ = "academic_calendar_events"
    __table_args__ = (
        ForeignKeyConstraint(["school_id", "academic_year_id"], ["academic_years.school_id", "academic_years.id"], ondelete="RESTRICT"),
        ForeignKeyConstraint(["school_id", "academic_year_id", "term_id"], ["academic_terms.school_id", "academic_terms.academic_year_id", "academic_terms.id"], ondelete="RESTRICT"),
        ForeignKeyConstraint(["school_id", "academic_year_id", "class_group_id"], ["class_groups.school_id", "class_groups.academic_year_id", "class_groups.id"], ondelete="RESTRICT"),
        ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="RESTRICT"),
        UniqueConstraint("school_id", "id", name="uq_calendar_events_school_id"),
        CheckConstraint("starts_on <= ends_on", name="ck_calendar_events_dates"),
        CheckConstraint("audience IN ('all', 'students', 'staff', 'parents', 'teachers', 'class')", name="ck_calendar_events_audience"),
        CheckConstraint("category IN ('term', 'holiday', 'exam', 'meeting', 'event', 'assessment', 'other')", name="ck_calendar_events_category"),
        Index("ix_calendar_events_school_year_dates", "school_id", "academic_year_id", "starts_on", "ends_on"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id", ondelete="RESTRICT"), nullable=False)
    academic_year_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    term_id: Mapped[UUID | None] = mapped_column(Uuid)
    class_group_id: Mapped[UUID | None] = mapped_column(Uuid)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    category: Mapped[str] = mapped_column(String(24), nullable=False, default="event", server_default="event")
    audience: Mapped[str] = mapped_column(String(20), nullable=False, default="all", server_default="all")
    starts_on: Mapped[date] = mapped_column(Date, nullable=False)
    ends_on: Mapped[date] = mapped_column(Date, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    created_by_user_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class ClassGroup(Base):
    __tablename__ = "class_groups"
    __table_args__ = (
        ForeignKeyConstraint(["school_id", "academic_year_id"], ["academic_years.school_id", "academic_years.id"], ondelete="RESTRICT"),
        UniqueConstraint("school_id", "id", name="uq_class_groups_school_id"),
        UniqueConstraint("school_id", "academic_year_id", "id", name="uq_class_groups_school_year_id"),
        UniqueConstraint("school_id", "academic_year_id", "name", "stream", name="uq_class_groups_year_name_stream"),
        Index("ix_class_groups_school_year", "school_id", "academic_year_id"),
        # A teacher is the class teacher of at most one class at a time.
        Index(
            "uq_class_groups_class_teacher",
            "school_id",
            "class_teacher_membership_id",
            unique=True,
            postgresql_where=text("class_teacher_membership_id IS NOT NULL"),
        ),
    )
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id", ondelete="RESTRICT"), nullable=False)
    academic_year_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    grade_level: Mapped[str] = mapped_column(String(40), nullable=False)
    stream: Mapped[str] = mapped_column(String(40), nullable=False, default="", server_default="")
    class_teacher_membership_id: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("school_memberships.id", ondelete="RESTRICT"),
    )


class StudentEnrollment(Base):
    __tablename__ = "student_enrollments"
    __table_args__ = (
        ForeignKeyConstraint(["school_id", "student_id"], ["students.school_id", "students.id"], ondelete="RESTRICT"),
        ForeignKeyConstraint(["school_id", "academic_year_id"], ["academic_years.school_id", "academic_years.id"], ondelete="RESTRICT"),
        ForeignKeyConstraint(["school_id", "academic_year_id", "class_group_id"], ["class_groups.school_id", "class_groups.academic_year_id", "class_groups.id"], ondelete="RESTRICT"),
        UniqueConstraint("student_id", "academic_year_id", name="uq_enrollments_student_year"),
        Index("ix_enrollments_school_class", "school_id", "class_group_id"),
    )
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id", ondelete="RESTRICT"), nullable=False)
    student_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    academic_year_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    class_group_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    enrolled_on: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active", server_default="active")


class SchoolInvitation(Base):
    __tablename__ = "school_invitations"
    __table_args__ = (
        ForeignKeyConstraint(["school_id"], ["schools.id"], ondelete="RESTRICT"),
        Index("ix_invitations_school_email_status", "school_id", "email", "status"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    email: Mapped[str] = mapped_column(String(254), nullable=False)
    display_name: Mapped[str] = mapped_column(String(160), nullable=False)
    role: Mapped[MembershipRole] = mapped_column(Enum(MembershipRole, name="membership_role"), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending", server_default="pending")
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by_user_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Subject(Base):
    __tablename__ = "subjects"
    __table_args__ = (
        UniqueConstraint("school_id", "code", name="uq_subjects_school_code"),
        UniqueConstraint("school_id", "id", name="uq_subjects_school_id"),
        ForeignKeyConstraint(["school_id"], ["schools.id"], ondelete="RESTRICT"),
        Index("ix_subjects_school_name", "school_id", "name"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    code: Mapped[str] = mapped_column(String(24), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active", server_default="active")


class ClassSubjectAssignment(Base):
    __tablename__ = "class_subject_assignments"
    __table_args__ = (
        ForeignKeyConstraint(["school_id", "class_group_id"], ["class_groups.school_id", "class_groups.id"], ondelete="RESTRICT"),
        ForeignKeyConstraint(["school_id", "subject_id"], ["subjects.school_id", "subjects.id"], ondelete="RESTRICT"),
        ForeignKeyConstraint(["school_id", "teacher_membership_id"], ["school_memberships.school_id", "school_memberships.id"], ondelete="RESTRICT"),
        UniqueConstraint("school_id", "class_group_id", "subject_id", "teacher_membership_id", name="uq_assignments_class_subject_teacher"),
        Index("ix_assignments_school_class", "school_id", "class_group_id"),
        Index("ix_assignments_teacher_class", "school_id", "teacher_membership_id", "class_group_id"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    class_group_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    subject_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    teacher_membership_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    assigned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class TimetableSlot(Base):
    """One recurring weekly lesson: a class learning a subject from a teacher."""

    __tablename__ = "timetable_slots"
    __table_args__ = (
        ForeignKeyConstraint(["school_id", "academic_year_id"], ["academic_years.school_id", "academic_years.id"], ondelete="RESTRICT"),
        ForeignKeyConstraint(["school_id", "class_group_id"], ["class_groups.school_id", "class_groups.id"], ondelete="RESTRICT"),
        ForeignKeyConstraint(["school_id", "subject_id"], ["subjects.school_id", "subjects.id"], ondelete="RESTRICT"),
        ForeignKeyConstraint(["school_id", "teacher_membership_id"], ["school_memberships.school_id", "school_memberships.id"], ondelete="RESTRICT"),
        UniqueConstraint("school_id", "id", name="uq_timetable_slots_school_id"),
        CheckConstraint("starts_at < ends_at", name="ck_timetable_slots_times"),
        CheckConstraint("day_of_week BETWEEN 0 AND 6", name="ck_timetable_slots_day"),
        Index("ix_timetable_school_year_day", "school_id", "academic_year_id", "day_of_week"),
        Index("ix_timetable_school_class_day", "school_id", "class_group_id", "day_of_week"),
        Index("ix_timetable_school_teacher_day", "school_id", "teacher_membership_id", "day_of_week"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    academic_year_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    class_group_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    subject_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    teacher_membership_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    day_of_week: Mapped[int] = mapped_column(nullable=False)  # 0 = Monday .. 6 = Sunday
    starts_at: Mapped[time] = mapped_column(Time, nullable=False)
    ends_at: Mapped[time] = mapped_column(Time, nullable=False)
    room: Mapped[str | None] = mapped_column(String(40))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# Python-side onupdate keeps async attribute reads safe: a SQL-side onupdate() would
# expire the column on every flush, and re-reading it from sync context raises MissingGreenlet.

class AttendanceSession(Base):
    __tablename__ = "attendance_sessions"
    __table_args__ = (
        ForeignKeyConstraint(["school_id", "class_group_id"], ["class_groups.school_id", "class_groups.id"], ondelete="RESTRICT"),
        ForeignKeyConstraint(["school_id", "recorded_by_membership_id"], ["school_memberships.school_id", "school_memberships.id"], ondelete="RESTRICT"),
        UniqueConstraint("school_id", "class_group_id", "attendance_date", name="uq_attendance_class_date"),
        UniqueConstraint("school_id", "id", name="uq_attendance_sessions_school_id"),
        Index("ix_attendance_school_date", "school_id", "attendance_date"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    class_group_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    attendance_date: Mapped[date] = mapped_column(Date, nullable=False)
    recorded_by_membership_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=utcnow)


class AttendanceRecord(Base):
    __tablename__ = "attendance_records"
    __table_args__ = (
        ForeignKeyConstraint(["school_id", "session_id"], ["attendance_sessions.school_id", "attendance_sessions.id"], ondelete="CASCADE"),
        ForeignKeyConstraint(["school_id", "student_id"], ["students.school_id", "students.id"], ondelete="RESTRICT"),
        UniqueConstraint("school_id", "session_id", "student_id", name="uq_attendance_record_student"),
        CheckConstraint("status IN ('present', 'absent', 'late', 'excused')", name="ck_attendance_record_status"),
        Index("ix_attendance_records_school_student", "school_id", "student_id"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    session_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    student_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    note: Mapped[str | None] = mapped_column(String(240))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=utcnow)


class GradingScale(Base):
    __tablename__ = "grading_scales"
    __table_args__ = (
        UniqueConstraint("school_id", "name", name="uq_grading_scales_school_name"),
        UniqueConstraint("school_id", "id", name="uq_grading_scales_school_id"),
        CheckConstraint("status IN ('active', 'archived')", name="ck_grading_scales_status"),
        Index("ix_grading_scales_school_status", "school_id", "status"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id", ondelete="RESTRICT"), nullable=False)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    is_default: Mapped[bool] = mapped_column(nullable=False, default=False, server_default="false")
    include_positions: Mapped[bool] = mapped_column(nullable=False, default=True, server_default="true")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active", server_default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=utcnow)
    bands: Mapped[list["GradingBand"]] = relationship(back_populates="scale", order_by="GradingBand.min_percent", cascade="all, delete-orphan")


class GradingBand(Base):
    __tablename__ = "grading_bands"
    __table_args__ = (
        ForeignKeyConstraint(["school_id", "scale_id"], ["grading_scales.school_id", "grading_scales.id"], ondelete="CASCADE"),
        UniqueConstraint("school_id", "id", name="uq_grading_bands_school_id"),
        UniqueConstraint("scale_id", "min_percent", name="uq_grading_bands_scale_min"),
        CheckConstraint("min_percent >= 0 AND max_percent <= 100 AND min_percent <= max_percent", name="ck_grading_bands_range"),
        Index("ix_grading_bands_scale", "school_id", "scale_id"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id", ondelete="RESTRICT"), nullable=False)
    scale_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    min_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    max_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    grade: Mapped[str] = mapped_column(String(12), nullable=False)
    points: Mapped[Decimal | None] = mapped_column(Numeric(4, 2))
    description: Mapped[str | None] = mapped_column(String(80))
    scale: Mapped[GradingScale] = relationship(back_populates="bands")


class TermSubjectResult(Base):
    """Weighted term total for one student, class, subject, and term.

    Recomputed while the class/term is unpublished; frozen once its publication is published.
    """

    __tablename__ = "term_subject_results"
    __table_args__ = (
        ForeignKeyConstraint(["school_id", "academic_year_id", "term_id"], ["academic_terms.school_id", "academic_terms.academic_year_id", "academic_terms.id"], ondelete="RESTRICT"),
        ForeignKeyConstraint(["school_id", "academic_year_id", "class_group_id"], ["class_groups.school_id", "class_groups.academic_year_id", "class_groups.id"], ondelete="RESTRICT"),
        ForeignKeyConstraint(["school_id", "subject_id"], ["subjects.school_id", "subjects.id"], ondelete="RESTRICT"),
        ForeignKeyConstraint(["school_id", "student_id"], ["students.school_id", "students.id"], ondelete="RESTRICT"),
        UniqueConstraint("school_id", "term_id", "class_group_id", "subject_id", "student_id", name="uq_term_subject_results_row"),
        CheckConstraint("weighted_total >= 0 AND weighted_total <= 100", name="ck_term_subject_results_total"),
        CheckConstraint("total_weight >= 0", name="ck_term_subject_results_weight"),
        Index("ix_term_subject_results_school_class_term", "school_id", "class_group_id", "term_id"),
        Index("ix_term_subject_results_school_student", "school_id", "student_id"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id", ondelete="RESTRICT"), nullable=False)
    academic_year_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    term_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    class_group_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    subject_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    student_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    weighted_total: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False)
    grade: Mapped[str | None] = mapped_column(String(12))
    points: Mapped[Decimal | None] = mapped_column(Numeric(4, 2))
    assessment_count: Mapped[int] = mapped_column(nullable=False, default=0, server_default="0")
    total_weight: Mapped[Decimal] = mapped_column(Numeric(7, 2), nullable=False, default=Decimal(0), server_default="0")
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class TermResult(Base):
    """Per-student term aggregate (mean of subject totals) with optional class position."""

    __tablename__ = "term_results"
    __table_args__ = (
        ForeignKeyConstraint(["school_id", "academic_year_id", "term_id"], ["academic_terms.school_id", "academic_terms.academic_year_id", "academic_terms.id"], ondelete="RESTRICT"),
        ForeignKeyConstraint(["school_id", "academic_year_id", "class_group_id"], ["class_groups.school_id", "class_groups.academic_year_id", "class_groups.id"], ondelete="RESTRICT"),
        ForeignKeyConstraint(["school_id", "student_id"], ["students.school_id", "students.id"], ondelete="RESTRICT"),
        UniqueConstraint("school_id", "term_id", "class_group_id", "student_id", name="uq_term_results_row"),
        CheckConstraint("aggregate_percent >= 0 AND aggregate_percent <= 100", name="ck_term_results_aggregate"),
        CheckConstraint("position IS NULL OR position >= 1", name="ck_term_results_position"),
        Index("ix_term_results_school_class_term", "school_id", "class_group_id", "term_id"),
        Index("ix_term_results_school_student", "school_id", "student_id"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id", ondelete="RESTRICT"), nullable=False)
    academic_year_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    term_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    class_group_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    student_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    aggregate_percent: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False)
    grade: Mapped[str | None] = mapped_column(String(12))
    points: Mapped[Decimal | None] = mapped_column(Numeric(4, 2))
    position: Mapped[int | None] = mapped_column(nullable=True)
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ResultPublication(Base):
    """Publication state for one class and term; published rows lock recomputation."""

    __tablename__ = "result_publications"
    __table_args__ = (
        ForeignKeyConstraint(["school_id", "academic_year_id", "term_id"], ["academic_terms.school_id", "academic_terms.academic_year_id", "academic_terms.id"], ondelete="RESTRICT"),
        ForeignKeyConstraint(["school_id", "academic_year_id", "class_group_id"], ["class_groups.school_id", "class_groups.academic_year_id", "class_groups.id"], ondelete="RESTRICT"),
        ForeignKeyConstraint(["school_id", "grading_scale_id"], ["grading_scales.school_id", "grading_scales.id"], ondelete="RESTRICT"),
        UniqueConstraint("school_id", "term_id", "class_group_id", name="uq_result_publications_row"),
        CheckConstraint("status IN ('draft', 'published', 'withdrawn')", name="ck_result_publications_status"),
        Index("ix_result_publications_school_class_term", "school_id", "class_group_id", "term_id"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id", ondelete="RESTRICT"), nullable=False)
    academic_year_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    term_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    class_group_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft", server_default="draft")
    grading_scale_id: Mapped[UUID | None] = mapped_column(Uuid)
    published_by_membership_id: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey("school_memberships.id", ondelete="RESTRICT"))
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    withdrawn_by_membership_id: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey("school_memberships.id", ondelete="RESTRICT"))
    withdrawn_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=utcnow)


class Assessment(Base):
    __tablename__ = "assessments"
    __table_args__ = (
        ForeignKeyConstraint(["school_id", "academic_year_id", "class_group_id"], ["class_groups.school_id", "class_groups.academic_year_id", "class_groups.id"], ondelete="RESTRICT"),
        ForeignKeyConstraint(["school_id", "academic_year_id", "term_id"], ["academic_terms.school_id", "academic_terms.academic_year_id", "academic_terms.id"], ondelete="RESTRICT"),
        ForeignKeyConstraint(["school_id", "subject_id"], ["subjects.school_id", "subjects.id"], ondelete="RESTRICT"),
        ForeignKeyConstraint(["school_id", "created_by_membership_id"], ["school_memberships.school_id", "school_memberships.id"], ondelete="RESTRICT"),
        ForeignKeyConstraint(["school_id", "reviewed_by_membership_id"], ["school_memberships.school_id", "school_memberships.id"], ondelete="RESTRICT"),
        UniqueConstraint("school_id", "id", name="uq_assessments_school_id"),
        UniqueConstraint("school_id", "class_group_id", "subject_id", "term_id", "title", name="uq_assessments_class_subject_term_title"),
        CheckConstraint("max_score > 0 AND max_score <= 1000", name="ck_assessments_positive_max_score"),
        CheckConstraint("category IN ('quiz', 'assignment', 'project', 'class_test', 'examination', 'practical', 'other')", name="ck_assessments_category"),
        CheckConstraint("weight_percent >= 0 AND weight_percent <= 100", name="ck_assessments_weight_range"),
        CheckConstraint("status IN ('open', 'submitted', 'returned', 'approved')", name="ck_assessments_status"),
        Index("ix_assessments_school_class_term", "school_id", "class_group_id", "term_id"),
        Index("ix_assessments_school_status", "school_id", "status"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id", ondelete="RESTRICT"), nullable=False)
    academic_year_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    class_group_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    subject_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    term_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    category: Mapped[str] = mapped_column(String(32), nullable=False)
    max_score: Mapped[Decimal] = mapped_column(Numeric(7, 2), nullable=False)
    weight_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=Decimal(0), server_default="0")
    due_on: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="open", server_default="open")
    review_note: Mapped[str | None] = mapped_column(String(1000))
    created_by_membership_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    reviewed_by_membership_id: Mapped[UUID | None] = mapped_column(Uuid)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=utcnow)


class AssessmentScore(Base):
    __tablename__ = "assessment_scores"
    __table_args__ = (
        ForeignKeyConstraint(["school_id", "assessment_id"], ["assessments.school_id", "assessments.id"], ondelete="CASCADE"),
        ForeignKeyConstraint(["school_id", "student_id"], ["students.school_id", "students.id"], ondelete="RESTRICT"),
        ForeignKeyConstraint(["school_id", "updated_by_membership_id"], ["school_memberships.school_id", "school_memberships.id"], ondelete="RESTRICT"),
        UniqueConstraint("school_id", "assessment_id", "student_id", name="uq_assessment_score_student"),
        CheckConstraint("score IS NULL OR score >= 0", name="ck_assessment_scores_nonnegative"),
        CheckConstraint("submission_status IN ('not_recorded', 'submitted', 'missing', 'excused')", name="ck_assessment_scores_submission_status"),
        Index("ix_assessment_scores_school_student", "school_id", "student_id"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id", ondelete="RESTRICT"), nullable=False)
    assessment_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    student_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    score: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    comment: Mapped[str | None] = mapped_column(String(240))
    submission_status: Mapped[str] = mapped_column(String(20), nullable=False, default="not_recorded", server_default="not_recorded")
    updated_by_membership_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=utcnow)


class OnlineExam(Base):
    __tablename__ = "online_exams"
    __table_args__ = (
        ForeignKeyConstraint(["school_id", "assessment_id"], ["assessments.school_id", "assessments.id"], ondelete="CASCADE"),
        UniqueConstraint("school_id", "id", name="uq_online_exams_school_id"),
        UniqueConstraint("school_id", "assessment_id", name="uq_online_exams_assessment"),
        CheckConstraint("duration_minutes BETWEEN 1 AND 480", name="ck_online_exams_duration"),
        Index("ix_online_exams_school_published", "school_id", "published_at"),
    )
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id", ondelete="RESTRICT"), nullable=False)
    assessment_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    instructions: Mapped[str | None] = mapped_column(Text)
    opens_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    closes_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=utcnow, nullable=False)


class ExamQuestion(Base):
    __tablename__ = "exam_questions"
    __table_args__ = (
        ForeignKeyConstraint(["school_id", "exam_id"], ["online_exams.school_id", "online_exams.id"], ondelete="CASCADE"),
        UniqueConstraint("school_id", "id", name="uq_exam_questions_school_id"),
        CheckConstraint("question_type IN ('multiple_choice', 'written')", name="ck_exam_questions_type"),
        CheckConstraint("points > 0", name="ck_exam_questions_points"),
        UniqueConstraint("school_id", "exam_id", "position", name="uq_exam_questions_position"),
        Index("ix_exam_questions_exam", "school_id", "exam_id", "position"),
    )
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id", ondelete="RESTRICT"), nullable=False)
    exam_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    question_text: Mapped[str] = mapped_column(Text, nullable=False)
    question_type: Mapped[str] = mapped_column(String(24), nullable=False)
    points: Mapped[Decimal] = mapped_column(Numeric(7, 2), nullable=False)


class ExamOption(Base):
    __tablename__ = "exam_options"
    __table_args__ = (
        ForeignKeyConstraint(["school_id", "question_id"], ["exam_questions.school_id", "exam_questions.id"], ondelete="CASCADE"),
        UniqueConstraint("school_id", "id", name="uq_exam_options_school_id"),
        UniqueConstraint("school_id", "question_id", "position", name="uq_exam_options_position"),
        Index("ix_exam_options_question", "school_id", "question_id", "position"),
    )
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id", ondelete="RESTRICT"), nullable=False)
    question_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    option_text: Mapped[str] = mapped_column(Text, nullable=False)
    is_correct: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))


class ExamAttempt(Base):
    __tablename__ = "exam_attempts"
    __table_args__ = (
        ForeignKeyConstraint(["school_id", "exam_id"], ["online_exams.school_id", "online_exams.id"], ondelete="CASCADE"),
        ForeignKeyConstraint(["school_id", "student_id"], ["students.school_id", "students.id"], ondelete="RESTRICT"),
        ForeignKeyConstraint(["school_id", "reviewed_by_membership_id"], ["school_memberships.school_id", "school_memberships.id"], ondelete="RESTRICT"),
        UniqueConstraint("school_id", "id", name="uq_exam_attempts_school_id"),
        UniqueConstraint("school_id", "exam_id", "student_id", name="uq_exam_attempt_student"),
        CheckConstraint("status IN ('in_progress', 'submitted', 'reviewed')", name="ck_exam_attempt_status"),
        Index("ix_exam_attempts_school_exam_status", "school_id", "exam_id", "status"),
    )
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id", ondelete="RESTRICT"), nullable=False)
    exam_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    student_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="in_progress", server_default="in_progress")
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    deadline_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    score: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    reviewed_by_membership_id: Mapped[UUID | None] = mapped_column(Uuid)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ExamAnswer(Base):
    __tablename__ = "exam_answers"
    __table_args__ = (
        ForeignKeyConstraint(["school_id", "attempt_id"], ["exam_attempts.school_id", "exam_attempts.id"], ondelete="CASCADE"),
        ForeignKeyConstraint(["school_id", "question_id"], ["exam_questions.school_id", "exam_questions.id"], ondelete="CASCADE"),
        ForeignKeyConstraint(["school_id", "selected_option_id"], ["exam_options.school_id", "exam_options.id"], ondelete="RESTRICT"),
        UniqueConstraint("school_id", "attempt_id", "question_id", name="uq_exam_answers_question"),
        CheckConstraint("points_awarded IS NULL OR points_awarded >= 0", name="ck_exam_answers_points"),
        Index("ix_exam_answers_attempt", "school_id", "attempt_id"),
    )
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id", ondelete="RESTRICT"), nullable=False)
    attempt_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    question_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    selected_option_id: Mapped[UUID | None] = mapped_column(Uuid)
    written_answer: Mapped[str | None] = mapped_column(Text)
    points_awarded: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    teacher_feedback: Mapped[str | None] = mapped_column(String(1000))


class StudentImportJob(Base):
    """A validated import preview; students are only created when it is confirmed."""

    __tablename__ = "student_import_jobs"
    __table_args__ = (
        UniqueConstraint("school_id", "id", name="uq_student_import_jobs_school_id"),
        CheckConstraint(
            "status IN ('previewed', 'confirmed')", name="ck_student_import_jobs_status"
        ),
        CheckConstraint(
            "total_rows >= 0 AND valid_rows >= 0 AND error_rows >= 0 AND duplicate_rows >= 0"
            " AND created_rows >= 0 AND skipped_rows >= 0",
            name="ck_student_import_jobs_counts",
        ),
        Index("ix_student_import_jobs_school_created", "school_id", "created_at"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id", ondelete="RESTRICT"), nullable=False)
    created_by_user_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="previewed", server_default="previewed")
    # Uploaded header -> canonical field, as used for this preview.
    column_map: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict, server_default="{}")
    # Parsed rows with per-row status (valid/error/duplicate/created/skipped) and messages.
    preview_rows: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default="[]")
    total_rows: Mapped[int] = mapped_column(nullable=False, default=0, server_default="0")
    valid_rows: Mapped[int] = mapped_column(nullable=False, default=0, server_default="0")
    error_rows: Mapped[int] = mapped_column(nullable=False, default=0, server_default="0")
    duplicate_rows: Mapped[int] = mapped_column(nullable=False, default=0, server_default="0")
    created_rows: Mapped[int] = mapped_column(nullable=False, default=0, server_default="0")
    skipped_rows: Mapped[int] = mapped_column(nullable=False, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class FeeCategory(Base):
    """School-defined fee headings (e.g. Tuition, Feeding, Uniform)."""

    __tablename__ = "fee_categories"
    __table_args__ = (
        UniqueConstraint("school_id", "id", name="uq_fee_categories_school_id"),
        UniqueConstraint("school_id", "name", name="uq_fee_categories_school_name"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(ForeignKey("schools.id", ondelete="RESTRICT"), nullable=False)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class FeeStructure(Base):
    """Class-scoped fee definition for an academic year, optionally per term."""

    __tablename__ = "fee_structures"
    __table_args__ = (
        UniqueConstraint("school_id", "id", name="uq_fee_structures_school_id"),
        CheckConstraint("amount >= 0", name="ck_fee_structures_amount"),
        CheckConstraint("status IN ('active', 'archived')", name="ck_fee_structures_status"),
        UniqueConstraint(
            "school_id", "fee_category_id", "class_group_id", "term_id",
            name="uq_fee_structures_scope",
        ),
        Index("ix_fee_structures_school_class", "school_id", "class_group_id"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(ForeignKey("schools.id", ondelete="RESTRICT"), nullable=False)
    fee_category_id: Mapped[UUID] = mapped_column(ForeignKey("fee_categories.id", ondelete="RESTRICT"), nullable=False)
    class_group_id: Mapped[UUID] = mapped_column(ForeignKey("class_groups.id", ondelete="RESTRICT"), nullable=False)
    academic_year_id: Mapped[UUID] = mapped_column(ForeignKey("academic_years.id", ondelete="RESTRICT"), nullable=False)
    term_id: Mapped[UUID] = mapped_column(ForeignKey("academic_terms.id", ondelete="RESTRICT"), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="active", server_default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class StudentInvoice(Base):
    """A billed term/year obligation; totals are historical facts, never silently rewritten."""

    __tablename__ = "student_invoices"
    __table_args__ = (
        UniqueConstraint("school_id", "id", name="uq_student_invoices_school_id"),
        UniqueConstraint("school_id", "invoice_number", name="uq_student_invoices_school_number"),
        CheckConstraint(
            "status IN ('issued', 'partially_paid', 'paid', 'void')",
            name="ck_student_invoices_status",
        ),
        CheckConstraint("total_amount >= 0 AND paid_amount >= 0", name="ck_student_invoices_amounts"),
        Index("ix_student_invoices_school_student", "school_id", "student_id"),
        Index("ix_student_invoices_school_term", "school_id", "term_id"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(ForeignKey("schools.id", ondelete="RESTRICT"), nullable=False)
    student_id: Mapped[UUID] = mapped_column(ForeignKey("students.id", ondelete="RESTRICT"), nullable=False)
    academic_year_id: Mapped[UUID] = mapped_column(ForeignKey("academic_years.id", ondelete="RESTRICT"), nullable=False)
    term_id: Mapped[UUID] = mapped_column(ForeignKey("academic_terms.id", ondelete="RESTRICT"), nullable=False)
    invoice_number: Mapped[str] = mapped_column(String(24), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="issued", server_default="issued")
    total_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal(0), server_default="0")
    paid_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal(0), server_default="0")
    issued_on: Mapped[date] = mapped_column(Date, nullable=False, default=date.today)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class InvoiceLineItem(Base):
    """Snapshot of one fee on an invoice, independent of later fee-structure edits."""

    __tablename__ = "invoice_line_items"
    __table_args__ = (
        UniqueConstraint("school_id", "id", name="uq_invoice_line_items_school_id"),
        CheckConstraint("amount >= 0", name="ck_invoice_line_items_amount"),
        Index("ix_invoice_line_items_invoice", "invoice_id"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(ForeignKey("schools.id", ondelete="RESTRICT"), nullable=False)
    invoice_id: Mapped[UUID] = mapped_column(ForeignKey("student_invoices.id", ondelete="RESTRICT"), nullable=False)
    fee_structure_id: Mapped[UUID | None] = mapped_column(ForeignKey("fee_structures.id", ondelete="RESTRICT"))
    fee_category_id: Mapped[UUID] = mapped_column(ForeignKey("fee_categories.id", ondelete="RESTRICT"), nullable=False)
    description: Mapped[str] = mapped_column(String(160), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Payment(Base):
    """A recorded fee payment with a per-school receipt number."""

    __tablename__ = "payments"
    __table_args__ = (
        UniqueConstraint("school_id", "id", name="uq_payments_school_id"),
        UniqueConstraint("school_id", "receipt_number", name="uq_payments_school_receipt"),
        CheckConstraint("amount > 0", name="ck_payments_amount"),
        CheckConstraint("status IN ('recorded', 'voided')", name="ck_payments_status"),
        CheckConstraint(
            "method IN ('cash', 'mobile_money', 'bank_transfer', 'card', 'cheque', 'other')",
            name="ck_payments_method",
        ),
        Index("ix_payments_school_student", "school_id", "student_id"),
        Index("ix_payments_school_date", "school_id", "payment_date"),
        Index(
            "uq_payments_school_reference",
            "school_id",
            "reference",
            unique=True,
            postgresql_where=text("reference IS NOT NULL"),
        ),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(ForeignKey("schools.id", ondelete="RESTRICT"), nullable=False)
    student_id: Mapped[UUID] = mapped_column(ForeignKey("students.id", ondelete="RESTRICT"), nullable=False)
    recorded_by_user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    method: Mapped[str] = mapped_column(String(20), nullable=False)
    reference: Mapped[str | None] = mapped_column(String(80))
    receipt_number: Mapped[str] = mapped_column(String(24), nullable=False)
    payment_date: Mapped[date] = mapped_column(Date, nullable=False, default=date.today)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="recorded", server_default="recorded")
    note: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PaymentAllocation(Base):
    """Portion of a payment applied to one invoice."""

    __tablename__ = "payment_allocations"
    __table_args__ = (
        UniqueConstraint("school_id", "id", name="uq_payment_allocations_school_id"),
        CheckConstraint("amount > 0", name="ck_payment_allocations_amount"),
        Index("ix_payment_allocations_payment", "payment_id"),
        Index("ix_payment_allocations_invoice", "invoice_id"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(ForeignKey("schools.id", ondelete="RESTRICT"), nullable=False)
    payment_id: Mapped[UUID] = mapped_column(ForeignKey("payments.id", ondelete="RESTRICT"), nullable=False)
    invoice_id: Mapped[UUID] = mapped_column(ForeignKey("student_invoices.id", ondelete="RESTRICT"), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PaymentRefund(Base):
    """An audited partial or full refund recorded against an invoice."""

    __tablename__ = "payment_refunds"
    __table_args__ = (
        UniqueConstraint("school_id", "id", name="uq_payment_refunds_school_id"),
        UniqueConstraint("school_id", "refund_number", name="uq_payment_refunds_school_number"),
        CheckConstraint("amount > 0", name="ck_payment_refunds_amount"),
        Index("ix_payment_refunds_school_invoice", "school_id", "invoice_id"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(ForeignKey("schools.id", ondelete="RESTRICT"), nullable=False)
    invoice_id: Mapped[UUID] = mapped_column(ForeignKey("student_invoices.id", ondelete="RESTRICT"), nullable=False)
    recorded_by_user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    refund_number: Mapped[str] = mapped_column(String(24), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    reason: Mapped[str] = mapped_column(String(255), nullable=False)
    refund_date: Mapped[date] = mapped_column(Date, nullable=False, default=date.today)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PaymentRefundAllocation(Base):
    """Connect a refund to the original payment allocation it reverses."""

    __tablename__ = "payment_refund_allocations"
    __table_args__ = (
        UniqueConstraint("school_id", "id", name="uq_payment_refund_allocations_school_id"),
        CheckConstraint("amount > 0", name="ck_payment_refund_allocations_amount"),
        Index("ix_payment_refund_allocations_refund", "refund_id"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(ForeignKey("schools.id", ondelete="RESTRICT"), nullable=False)
    refund_id: Mapped[UUID] = mapped_column(ForeignKey("payment_refunds.id", ondelete="RESTRICT"), nullable=False)
    payment_allocation_id: Mapped[UUID] = mapped_column(ForeignKey("payment_allocations.id", ondelete="RESTRICT"), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())



class Guardian(Base):
    __tablename__ = "guardians"
    __table_args__ = (
        UniqueConstraint("school_id", "id", name="uq_guardians_school_id"),
        UniqueConstraint("user_id", name="uq_guardians_user_id"),
        Index("ix_guardians_school_name", "school_id", "last_name", "first_name"),
        Index("ix_guardians_school_email", "school_id", "email"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id", ondelete="RESTRICT"), nullable=False)
    user_id: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="RESTRICT"))
    first_name: Mapped[str] = mapped_column(String(80), nullable=False)
    last_name: Mapped[str] = mapped_column(String(80), nullable=False)
    email: Mapped[str | None] = mapped_column(String(254))
    phone: Mapped[str | None] = mapped_column(String(40))
    relationship: Mapped[str | None] = mapped_column(String(40))
    address: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class StudentGuardian(Base):
    __tablename__ = "student_guardians"
    __table_args__ = (
        UniqueConstraint("school_id", "id", name="uq_student_guardians_school_id"),
        UniqueConstraint("student_id", "guardian_id", name="uq_student_guardians_pair"),
        ForeignKeyConstraint(["school_id", "student_id"], ["students.school_id", "students.id"], ondelete="RESTRICT"),
        ForeignKeyConstraint(["school_id", "guardian_id"], ["guardians.school_id", "guardians.id"], ondelete="RESTRICT"),
        Index("ix_student_guardians_school_student", "school_id", "student_id"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id", ondelete="RESTRICT"), nullable=False)
    student_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    guardian_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class BehaviorRecord(Base):
    """A positive or negative incident noted against one student."""

    __tablename__ = "behavior_records"
    __table_args__ = (
        ForeignKeyConstraint(["school_id", "student_id"], ["students.school_id", "students.id"], ondelete="RESTRICT"),
        UniqueConstraint("school_id", "id", name="uq_behavior_records_school_id"),
        CheckConstraint("category IN ('merit', 'demerit', 'incident', 'note')", name="ck_behavior_records_category"),
        CheckConstraint("severity IN ('low', 'medium', 'high')", name="ck_behavior_records_severity"),
        Index("ix_behavior_records_school_student", "school_id", "student_id"),
        Index("ix_behavior_records_school_date", "school_id", "occurred_on"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id", ondelete="RESTRICT"), nullable=False)
    student_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    occurred_on: Mapped[date] = mapped_column(Date, nullable=False)
    category: Mapped[str] = mapped_column(String(24), nullable=False)
    severity: Mapped[str] = mapped_column(String(16), nullable=False, default="low", server_default="low")
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    action_taken: Mapped[str | None] = mapped_column(String(240))
    recorded_by_membership_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("school_memberships.id", ondelete="RESTRICT"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class StudentSupportIntervention(Base):
    """A school-owned, human-reviewed action and follow-up for one student."""

    __tablename__ = "student_support_interventions"
    __table_args__ = (
        ForeignKeyConstraint(["school_id", "student_id"], ["students.school_id", "students.id"], ondelete="RESTRICT"),
        ForeignKeyConstraint(["school_id", "academic_year_id"], ["academic_years.school_id", "academic_years.id"], ondelete="RESTRICT"),
        ForeignKeyConstraint(["school_id", "academic_year_id", "term_id"], ["academic_terms.school_id", "academic_terms.academic_year_id", "academic_terms.id"], ondelete="RESTRICT"),
        ForeignKeyConstraint(["school_id", "created_by_membership_id"], ["school_memberships.school_id", "school_memberships.id"], ondelete="RESTRICT"),
        ForeignKeyConstraint(["school_id", "assigned_to_membership_id"], ["school_memberships.school_id", "school_memberships.id"], ondelete="RESTRICT"),
        UniqueConstraint("school_id", "id", name="uq_student_support_interventions_school_id"),
        CheckConstraint("status IN ('planned', 'in_progress', 'completed', 'cancelled')", name="ck_student_support_interventions_status"),
        CheckConstraint("category IN ('attendance', 'academic', 'assignment', 'wellbeing', 'family_contact', 'other')", name="ck_student_support_interventions_category"),
        Index("ix_support_interventions_school_year_status", "school_id", "academic_year_id", "status"),
        Index("ix_support_interventions_school_student", "school_id", "student_id", "created_at"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id", ondelete="RESTRICT"), nullable=False)
    student_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    academic_year_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    term_id: Mapped[UUID | None] = mapped_column(Uuid)
    created_by_membership_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    assigned_to_membership_id: Mapped[UUID | None] = mapped_column(Uuid, nullable=True)
    category: Mapped[str] = mapped_column(String(24), nullable=False)
    title: Mapped[str] = mapped_column(String(140), nullable=False)
    action: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="planned", server_default="planned")
    follow_up_on: Mapped[date | None] = mapped_column(Date)
    outcome: Mapped[str | None] = mapped_column(Text)
    baseline_attendance_rate: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    baseline_assessment_average: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    latest_attendance_rate: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    latest_assessment_average: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=utcnow)


class StudentDocument(Base):
    """A document on file for a student (metadata only; files stay external)."""

    __tablename__ = "student_documents"
    __table_args__ = (
        ForeignKeyConstraint(["school_id", "student_id"], ["students.school_id", "students.id"], ondelete="RESTRICT"),
        UniqueConstraint("school_id", "id", name="uq_student_documents_school_id"),
        CheckConstraint("doc_type IN ('id_card', 'birth_certificate', 'previous_report', 'medical', 'consent', 'other')", name="ck_student_documents_type"),
        Index("ix_student_documents_school_student", "school_id", "student_id"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id", ondelete="RESTRICT"), nullable=False)
    student_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    doc_type: Mapped[str] = mapped_column(String(32), nullable=False)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    reference: Mapped[str | None] = mapped_column(String(80))
    issued_on: Mapped[date | None] = mapped_column(Date)
    notes: Mapped[str | None] = mapped_column(Text)
    created_by_user_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Announcement(Base):
    __tablename__ = "announcements"
    __table_args__ = (
        UniqueConstraint("school_id", "id", name="uq_announcements_school_id"),
        ForeignKeyConstraint(["school_id", "class_group_id"], ["class_groups.school_id", "class_groups.id"], ondelete="RESTRICT"),
        Index("ix_announcements_school_published", "school_id", "published_at"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id", ondelete="RESTRICT"), nullable=False)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    audience: Mapped[str] = mapped_column(String(40), nullable=False, default="all", server_default="all")
    class_group_id: Mapped[UUID | None] = mapped_column(Uuid)
    published_by_user_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="published", server_default="published")


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (
        UniqueConstraint("school_id", "id", name="uq_notifications_school_id"),
        Index("ix_notifications_user_read", "user_id", "read_at", "created_at"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id", ondelete="RESTRICT"), nullable=False)
    user_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    type: Mapped[str] = mapped_column(String(40), nullable=False, default="info", server_default="info")
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    link: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class NotificationCampaign(Base):
    """One school notice pushed to a chosen set of parents.

    The campaign is the durable record the school can review; each recipient
    also gets an ordinary ``Notification`` row so the family sees it in the
    app whether or not the push reached their device.
    """

    __tablename__ = "notification_campaigns"
    __table_args__ = (
        UniqueConstraint("school_id", "id", name="uq_notification_campaigns_school_id"),
        CheckConstraint(
            "audience IN ('all_parents', 'class', 'student')",
            name="ck_notification_campaigns_audience",
        ),
        ForeignKeyConstraint(
            ["school_id", "class_group_id"], ["class_groups.school_id", "class_groups.id"], ondelete="RESTRICT"
        ),
        ForeignKeyConstraint(
            ["school_id", "student_id"], ["students.school_id", "students.id"], ondelete="RESTRICT"
        ),
        Index("ix_notification_campaigns_school_created", "school_id", "created_at"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id", ondelete="RESTRICT"), nullable=False)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    audience: Mapped[str] = mapped_column(String(20), nullable=False)
    class_group_id: Mapped[UUID | None] = mapped_column(Uuid)
    student_id: Mapped[UUID | None] = mapped_column(Uuid)
    recipient_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    created_by_user_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


REQUEST_TOPICS = ("absence", "documents", "meeting", "fees", "details", "other")


class ParentRequest(Base):
    """A parent-initiated conversation with the school office.

    The row is the thread; ``ParentRequestMessage`` rows are the conversation.
    ``status`` and ``last_message_by`` together name whose turn it is, so each
    inbox can render an accurate badge without scanning messages. Requests are
    never deleted: resolving is a reversible state, and the thread keeps the
    full history for both sides.
    """

    __tablename__ = "parent_requests"
    __table_args__ = (
        UniqueConstraint("school_id", "id", name="uq_parent_requests_school_id"),
        UniqueConstraint("school_id", "reference", name="uq_parent_requests_reference"),
        ForeignKeyConstraint(["school_id", "student_id"], ["students.school_id", "students.id"], ondelete="RESTRICT"),
        ForeignKeyConstraint(["school_id", "guardian_id"], ["guardians.school_id", "guardians.id"], ondelete="RESTRICT"),
        CheckConstraint("status IN ('open', 'awaiting_parent', 'resolved')", name="ck_parent_requests_status"),
        CheckConstraint(
            "topic IN ('absence', 'documents', 'meeting', 'fees', 'details', 'other')",
            name="ck_parent_requests_topic",
        ),
        CheckConstraint("last_message_by IN ('parent', 'school')", name="ck_parent_requests_last_sender"),
        Index("ix_parent_requests_school_status", "school_id", "status", "last_message_at"),
        Index("ix_parent_requests_guardian", "guardian_id", "last_message_at"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id", ondelete="RESTRICT"), nullable=False)
    reference: Mapped[str] = mapped_column(String(12), nullable=False)
    student_id: Mapped[UUID | None] = mapped_column(Uuid)
    guardian_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    created_by_user_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    topic: Mapped[str] = mapped_column(String(24), nullable=False)
    subject: Mapped[str] = mapped_column(String(160), nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="open", server_default="open")
    last_message_by: Mapped[str] = mapped_column(String(12), nullable=False, default="parent", server_default="parent")
    last_message_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    last_message_preview: Mapped[str] = mapped_column(String(200), nullable=False, default="", server_default="")
    parent_last_read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    school_last_read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    first_school_reply_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_by_user_id: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="RESTRICT"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=utcnow)


class ParentRequestMessage(Base):
    """One turn in a parent request thread, authored by the parent or the school."""

    __tablename__ = "parent_request_messages"
    __table_args__ = (
        ForeignKeyConstraint(
            ["school_id", "request_id"], ["parent_requests.school_id", "parent_requests.id"], ondelete="RESTRICT"
        ),
        CheckConstraint("author_role IN ('parent', 'school')", name="ck_parent_request_messages_author"),
        Index("ix_parent_request_messages_thread", "school_id", "request_id", "created_at"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id", ondelete="RESTRICT"), nullable=False)
    request_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    author_user_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    author_role: Mapped[str] = mapped_column(String(12), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Task(Base):
    """A school-owned action item assigned to one staff member.

    REA mapping: Task is the resource acted upon; status transitions are events;
    the assignee and assigner are agents.
    """

    __tablename__ = "tasks"
    __table_args__ = (
        UniqueConstraint("school_id", "id", name="uq_tasks_school_id"),
        ForeignKeyConstraint(["school_id", "assigned_to_membership_id"], ["school_memberships.school_id", "school_memberships.id"], ondelete="RESTRICT"),
        ForeignKeyConstraint(["school_id", "assigned_by_membership_id"], ["school_memberships.school_id", "school_memberships.id"], ondelete="RESTRICT"),
        ForeignKeyConstraint(["school_id", "completed_by_membership_id"], ["school_memberships.school_id", "school_memberships.id"], ondelete="RESTRICT"),
        CheckConstraint("status IN ('open', 'in_progress', 'completed', 'cancelled')", name="ck_tasks_status"),
        CheckConstraint("priority IN ('low', 'medium', 'high')", name="ck_tasks_priority"),
        Index("ix_tasks_school_assigned", "school_id", "assigned_to_membership_id"),
        Index("ix_tasks_school_status", "school_id", "status"),
        Index("ix_tasks_school_due", "school_id", "due_on"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id", ondelete="RESTRICT"), nullable=False)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="open", server_default="open")
    priority: Mapped[str] = mapped_column(String(16), nullable=False, default="medium", server_default="medium")
    due_on: Mapped[date | None] = mapped_column(Date)
    assigned_to_membership_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    assigned_by_membership_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_by_membership_id: Mapped[UUID | None] = mapped_column(Uuid)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=utcnow)


class MobilePushDevice(Base):
    """An Expo push target registered by one authenticated school member."""

    __tablename__ = "mobile_push_devices"
    __table_args__ = (
        UniqueConstraint("school_id", "user_id", "push_token", name="uq_mobile_push_school_user_token"),
        Index("ix_mobile_push_school_user", "school_id", "user_id"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    push_token: Mapped[str] = mapped_column(String(255), nullable=False)
    platform: Mapped[str] = mapped_column(String(12), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=utcnow)
