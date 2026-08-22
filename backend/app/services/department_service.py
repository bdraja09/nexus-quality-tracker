from typing import List
from sqlmodel import select
from app.models.departement import Department


def list_departments(session) -> List[Department]:
    stmt = select(Department).order_by(Department.name)
    return session.exec(stmt).all()