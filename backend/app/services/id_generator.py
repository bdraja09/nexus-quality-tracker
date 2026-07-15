from sqlmodel import Session, select
from app.models.id_counter import IdCounter

PREFIX = "226nexus"


def generate_id(session: Session, entity_name: str) -> str:
    """Génère un ID séquentiel du type 226nexus0000, propre à chaque table.
    Fonctionne aussi bien avec PostgreSQL qu'avec SQLite utilisé par les tests."""
    counter = session.exec(select(IdCounter).where(IdCounter.entity_name == entity_name)).first()

    if not counter:
        counter = IdCounter(entity_name=entity_name, current_value=0)
    else:
        counter.current_value += 1

    if counter.current_value > 9999:
        raise ValueError(f"Compteur d'ID épuisé pour '{entity_name}' (max 9999 atteint)")

    session.add(counter)
    session.flush()

    return f"{PREFIX}{counter.current_value:04d}"