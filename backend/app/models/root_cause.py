from sqlmodel import SQLModel, Field
from uuid import UUID, uuid4
from datetime import datetime

class RootCause(SQLModel, table=True):
    __tablename__ = "root_causes"
    
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    nc_id: UUID = Field(foreign_key="non_conformances.id")
    category: str
    description: str
    identified_by: UUID = Field(foreign_key="users.id")
    identified_at: datetime = Field(default_factory=datetime.utcnow)