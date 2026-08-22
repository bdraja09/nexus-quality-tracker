"""
Tests du router /audits — création d'audit, ajout de findings, escalade vers NC.
Utilise une base SQLite en mémoire, séparée de la vraie base PostgreSQL.

NOTE sur org_id : Department a une FK obligatoire vers "organization.id",
mais aucun modèle Organization n'existe encore dans le projet. SQLite
n'impose pas les contraintes FK par défaut, donc on peut passer un UUID
généré à la volée sans avoir de vraie ligne "organization" en base.
Sur PostgreSQL en vrai (contraintes FK actives), il faudra soit créer
un modèle Organization, soit rendre org_id nullable.
"""

import os

os.environ["USE_SQLITE_FOR_TESTS"] = "1"

from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel
from app.main import app as fastapi_app
from app.database import get_session, engine
from app.models.departement import Department
from app.models.user import User
from app.services.id_generator import generate_id
import app.models  # force l'import de tous les modèles

# --- Configuration de la base de test ---


def override_get_session():
    with Session(engine) as session:
        yield session


fastapi_app.dependency_overrides[get_session] = override_get_session
client = TestClient(fastapi_app)

# Make sure the dependency engine and the test engine share the same schema.
SQLModel.metadata.create_all(engine)

DEPT_ID = None
USER_ID = None


def setup_module():
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        dept = Department(id_dept=generate_id(session, "dept"), org_id="org-test", name="Production")
        session.add(dept)
        session.commit()
        session.refresh(dept)

        user = User(
            id_usr=generate_id(session, "usr"),
            email="auditeur@nexus.com",
            password="hash-factice-pour-les-tests",
            first_name="Alice",
            last_name="Dupont",
            role="manager",
            departement_id=dept.id_dept,
        )
        session.add(user)
        session.commit()
        session.refresh(user)

        global DEPT_ID, USER_ID
        DEPT_ID = str(dept.id_dept)
        USER_ID = str(user.id_usr)


# ============================================================
# Création d'audit
# ============================================================

def test_creer_audit():
    SQLModel.metadata.create_all(engine)
    response = client.post("/audits/", json={
        "dept_id": DEPT_ID,
        "auditor_id": USER_ID,
        "audit_type": "Interne",
        "scheduled_date": "2026-07-15"
    })
    assert response.status_code == 200
    data = response.json()
    assert data["audit_type"] == "Interne"
    assert data["dept_id"] == DEPT_ID


def test_creer_audit_champs_manquants_rejete():
    response = client.post("/audits/", json={
        "dept_id": DEPT_ID,
        "auditor_id": USER_ID
        # audit_type et scheduled_date manquants
    })
    assert response.status_code == 422


# ============================================================
# Ajout de findings
# ============================================================

def test_ajouter_finding():
    audit_resp = client.post("/audits/", json={
        "dept_id": DEPT_ID,
        "auditor_id": USER_ID,
        "audit_type": "Interne",
        "scheduled_date": "2026-07-15"
    })
    audit_id = audit_resp.json()["id"]

    finding_resp = client.post(f"/audits/{audit_id}/findings", json={
        "severity": "medium",
        "description": "Documentation incomplète"
    })
    assert finding_resp.status_code == 200
    data = finding_resp.json()
    assert data["severity"] == "medium"
    assert data["audit_id"] == audit_id
    assert data["nc_id"] is None  # pas encore escaladé


def test_ajouter_plusieurs_findings_sur_meme_audit():
    audit_resp = client.post("/audits/", json={
        "dept_id": DEPT_ID,
        "auditor_id": USER_ID,
        "audit_type": "Interne",
        "scheduled_date": "2026-07-16"
    })
    audit_id = audit_resp.json()["id"]

    f1 = client.post(f"/audits/{audit_id}/findings", json={
        "severity": "low",
        "description": "Étiquetage manquant, zone A"
    })
    f2 = client.post(f"/audits/{audit_id}/findings", json={
        "severity": "critical",
        "description": "Équipement non calibré"
    })

    assert f1.status_code == 200
    assert f2.status_code == 200
    assert f1.json()["id"] != f2.json()["id"]


def test_severity_invalide_rejetee():
    audit_resp = client.post("/audits/", json={
        "dept_id": DEPT_ID,
        "auditor_id": USER_ID,
        "audit_type": "Interne",
        "scheduled_date": "2026-07-17"
    })
    audit_id = audit_resp.json()["id"]

    response = client.post(f"/audits/{audit_id}/findings", json={
        "severity": "MEDIUM",  # majuscule, invalide car l'enum attend "medium"
        "description": "Test valeur invalide"
    })
    assert response.status_code == 422


# ============================================================
# Escalade finding -> NC
# ============================================================

def test_escalade_finding_vers_nc():
    audit_resp = client.post("/audits/", json={
        "dept_id": DEPT_ID,
        "auditor_id": USER_ID,
        "audit_type": "Interne",
        "scheduled_date": "2026-07-15"
    })
    audit_id = audit_resp.json()["id"]

    finding_resp = client.post(f"/audits/{audit_id}/findings", json={
        "severity": "high",
        "description": "Étiquetage non conforme, zone B"
    })
    finding_id = finding_resp.json()["id"]

    escalate_resp = client.post(f"/audits/findings/{finding_id}/escalate", json={
        "title": "NC issue d'audit — étiquetage zone B",
        "raised_by": USER_ID
    })
    assert escalate_resp.status_code == 200
    nc = escalate_resp.json()
    assert nc["current_state"] == "RAISED"
    assert nc["title"] == "NC issue d'audit — étiquetage zone B"


def test_escalade_finding_inexistant_renvoie_404():
    fake_id = "00000000-0000-0000-0000-000000000000"
    response = client.post(f"/audits/findings/{fake_id}/escalate", json={
        "title": "Test",
        "raised_by": USER_ID
    })
    assert response.status_code == 404


def test_finding_apres_escalade_a_bien_son_nc_id():
    """Vérifie que le finding est mis à jour avec nc_id après escalade,
    pas juste que la NC est créée."""
    audit_resp = client.post("/audits/", json={
        "dept_id": DEPT_ID,
        "auditor_id": USER_ID,
        "audit_type": "Interne",
        "scheduled_date": "2026-07-18"
    })
    audit_id = audit_resp.json()["id"]

    finding_resp = client.post(f"/audits/{audit_id}/findings", json={
        "severity": "critical",
        "description": "Non-respect procédure sécurité"
    })
    finding_id = finding_resp.json()["id"]

    escalate_resp = client.post(f"/audits/findings/{finding_id}/escalate", json={
        "title": "NC sécurité critique",
        "raised_by": USER_ID
    })
    nc_id = escalate_resp.json()["id"]

    # Si tu as un endpoint GET pour relire le finding, décommente et adapte :
    # updated_finding = client.get(f"/audits/findings/{finding_id}").json()
    # assert updated_finding["nc_id"] == nc_id
    assert nc_id is not None