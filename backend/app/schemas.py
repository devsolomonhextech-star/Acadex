import re

from pydantic import BaseModel, EmailStr, Field, field_validator


class SchoolRegistration(BaseModel):
    school_name: str = Field(min_length=2, max_length=160)
    school_slug: str = Field(min_length=3, max_length=80)
    administrator_name: str = Field(min_length=2, max_length=160)
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)

    @field_validator("school_slug")
    @classmethod
    def slug_is_safe(cls, value: str) -> str:
        value = value.strip().lower()
        if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", value):
            raise ValueError("Use lowercase letters, numbers, and single hyphens")
        return value

    @field_validator("email")
    @classmethod
    def email_is_normalized(cls, value: EmailStr) -> str:
        return str(value).strip().casefold()


class LoginRequest(BaseModel):
    school_slug: str = Field(min_length=3, max_length=80)
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: EmailStr) -> str:
        return str(value).strip().casefold()


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    csrf_token: str


class UserContextResponse(BaseModel):
    user_id: str
    school_id: str
    school_name: str
    school_slug: str
    display_name: str
    email: str
    role: str
