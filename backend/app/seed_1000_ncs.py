"""
seed_1000_ncs.py — Génère 1000 NC de test avec cycle de vie réaliste.

"""
import random
from datetime import datetime, timedelta

from sqlalchemy import text
from sqlmodel import Session, select

from app.database import engine
from app.models.non_conformance import NonConformance
from app.models.nc_event import NCEvent
from app.enums import NCState
from app.services import nc_service
from app.services.nc_service import add_root_cause, add_corrective_action

# ---------------------------------------------------------------------------
# CONFIGURATION
# ---------------------------------------------------------------------------
TOTAL_NCS = 1000
HORIZON_DAYS = 730

USE_SEVERITY_DEPT_INTERACTION = False

# Poids bruts (entiers)
RAISED_RAW        = 6
ASSIGNED_RAW      = 8
UNDER_INVESTIGATION_RAW = 8
CORRECTIVE_ACTION_RAW   = 7
CLOSED_RAW        = 65
REJECTED_EARLY_RAW      = 3
REJECTED_LATE_RAW       = 3

raw_weights = [
    RAISED_RAW, ASSIGNED_RAW, UNDER_INVESTIGATION_RAW,
    CORRECTIVE_ACTION_RAW, CLOSED_RAW,
    REJECTED_EARLY_RAW, REJECTED_LATE_RAW,
]

TARGET_WEIGHTS = [w / sum(raw_weights) for w in raw_weights]

TARGETS = [
    "RAISED", "ASSIGNED", "UNDER_INVESTIGATION", "CORRECTIVE_ACTION",
    "CLOSED", "REJECTED_EARLY", "REJECTED_LATE",
]

assert len(TARGETS) == len(TARGET_WEIGHTS)
assert abs(sum(TARGET_WEIGHTS) - 1.0) < 1e-9

DEPARTMENTS = ["226dept0000", "226dept0001", "226dept0002", "226dept0003", "226dept0004"]
MANAGER_ID = "226usr0000"
OPERATORS = ["226usr0001", "226usr0002"]

OPERATOR_HOME_DEPT = {
    "226usr0001": "226dept0000",
    "226usr0002": "226dept0001",
}

MANAGER_USER = {"id": MANAGER_ID, "role": "Manager"}

SEVERITIES = ["low", "medium", "high", "critical"]
SEVERITY_WEIGHTS = [0.30, 0.35, 0.25, 0.10]


OVERDUE_PROBABILITY_BY_SEVERITY = {
    "critical": 0.45,
    "high": 0.35,
    "medium": 0.25,
    "low": 0.15,
}


OVERDUE_PROBABILITY_BY_SEVERITY_DEPT = {
    ("critical", "226dept0000"): 0.35, ("critical", "226dept0001"): 0.40,
    ("critical", "226dept0002"): 0.50, ("critical", "226dept0003"): 0.45,
    ("critical", "226dept0004"): 0.55,

    ("high", "226dept0000"):     0.25, ("high", "226dept0001"):     0.30,
    ("high", "226dept0002"):     0.40, ("high", "226dept0003"):     0.35,
    ("high", "226dept0004"):     0.45,

    ("medium", "226dept0000"):   0.15, ("medium", "226dept0001"):   0.20,
    ("medium", "226dept0002"):   0.30, ("medium", "226dept0003"):   0.25,
    ("medium", "226dept0004"):   0.35,

    ("low", "226dept0000"):      0.10, ("low", "226dept0001"):      0.12,
    ("low", "226dept0002"):      0.20, ("low", "226dept0003"):      0.18,
    ("low", "226dept0004"):      0.25,
}

MONTH_WEIGHTS = {
    1: 0.8, 2: 0.8, 3: 0.9, 4: 0.9, 5: 0.9, 6: 0.8,
    7: 0.7, 8: 0.7, 9: 1.1, 10: 1.2, 11: 1.6, 12: 1.7,
}

ROOT_CAUSE_CATEGORIES = ["main_oeuvre", "methode", "materiel", "matiere", "milieu"]

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


# ---------------------------------------------------------------------------
# HELPERS
# ---------------------------------------------------------------------------
def operator_user(operator_id: str) -> dict:
    return {"id": operator_id, "role": "Operator"}


def pick_operator_for_dept(dept_id: str) -> str:
    same_dept = [op for op, d in OPERATOR_HOME_DEPT.items() if d == dept_id]
    return random.choice(same_dept) if same_dept else random.choice(OPERATORS)


def weighted_choice(options, weights):
    return random.choices(options, weights=weights, k=1)[0]


def get_overdue_probability(severity: str, dept_id: str) -> float:
    """Point d'entrée unique pour la probabilité de retard, qui bascule
    entre severity seule et severity x dept_id selon USE_SEVERITY_DEPT_INTERACTION,
    pour ne pas avoir a modifier spread_dates_into_the_past() selon le mode choisi."""
    if USE_SEVERITY_DEPT_INTERACTION:
        return OVERDUE_PROBABILITY_BY_SEVERITY_DEPT[(severity, dept_id)]
    return OVERDUE_PROBABILITY_BY_SEVERITY[severity]


def sample_days_ago(reference: datetime, horizon: int = HORIZON_DAYS) -> int:
    candidates = list(range(1, horizon + 1))
    weights = [MONTH_WEIGHTS[(reference - timedelta(days=d)).month] for d in candidates]
    return random.choices(candidates, weights=weights, k=1)[0]


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

    operator_id = pick_operator_for_dept(nc.dept_id)
    due_date = (datetime.utcnow() + timedelta(days=random.randint(2, 10))).date()

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
    nc = session.get(NonConformance, nc_id)
    events = session.exec(
        select(NCEvent).where(NCEvent.nc_id == nc_id).order_by(NCEvent.timestamp)
    ).all()
    if not events:
        return

    days_ago = sample_days_ago(datetime.utcnow())
    new_raised_at = datetime.utcnow() - timedelta(days=days_ago)

    if nc.current_state == NCState.CLOSED:
        overdue_prob = get_overdue_probability(nc.severity, nc.dept_id)
        duration_days = (
            random.uniform(5.5, 12) if random.random() < overdue_prob
            else random.uniform(0.5, 4.5)
        )
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


def fix_due_date(session: Session, nc_id: str) -> None:
    nc = session.get(NonConformance, nc_id)
    if not nc or nc.due_date is None:
        return
    nc.due_date = (nc.raised_at + timedelta(days=random.randint(2, 10))).date()
    session.add(nc)
    session.commit()


# ---------------------------------------------------------------------------
# MAIN
# ---------------------------------------------------------------------------
def main() -> None:
    mode = "severity x dept_id" if USE_SEVERITY_DEPT_INTERACTION else "severity seule"
    print("=" * 60)
    print(f" SEED NC — {TOTAL_NCS} NC sur {HORIZON_DAYS} jours (mode : {mode})")
    print("=" * 60)

    with Session(engine) as session:
        created = []
        for i in range(TOTAL_NCS):
            nc = make_nc(session, i)
            target = weighted_choice(TARGETS, TARGET_WEIGHTS)
            walk_to_target(session, nc, target)
            created.append(nc.id_nc)
            if (i + 1) % 100 == 0:
                print(f"  ... {i + 1}/{TOTAL_NCS}")

        print("\n[DATES] Étalement chronologique et recalage des due_date...")
        for nc_id in created:
            spread_dates_into_the_past(session, nc_id)
            fix_due_date(session, nc_id)

        total = session.exec(text("SELECT COUNT(*) FROM non_conformances")).scalar_one()
        closed = session.exec(text(
            "SELECT COUNT(*) FROM non_conformances WHERE current_state = 'CLOSED'"
        )).scalar_one()
        rejected = session.exec(text(
            "SELECT COUNT(*) FROM non_conformances WHERE current_state = 'REJECTED'"
        )).scalar_one()
        labeled = closed + rejected

        print("\n" + "=" * 60)
        print(" RÉSULTAT")
        print("=" * 60)
        print(f"  Total NC        : {total}")
        print(f"  Clôturées       : {closed}")
        print(f"  Rejetées        : {rejected}")
        print(f"  Avec label      : {labeled}  (utilisables pour le ML)")
        print(f"  Premier ID      : {created[0]}")
        print(f"  Dernier ID      : {created[-1]}")
        print("\nOK Seed terminé proprement.")

        expected_test = int(labeled * 0.2)
        print(f"\n[ML] Avec un split 80/20 stratifié, vous aurez ~{expected_test}")
        print(f"     échantillons de test avec label. Minimum recommandé : 100.")
        if expected_test < 100:
            print("     -> Augmentez TOTAL_NCS à 2000+ pour des métriques stables.")


if __name__ == "__main__":
    main()
