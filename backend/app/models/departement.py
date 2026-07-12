from sqlmodel import SQLModel, Field
import uuid


class Department(SQLModel, table=True):
    __tablename__ = "departments"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    org_id: uuid.UUID = Field(foreign_key="organization.id")
    name: str = Field(max_length=255)