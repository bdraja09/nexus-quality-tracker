from sqlmodel import SQLModel, Field


class Department(SQLModel, table=True):
    __tablename__ = "departments"

    id_dept: str = Field(primary_key=True)
    org_id: str = Field(foreign_key="organization.id_org")
    name: str = Field(max_length=255)

    @property
    def id(self) -> str:
        return self.id_dept