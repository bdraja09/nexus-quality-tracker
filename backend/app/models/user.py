from sqlmodel import SQLModel, Field


class User(SQLModel, table=True):
    __tablename__ = "users"

    id_usr: str = Field(primary_key=True)
    email: str = Field(max_length=255)
    password: str = Field(max_length=255)
    first_name: str = Field(max_length=255)
    last_name: str = Field(max_length=255)
    role: str = Field(max_length=255)
    departement_id: str = Field(foreign_key="departments.id_dept")

    @property
    def id(self) -> str:
        return self.id_usr