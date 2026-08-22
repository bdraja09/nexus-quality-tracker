from sqlmodel import SQLModel, Field


class Organisation(SQLModel, table=True):
    __tablename__ = "organization"

    id_org: str = Field(primary_key=True)
    name: str

    @property
    def id(self) -> str:
        return self.id_org
