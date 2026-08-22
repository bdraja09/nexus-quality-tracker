"""
Seed des données de référence : organisation, départements, comptes utilisateurs.

Usage :  python app/seed_org.py

Prérequis : alembic upgrade head appliqué (schéma à jour). Le script est
idempotent : le relancer sur une base déjà partiellement seedée comble
ce qui manque, ligne par ligne, sans planter et sans dupliquer.
"""
import os

import bcrypt
from sqlmodel import Session
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.database import engine
from app.models.departement import Department
from app.models.user import User
from app.seed_base import ORG_ID, ORG_NAME, DEPARTMENTS, USERS

BCRYPT_COST = 12  


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt(rounds=BCRYPT_COST)).decode()


def guard_against_production() -> None:
    env = os.environ.get("APP_ENV", "").lower()
    if env in ("prod", "production"):
        raise RuntimeError(
            f"APP_ENV='{env}' -- refus de seed des comptes de test avec mots "
            "de passe connus sur un environnement de production."
        )


def resolve_org_table_name(session: Session) -> str:
    row = session.execute(text("""
        SELECT ccu.table_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu
          ON tc.constraint_name = ccu.constraint_name
         AND tc.table_schema = ccu.table_schema
        WHERE tc.table_name = 'departments'
          AND tc.constraint_type = 'FOREIGN KEY'
          AND kcu.column_name = 'org_id'
    """)).first()
    if not row:
        raise RuntimeError(
            "Impossible de résoudre la contrainte FK departments.org_id — "
            "vérifiez qu'alembic upgrade head a bien été appliqué."
        )
    return row[0]


def row_exists(session: Session, table: str, id_col: str, id_val: str) -> bool:
    row = session.execute(
        text(f'SELECT 1 FROM "{table}" WHERE "{id_col}" = :id_val'),
        {"id_val": id_val},
    ).first()
    return row is not None


def main() -> None:
    guard_against_production()

    with Session(engine) as session:
        org_table = resolve_org_table_name(session)
        print(f"→ Table organisation détectée en base : '{org_table}'")

        try:
            if row_exists(session, org_table, "id_org", ORG_ID):
                print(f"  organisation '{ORG_ID}' déjà présente, pas de ré-insertion.")
            else:
                session.execute(
                    text(f'INSERT INTO "{org_table}" (id_org, name) VALUES (:id_org, :name)'),
                    {"id_org": ORG_ID, "name": ORG_NAME},
                )
                print(f"  organisation '{ORG_ID}' créée.")

            depts_created = 0
            for dept_id, name in DEPARTMENTS:
                if row_exists(session, "departments", "id_dept", dept_id):
                    continue
                session.add(Department(id_dept=dept_id, org_id=ORG_ID, name=name))
                depts_created += 1
            print(f"  départements : {depts_created} créés, {len(DEPARTMENTS) - depts_created} déjà présents.")

            users_created = 0
            for i, (email, password, first_name, last_name, role, dept_id) in enumerate(USERS):
                user_id = f"226usr{i:04d}"
                if row_exists(session, "users", "id_usr", user_id):
                    continue
                session.add(User(
                    id_usr=user_id,
                    email=email,
                    password=hash_password(password),
                    first_name=first_name,
                    last_name=last_name,
                    role=role,
                    departement_id=dept_id,
                ))
                users_created += 1
            print(f"  utilisateurs : {users_created} créés, {len(USERS) - users_created} déjà présents.")

            session.commit()
        except IntegrityError:
            session.rollback()
            raise RuntimeError(
                "Échec d'insertion (contrainte violée) — vérifiez l'état des "
                "tables organisation/departments/users."
            ) from None

    print(f"\n✓ Seed org terminé — organisation, {len(DEPARTMENTS)} départements, "
          f"{len(USERS)} comptes garantis présents.\n")
    print("Identifiants de connexion :")
    for email, password, *_ in USERS:
        print(f"  {email} / {password}")


if __name__ == "__main__":
    main()