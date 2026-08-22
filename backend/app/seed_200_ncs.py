"""
Génère 200 NC de test réparties sur les 12 derniers mois, avec un cycle de
vie réaliste (assignation, root cause, action corrective, clôture ou rejet).
"""
import random
from datetime import datetime, timedelta

from sqlmodel import Session, select

from app.database import engine
from app.models.non_conformance import NonConformance
from app.models.nc_event import NCEvent
from app.enums import NCState
from app.services import nc_service
from app.services.nc_service import add_root_cause, add_corrective_action

TOTAL_NCS = 200

DEPARTMENTS = ["226dept0000", "226dept0001", "226dept0002", "226dept0003", "226dept0004"]
MANAGER_ID = "226usr0000"
OPERATORS = ["226usr0001", "226usr0002"]

# transition_nc() vérifie le rôle via role_can_transition() — il faut donc
# lui passer un dict {"id", "role"}, pas juste un identifiant.
MANAGER_USER = {"id": MANAGER_ID, "role": "Manager"}


def operator_user(operator_id: str) -> dict:
    return {"id": operator_id, "role": "Operator"}


SEVERITIES = ["low", "medium", "high", "critical"]
SEVERITY_WEIGHTS = [0.30, 0.35, 0.25, 0.10]

ROOT_CAUSE_CATEGORIES = ["main_oeuvre", "methode", "materiel", "matiere", "milieu"]

TARGETS = ["RAISED", "ASSIGNED", "UNDER_INVESTIGATION", "CORRECTIVE_ACTION",
           "CLOSED", "REJECTED_EARLY", "REJECTED_LATE"]
TARGET_WEIGHTS = [0.08, 0.10, 0.10, 0.09, 0.55, 0.04, 0.04]

TITLE_TEMPLATES = [
    "Tolérance dimensionnelle dépassée — lot {n}",
    "Défaut de soudure — ligne d'assemblage {n}",
    "Certificat d'étalonnage expiré — outil TW-{n}",
    "Certificat de conformité manquant — lot {n}",
    "Étiquetage erroné — expédition SH-{n}",
    "Réclamation client — défaillance produit {n}",
    "Inspection de sécurité en retard — zone {n}",
    "Opérateur sans certification valide — poste {n}",
    "Déviation 5S — zone {n}",
    "Écart d'inventaire — SKU-{n}",
    "Constat d'audit interne — document WI-{n}",
    "Déploiement logiciel sans validation — module {n}",
]

DESCRIPTIONS = [
    "Écart détecté lors du contrôle qualité de routine, nécessite une revue.",
    "Signalé par l'opérateur pendant l'inspection post-production.",
    "Relevé lors de l'audit interne trimestriel.",
    "Remonté par le client suite à une réclamation formelle.",
    "Constaté lors de la vérification hebdomadaire des équipements.",
]


def weighted_choice(options, weights):
    return random.choices(options, weights=weights, k=1)[0]


def make_nc(session: Session, index: int) -> NonConformance:
    dept_id = random.choice(DEPARTMENTS)
    severity = weighted_choice(SEVERITIES, SEVERITY_WEIGHTS)
    raised_by = random.choice([MANAGER_ID] + OPERATORS)
    title = random.choice(TITLE_TEMPLATES).format(n=1000 + index)
    description = random.choice(DESCRIPTIONS)

    return nc_service.raise_nc(session, title, description, severity, dept_id, raised_by)


def walk_to_target(session: Session, nc: NonConformance, target: str) -> None:
    if target == "RAISED":
        return

    operator_id = random.choice(OPERATORS)
    due_date = (datetime.utcnow() + timedelta(days=random.randint(2, 10))).date()

    # assign_nc() ne fait pas de vérification de rôle — actor_id simple, pas de dict.
    nc_service.assign_nc(session, nc.id_nc, operator_id, due_date, actor_id=MANAGER_ID)
    if target == "ASSIGNED":
        return

    if target == "REJECTED_EARLY":
        nc_service.transition_nc(session, nc.id_nc, NCState.REJECTED, MANAGER_USER,
                                  notes="Jugée non pertinente après revue initiale.")
        return

    nc_service.transition_nc(session, nc.id_nc, NCState.UNDER_INVESTIGATION, operator_user(operator_id))
    add_root_cause(session, nc.id_nc, random.choice(ROOT_CAUSE_CATEGORIES),
                    "Cause identifiée lors de l'investigation.", operator_id)
    if target == "UNDER_INVESTIGATION":
        return

    if target == "REJECTED_LATE":
        nc_service.transition_nc(session, nc.id_nc, NCState.REJECTED, MANAGER_USER,
                                  notes="Investigation a révélé un doublon avec une NC existante.")
        return

    add_corrective_action(session, nc.id_nc, "Action corrective définie et assignée.",
                           operator_id, due_date)
    nc_service.transition_nc(session, nc.id_nc, NCState.CORRECTIVE_ACTION, operator_user(operator_id))
    if target == "CORRECTIVE_ACTION":
        return

    nc_service.transition_nc(session, nc.id_nc, NCState.CLOSED, MANAGER_USER)


def spread_dates_into_the_past(session: Session, nc_id: str) -> None:
    """Retale raised_at/closed_at et les timestamps des événements sur les
    12 derniers mois, pour que le dashboard (trend chart, KPI) affiche des
    données réalistes plutôt que tout daté d'aujourd'hui."""
    nc = session.get(NonConformance, nc_id)
    events = session.exec(
        select(NCEvent).where(NCEvent.nc_id == nc_id).order_by(NCEvent.timestamp)
    ).all()
    if not events:
        return

    days_ago = random.randint(1, 365)
    new_raised_at = datetime.utcnow() - timedelta(days=days_ago)

    if nc.current_state == NCState.CLOSED:
        duration_days = random.uniform(0.5, 4.5) if random.random() < 0.7 else random.uniform(5.5, 12)
        new_closed_at = new_raised_at + timedelta(days=duration_days)
        nc.closed_at = new_closed_at
    else:
        new_closed_at = None

    nc.raised_at = new_raised_at
    session.add(nc)

    span_end = new_closed_at or datetime.utcnow()
    span = max((span_end - new_raised_at).total_seconds(), 1)
    for i, event in enumerate(events):
        fraction = i / max(len(events) - 1, 1)
        event.timestamp = new_raised_at + timedelta(seconds=span * fraction)
        session.add(event)

    session.commit()


def main() -> None:
    created = []
    with Session(engine) as session:
        for i in range(TOTAL_NCS):
            nc = make_nc(session, i)
            target = weighted_choice(TARGETS, TARGET_WEIGHTS)
            walk_to_target(session, nc, target)
            created.append(nc.id_nc)
            if (i + 1) % 25 == 0:
                print(f"  ... {i + 1}/{TOTAL_NCS}")

    with Session(engine) as session:
        for nc_id in created:
            spread_dates_into_the_past(session, nc_id)

    print(f"\n✓ {len(created)} NC créées et datées de façon réaliste sur 12 mois.")


if __name__ == "__main__":
    main()