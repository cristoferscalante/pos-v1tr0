from datetime import datetime
from typing import Any, Optional
import uuid

from sqlmodel import Column, Field, JSON, SQLModel


class NotificationRuleBase(SQLModel):
    tenant_id: uuid.UUID = Field(foreign_key="tenant.id", index=True)
    event_type: str = Field(index=True)
    enabled: bool = Field(default=False)
    recipients: Any = Field(default_factory=list, sa_column=Column(JSON, nullable=False, server_default='[]'))
    meta_data: Any = Field(default_factory=dict, sa_column=Column(JSON, nullable=False, server_default='{}'))
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class NotificationRule(NotificationRuleBase, table=True):
    __tablename__ = "notification_rule"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)


class NotificationRuleRead(NotificationRuleBase):
    id: uuid.UUID


class NotificationRuleUpdate(SQLModel):
    enabled: Optional[bool] = None
    recipients: Optional[list[str]] = None
    meta_data: Optional[dict[str, Any]] = None


class NotificationLogBase(SQLModel):
    tenant_id: uuid.UUID = Field(foreign_key="tenant.id", index=True)
    event_type: str = Field(index=True)
    recipient: str = Field(index=True)
    subject: str
    status: str = Field(default="pending", index=True)
    error_message: Optional[str] = None
    payload: Any = Field(default_factory=dict, sa_column=Column(JSON, nullable=False, server_default='{}'))
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)


class NotificationLog(NotificationLogBase, table=True):
    __tablename__ = "notification_log"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)


class NotificationTestRequest(SQLModel):
    recipient: str
