"""
Seed des données de référence : organisation, départements, comptes utilisateurs.

"""
import bcrypt
from sqlmodel import Session
from sqlalchemy import text

from app.database import engine
from app.models.departement import Department
from app.models.user import User

BCRYPT_COST = 12  # minimum imposé par la spec (§9.4)

ORG_ID = "226org0000"
ORG_NAME = "Nexus N3 Industries"

DEPARTMENTS = [
    ("226dept0000", "Production"),
    ("226dept0001", "Qualité & Conformité"),
    ("226dept0002", "Maintenance & Ingénierie"),
    ("226dept0003", "Logistique & Supply Chain"),
    ("226dept0004", "Ressources Humaines"),
]

USERS = [
    ("manager@nexus.com",   "Password123!", "Jean",   "Manager",   "Manager",  "226dept0000"),
    ("operator1@nexus.com", "Password123!", "Alice",  "Operateur", "Operator", "226dept0000"),
    ("operator2@nexus.com", "Password123!", "Marc",   "Operateur", "Operator", "226dept0001"),
    ("auditor@nexus.com",   "Password123!", "Sophie", "Auditeur",  "Auditor",  "226dept0001"),
    ("admin@nexus.com",     "Password123!", "Root",   "Admin",     "Admin",    "226dept0000"),
]


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt(rounds=BCRYPT_COST)).decode()


def resolve_org_table_name(session: Session) -> str:
    """Trouve le vrai nom de table référencé par la contrainte FK
    departments.org_id, plutôt que de supposer 'organisation' ou
    'organization'."""
    row = session.execute(text("""
        SELECT ccu.table_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu
          ON tc.constraint_name = ccu.constraint_name
         AND tc.table_schema = ccu.table_schema
        WHERE tc.table_name = 'departments'
          AND tc.constraint_type = 'FOREIGN KEY'
          AND tc.constraint_name LIKE '%org_id%'
    """)).first()
    if not row:
        raise RuntimeError(
            "Impossible de résoudre la contrainte FK departments.org_id — "
            "vérifiez qu'alembic upgrade head a bien été appliqué."
        )
    return row[0]


def main() -> None:
    with Session(engine) as session:
        org_table = resolve_org_table_name(session)
        print(f"→ Table organisation détectée en base : '{org_table}'")

        session.execute(
            text(f'INSERT INTO "{org_table}" (id_org, name) VALUES (:id_org, :name)'),
            {"id_org": ORG_ID, "name": ORG_NAME},
        )

        for dept_id, name in DEPARTMENTS:
            session.add(Department(id_dept=dept_id, org_id=ORG_ID, name=name))

        for i, (email, password, first_name, last_name, role, dept_id) in enumerate(USERS):
            session.add(User(
                id_usr=f"226usr{i:04d}",
                email=email,
                password=hash_password(password),
                first_name=first_name,
                last_name=last_name,
                role=role,
                departement_id=dept_id,
            ))

        session.commit()

    print(f"✓ 1 organisation, {len(DEPARTMENTS)} départements, {len(USERS)} comptes créés.\n")
    print("Identifiants de connexion :")
    for email, password, *_ in USERS:
        print(f"  {email} / {password}")


if __name__ == "__main__":
    main()