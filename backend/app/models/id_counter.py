from sqlmodel import SQLModel, Field

class IdCounter(SQLModel, table=True):
    __tablename__ = "id_counters"

    entity_name: str = Field(primary_key=True)  
    current_value: int = Field(default=-1)