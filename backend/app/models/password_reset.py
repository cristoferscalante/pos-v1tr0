from datetime import datetime
import uuid

from sqlmodel import Field, SQLModel


class PasswordResetToken(SQLModel, table=True):
    __tablename__ = "password_reset_token"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    token_hash: str = Field(index=True, unique=True, max_length=128)
    expires_at: datetime = Field(index=True)
    used_at: datetime | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
