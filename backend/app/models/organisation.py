from sqlmodel import SQLModel, Field
from uuid import UUID, uuid4

class Organisation(SQLModel, table=True):
    __tablename__ = "organization"
    
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    name: str
