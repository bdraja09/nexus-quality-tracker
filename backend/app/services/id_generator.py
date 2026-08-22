import warnings
from sqlmodel import Session, select
from app.models.id_counter import IdCounter

# Préfixe spécifique à chaque entité : 226<code><4 chiffres>
ENTITY_PREFIXES: dict[str, str] = {
    "usr":     "226usr",   
    "nc":      "226nc",    
    "event":   "226evt",   
    "cause":   "226cse",   
    "action":  "226act",   
    "audit":   "226aud",   
    "finding": "226fnd",   
    "dept":    "226dpt", 
}

FALLBACK_PREFIX = "226xxx"


def generate_id(session: Session, entity_name: str) -> str:
    """Génère un ID séquentiel du type 226<code>XXXX, propre à chaque table.
    Le préfixe est déterminé par ENTITY_PREFIXES selon le nom de l'entité.
    Fonctionne aussi bien avec PostgreSQL qu'avec SQLite utilisé par les tests."""
    prefix = ENTITY_PREFIXES.get(entity_name)
    if prefix is None:
        warnings.warn(
            f"Entité '{entity_name}' absente de ENTITY_PREFIXES — préfixe '{FALLBACK_PREFIX}' utilisé. "
            "Ajoutez-la dans id_generator.py.",
            stacklevel=2,
        )
        prefix = FALLBACK_PREFIX

    counter = session.exec(select(IdCounter).where(IdCounter.entity_name == entity_name)).first()

    if not counter:
        counter = IdCounter(entity_name=entity_name, current_value=0)
    else:
        counter.current_value += 1

    if counter.current_value > 9999:
        raise ValueError(f"Compteur d'ID épuisé pour '{entity_name}' (max 9999 atteint)")

    session.add(counter)
    session.flush()

    return f"{prefix}{counter.current_value:04d}"