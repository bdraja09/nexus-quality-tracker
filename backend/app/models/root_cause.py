from sqlmodel import SQLModel, Field
from datetime import datetime


class RootCause(SQLModel, table=True):
    __tablename__ = "root_causes"

    id_cause: str = Field(primary_key=True)
    nc_id: str = Field(foreign_key="non_conformances.id_nc")
    category: str
    description: str
    identified_by: str = Field(foreign_key="users.id_usr")
    identified_at: datetime = Field(default_factory=datetime.utcnow)