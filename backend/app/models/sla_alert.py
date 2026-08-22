from datetime import datetime
from enum import Enum
from typing import Optional
from sqlmodel import SQLModel, Field
from sqlalchemy import Index, text


class SlaAlertType(str, Enum):
    """Optionnel mais recommandé : évite les chaînes magiques éparpillées
    dans sla_service.py. Compatible avec la colonne str existante — pas
    besoin de migration, juste remplacer les literals "WARNING" etc."""
    WARNING = "WARNING"
    BREACHED = "BREACHED"
    RESOLVED = "RESOLVED"


class SlaAlert(SQLModel, table=True):
    __tablename__ = "sla_alerts"

    id: Optional[int] = Field(default=None, primary_key=True)
    nc_id: str = Field(index=True, foreign_key="non_conformances.id_nc")
    alert_type: SlaAlertType
    created_at: datetime = Field(default_factory=datetime.utcnow)
    resolved_at: Optional[datetime] = None
    is_read: bool = Field(default=False, nullable=False, index=True)
    read_at: Optional[datetime] = None
    read_by: Optional[str] = Field(default=None, foreign_key="users.id_usr")
    deleted_at: Optional[datetime] = None

    __table_args__ = (
        Index(
            "ux_sla_alerts_nc_type_active",
            "nc_id", "alert_type",
            unique=True,
            postgresql_where=text("resolved_at IS NULL AND deleted_at IS NULL"),
        ),
        Index(
            "ix_sla_alerts_unread_visible",
            "is_read",
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )
