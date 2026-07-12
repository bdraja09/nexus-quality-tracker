<div align="center">

# Nexus 4.0 — Module Qualité & Non-Conformités

**Suivi des non-conformités conforme ISO 9001:2015 (clause 10.2)**

Projet 3 du programme d'internat *Nexus 4.0* — réf. `NEX-P3-QUALITY-2026`

![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white)
![Angular](https://img.shields.io/badge/Angular-19-DD0031?logo=angular&logoColor=white)
![SQLModel](https://img.shields.io/badge/SQLModel-ORM-informational)
![License](https://img.shields.io/badge/status-en%20développement-yellow)

</div>

---

## Sommaire

- [Contexte](#contexte)
- [Architecture](#architecture)
- [Cycle de vie d'une non-conformité](#cycle-de-vie-dune-non-conformité)
- [Modèle de données](#modèle-de-données)
- [Stack technique](#stack-technique)
- [Structure du projet](#structure-du-projet)
- [Installation](#installation)
- [Endpoints API](#endpoints-api)
- [Tests](#tests)
- [État d'avancement](#état-davancement)

---

## Contexte

La clause **10.2** de la norme ISO 9001:2015 impose de réagir aux non-conformités, d'évaluer le besoin d'actions correctives, et de conserver des informations documentées. Ce module implémente cette exigence via un système de suivi en temps réel, avec pour objectif un **temps moyen de clôture inférieur à 5 jours**.

Le module a un double rôle :
1. **Outil opérationnel** pour les responsables qualité au quotidien
2. **Source de données d'entraînement** pour le module IA prédictif (P5), qui apprend à anticiper les non-conformités à risque de dépassement de délai

---

## Architecture

```mermaid
graph TD
    A[Angular — Formulaires, dashboard] -->|HTTP + JWT| B[FastAPI — Routes & validation]
    B --> C[Services — Machine à états, logique métier]
    C --> D[SQLModel — ORM]
    D --> E[(PostgreSQL)]
    F[Alembic] -.versionne le schéma.-> D
    F -.applique les migrations.-> E
    G[Job SLA — cron 24h] -->|lecture| E
    G -->|alerte| H[Assigné + Manager]
```

Angular consomme l'API FastAPI, protégée par JWT. FastAPI délègue la logique métier à une couche de services contenant la machine à états, qui persiste via SQLModel dans PostgreSQL. Alembic gère l'évolution du schéma dans le temps. Un job planifié vérifie chaque jour les délais de traitement et déclenche des alertes SLA.

---

## Cycle de vie d'une non-conformité

```mermaid
stateDiagram-v2
    [*] --> RAISED : Signalement direct ou escalade d'audit
    RAISED --> ASSIGNED : Manager assigne un responsable
    ASSIGNED --> UNDER_INVESTIGATION : Assigné accuse réception
    ASSIGNED --> REJECTED : Manager juge invalide/doublon
    UNDER_INVESTIGATION --> CORRECTIVE_ACTION : Cause racine identifiée
    UNDER_INVESTIGATION --> REJECTED : Manager juge invalide/doublon
    CORRECTIVE_ACTION --> CLOSED : Manager vérifie la résolution
    CORRECTIVE_ACTION --> UNDER_INVESTIGATION : Action jugée insuffisante
    CLOSED --> [*]
    REJECTED --> [*]
```

Chaque transition est validée par la machine à états et journalisée dans `nc_events` (timestamp, acteur, état précédent/suivant), formant l'historique immuable utilisé pour le calcul du KPI et l'entraînement du modèle IA (P5).

---

## Modèle de données

```mermaid
erDiagram
    ORGANIZATION ||--o{ DEPARTMENT : possède
    DEPARTMENT ||--o{ USER : emploie
    DEPARTMENT ||--o{ NON_CONFORMANCE : concerne
    DEPARTMENT ||--o{ AUDIT : audité

    USER ||--o{ NON_CONFORMANCE : lève
    USER ||--o{ NC_EVENT : déclenche
    USER ||--o{ AUDIT : mène

    NON_CONFORMANCE ||--o{ NC_EVENT : historise
    NON_CONFORMANCE ||--o{ ROOT_CAUSE : identifie
    NON_CONFORMANCE ||--o{ CORRECTIVE_ACTION : corrige
    NON_CONFORMANCE ||--o| AUDIT_FINDING : origine

    AUDIT ||--o{ AUDIT_FINDING : produit

    ORGANIZATION {
        uuid id PK
        string name
    }
    DEPARTMENT {
        uuid id PK
        uuid org_id FK
        string name
    }
    USER {
        uuid id PK
        string email
        string role
        uuid departement_id FK
    }
    NON_CONFORMANCE {
        uuid id PK
        string ref_code
        string title
        string severity
        string current_state
        uuid dept_id FK
        uuid raised_by FK
        datetime raised_at
        datetime closed_at
    }
    NC_EVENT {
        uuid id PK
        uuid nc_id FK
        string from_state
        string to_state
        uuid actor_id FK
        datetime timestamp
    }
    ROOT_CAUSE {
        uuid id PK
        uuid nc_id FK
        string category
    }
    CORRECTIVE_ACTION {
        uuid id PK
        uuid nc_id FK
        date due_date
        datetime completed_at
    }
    AUDIT {
        uuid id PK
        uuid dept_id FK
        uuid auditor_id FK
        date scheduled_date
    }
    AUDIT_FINDING {
        uuid id PK
        uuid audit_id FK
        uuid nc_id FK
        string severity
    }
```

---

## Stack technique

| Couche | Technologie |
|---|---|
| Backend | Python 3.12, FastAPI |
| ORM | SQLModel (SQLAlchemy + Pydantic) |
| Base de données | PostgreSQL |
| Migrations | Alembic |
| Authentification | JWT (bcrypt pour le hachage des mots de passe) |
| Frontend | Angular 19 |
| Tests | Pytest, TestClient FastAPI |

---

## Structure du projet

```
Nexus3/
├── backend/
│   ├── app/
│   │   ├── models/          # NonConformance, NCEvent, RootCause, CorrectiveAction,
│   │   │                    # Audit, AuditFinding, User, Department, Organization
│   │   ├── routers/         # nc_router, audit_router, auth_router, dashboard_router, export_router
│   │   ├── services/        # state_machine.py, nc_service.py, audit_service.py
│   │   ├── jobs/            # sla_job.py — vérification quotidienne des délais
│   │   ├── enums.py         # NCState, Severity, NCType, NCStatus
│   │   ├── auth.py          # Login, hachage, génération JWT
│   │   ├── database.py      # Engine, Session
│   │   └── main.py
│   ├── alembic/
│   └── tests/
└── frontend/
    └── src/app/
        ├── authentication/  # signin, forgot-password, locked, page404/500
        ├── admin/
        │   └── quality/     # nc-form, (à venir : nc-list, dashboard)
        ├── core/            # services partagés (auth, nc), guards
        └── shared/          # composants réutilisables
```

---

## Installation

### Prérequis
- Python 3.12+
- PostgreSQL
- Node.js + Angular CLI

### Backend

```bash
cd backend
python3 -m venv env
source env/bin/activate
pip install -r requirements.txt
```

Fichier `.env` à la racine de `backend/` :
```env
DATABASE_URL=postgresql://nexus_user:motdepasse@localhost:5432/nexus_p3
JWT_SECRET=change-moi-en-production
JWT_ALGORITHM=HS256
```

Création de la base :
```bash
sudo service postgresql start
sudo -u postgres psql -c "CREATE USER nexus_user WITH PASSWORD 'motdepasse';"
sudo -u postgres psql -c "CREATE DATABASE nexus_p3 OWNER nexus_user;"
```

Lancement :
```bash
uvicorn app.main:app --reload
```

→ API : `http://localhost:8000` · Documentation interactive : `http://localhost:8000/docs`

### Frontend

```bash
cd frontend
npm install --legacy-peer-deps
ng serve
```

→ Application : `http://localhost:4200`

---

## Endpoints API

| Méthode | Route | Description |
|---|---|---|
| `POST` | `/auth/login` | Authentification, retourne un JWT |
| `POST` | `/nc/` | Lever une non-conformité |
| `POST` | `/nc/{id}/transition` | Changer l'état d'une NC (validé par la machine à états) |
| `GET` | `/nc/{id}` | Détail d'une NC |
| `GET` | `/nc/{id}/events` | Historique complet des transitions |
| `POST` | `/nc/{id}/root-cause` | Enregistrer une cause racine |
| `POST` | `/nc/{id}/corrective-action` | Définir une action corrective |
| `POST` | `/audits/` | Planifier un audit |
| `POST` | `/audits/{id}/findings` | Ajouter un constat d'audit |
| `POST` | `/audits/findings/{id}/escalate` | Escalader un constat en NC formelle |

Documentation complète et interactive disponible via Swagger sur `/docs`.

---

## Tests

```bash
cd backend
pytest tests/ -v
```

Couverture actuelle : machine à états (transitions valides/invalides), cycle de vie complet d'une NC, workflow d'audit avec escalade.

---


<div align="center">

Projet réalisé dans le cadre du programme d'internat **TeachCODEX** — Nexus 4.0 (`NEX-FS-INTERN-2026`)

</div>