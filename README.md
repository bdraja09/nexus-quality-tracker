<div align="center">

# Nexus 4.0 — Module Qualité & Non-Conformités

**Suivi des non-conformités conforme ISO 9001:2015 (clause 10.2)**

Projet 3 du programme d'internat *Nexus 4.0* — réf. `NEX-P3-QUALITY-2026`

![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white)
![Angular](https://img.shields.io/badge/Angular-19-DD0031?logo=angular&logoColor=white)
![SQLModel](https://img.shields.io/badge/SQLModel-ORM-informational)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)
![License](https://img.shields.io/badge/status-en%20développement-yellow)

</div>

---

## Sommaire

- [Contexte](#contexte)
- [Fonctionnalités](#fonctionnalités)
- [Architecture](#architecture)
- [Cycle de vie d'une non-conformité](#cycle-de-vie-dune-non-conformité)
- [Alertes SLA](#alertes-sla)
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
2. **Source de données d'entraînement** pour la prédiction de risque de dépassement de délai (voir [Fonctionnalités](#fonctionnalités))

---

## Fonctionnalités

- **Non-conformités** — création, machine à états (cf. cycle de vie ci-dessous), historique complet des transitions
- **Audits** — planification, constats, escalade d'un constat en NC formelle
- **Authentification** — JWT (hachage bcrypt)
- **Alertes SLA en temps réel** — flux **SSE**, remplace l'ancien système par polling
- **Notifications in-app** — système générique (nouvelle NC assignée, changement d'état, etc.)
- **Gestion des départements & organisations**
- **Export des non-conformités** (`export_router.py`)
- **Dashboard** — indicateurs et KPI qualité
- **Prédiction du risque de dépassement de délai** 
- **Environnement de développement conteneurisé** — Docker Compose, hot-reload frontend + backend

---

## Architecture

```mermaid
graph TD
    A[Angular — Formulaires, dashboard, alertes] -->|HTTP + JWT| B[FastAPI — Routes & validation]
    A -->|SSE| I[Flux d'alertes SLA temps réel]
    B --> C[Services — Machine à états, logique métier]
    C --> D[SQLModel — ORM]
    D --> E[(PostgreSQL)]
    F[Alembic] -.versionne le schéma.-> D
    F -.applique les migrations.-> E
    G[Job SLA — cron 24h] -->|lecture| E
    G -->|push| I
    C --> J[Service de prédiction de délai — ML]
    J -.entraîné sur.-> E
```

Angular consomme l'API FastAPI, protégée par JWT, et reçoit les alertes SLA via un flux SSE plutôt que par polling. FastAPI délègue la logique métier à une couche de services contenant la machine à états, qui persiste via SQLModel dans PostgreSQL. Alembic gère l'évolution du schéma dans le temps. Un job planifié vérifie chaque jour les délais de traitement et pousse les alertes vers le flux SSE. Un service de prédiction ML estime, à partir de l'historique, le risque qu'une NC dépasse son délai.

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

Chaque transition est validée par la machine à états et journalisée dans `nc_events` (timestamp, acteur, état précédent/suivant), formant l'historique immuable utilisé pour le calcul du KPI et l'entraînement du modèle de prédiction de risque.

---

## Alertes SLA

Le suivi du délai de clôture (objectif : **< 5 jours**, cf. [Contexte](#contexte)) est assuré par un job planifié qui évalue chaque NC ouverte et pousse les alertes en temps réel vers le frontend via un flux **SSE** — ce système a remplacé un ancien mécanisme par polling.

| Niveau | Déclencheur | Traitement |
|---|---|---|
| ⚠️ **Warning** | NC toujours ouverte, échéance des 5 jours atteinte sous 24h | Alerte orange, assigné notifié |
| 🚨 **Breached** | NC ouverte depuis plus de 5 jours (SLA dépassé) | Alerte rouge, assigné **et** manager notifiés, action requise |

**Côté frontend**, ces alertes s'affichent dans un menu déroulant dédié (icône cloche, distincte du menu Notifications à l'icône enveloppe qui couvre les événements applicatifs génériques). Fonctionnalités du menu :
- Tri : plus récentes / plus anciennes / breached en premier / warning en premier
- Marquage individuel ou global comme lu
- Suppression d'une alerte avec possibilité d'annuler (undo) juste après
- Indicateur "Resolved" si la NC a été clôturée entre-temps (l'alerte reste visible mais n'est plus active)

**Côté backend**, la logique vit dans `services/sla_service.py` (calcul des échéances, génération des alertes) ; le job périodique correspondant est référencé dans `app/jobs/` dans l'architecture cible. L'endpoint exact du flux SSE reste à documenter précisément (voir [Endpoints API](#endpoints-api)).

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
    USER ||--o{ NOTIFICATION : reçoit

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
    NOTIFICATION {
        uuid id PK
        uuid user_id FK
        string title
        string message
        boolean is_read
        datetime created_at
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
| Temps réel | SSE (Server-Sent Events) pour les alertes SLA |
| Prédiction de risque | Modèle ML — extraction de features dans `app/ML/` |
| Frontend | Angular 19 |
| Conteneurisation | Docker, Docker Compose (environnement de dev avec hot-reload) |
| Tests | Pytest, TestClient FastAPI |

---

## Structure du projet

```
Nexus3/
├── docker-compose.yml
├── backend/
│   ├── Dockerfile.dev
│   ├── .dockerignore
│   ├── requirements.txt
│   ├── alembic.ini
│   ├── .env
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py
│   │   ├── database.py          # Engine, Session
│   │   ├── deps.py               # Dépendances FastAPI (auth, DB session...)
│   │   ├── enums.py              # NCState, Severity, NCType, NCStatus
│   │   ├── auth.py               # Login, hachage, génération JWT
│   │   ├── jobs/
│   │   │   └── sla_job.py        # Vérification quotidienne des délais, alimente le flux SSE
│   │   ├── ML/
│   │   │   └── features.py       # Extraction de features pour la prédiction de risque
│   │   ├── models/
│   │   │   ├── non_conformance.py
│   │   │   ├── nc_event.py
│   │   │   ├── root_cause.py
│   │   │   ├── corrective_action.py
│   │   │   ├── audit_finding.py
│   │   │   ├── departement.py
│   │   │   ├── organisation.py
│   │   │   ├── user.py
│   │   │   ├── notification.py
│   │   │   └── id_counter.py
│   │   ├── routers/
│   │   │   ├── nc_router.py
│   │   │   ├── auth_router.py
│   │   │   ├── dashboard_router.py
│   │   │   ├── department_router.py
│   │   │   ├── notification_router.py
│   │   │   ├── root_cause_router.py
│   │   │   ├── corrective_action_router.py
│   │   │   └── export_router.py
│   │   ├── services/
│   │   │   ├── nc_service.py
│   │   │   ├── sla_service.py
│   │   │   ├── dashboard_service.py
│   │   │   ├── department_service.py
│   │   │   ├── notification_service.py
│   │   │   └── delay_risk_service.py
│   │   ├── schemas/
│   │   │   ├── audit_schemas.py
│   │   │   ├── dashboard_schemas.py
│   │   │   └── nc_shcemas.py
│   │   ├── seed_base.py
│   │   ├── seed_org.py
│   │   ├── seed_1000_ncs.py
│   │   └── migrate_notif.py
│   ├── alembic/
│   └── tests/
│       ├── conftest.py
│       ├── test_audit_router.py
│       ├── test_nc_router.py
│       └── test_state_machine.py
└── frontend/
    ├── Dockerfile.dev
    ├── proxy.conf.json
    ├── .dockerignore
    └── src/app/
        ├── authentication/       # signin, forgot-password, locked, page404/500
        ├── admin/
        │   ├── dashboard/
        │   └── quality/          # nc-form, nc-list, audits
        ├── layout/                # header (alertes SLA + notifications), sidebar, main-layout
        ├── core/                  # services partagés (auth, nc, department), guards
        └── shared/                # composants réutilisables
```

---

## Installation

### Option A — Avec Docker (recommandé pour le développement)

Prérequis : Docker Desktop installé (avec l'intégration WSL2 activée si Windows).

Fichier `.env` à la racine de `backend/` (nécessaire même en Docker — le conteneur le lit via le bind mount) :
```env
DATABASE_URL=postgresql://nexus_user:motdepasse@host.docker.internal:5432/nexus_p3
JWT_SECRET=change-moi-en-production
JWT_ALGORITHM=HS256
```
> ⚠️ Si PostgreSQL tourne sur ta machine hôte (et non dans un conteneur), utilise `host.docker.internal` et non `localhost` dans `DATABASE_URL` — depuis l'intérieur d'un conteneur, `localhost` pointe vers le conteneur lui-même, pas vers la machine hôte.

Lancement :
```bash
docker compose up --build
```

→ Frontend : `http://localhost:4200` (les appels `/api/...` sont automatiquement redirigés vers le backend, pas de souci CORS)
→ Backend : `http://localhost:8000/docs`

> PostgreSQL n'est pas encore conteneurisé dans `docker-compose.yml` — utilise une instance locale ou distante existante (voir Option B pour la créer).

### Option B — Installation manuelle

**Prérequis**
- Python 3.12+
- PostgreSQL
- Node.js + Angular CLI

**Backend**
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

**Frontend**
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
| `GET` | `/dashboard/*` | Indicateurs et KPI qualité |
| `GET` | `/departments/*` | Gestion des départements |
| `GET` | `/notifications/*` | Notifications in-app |
| `GET` | `/export/*` | Export des non-conformités |
| `GET` | `/sla/*` | Alertes SLA (warning / breached) — voir [Alertes SLA](#alertes-sla) |
| `GET` | `/sla/stream` (SSE) | Flux temps réel des alertes SLA, remplace l'ancien polling |

> Routes `dashboard`, `departments`, `notifications`, `export` et `sla` ajoutées récemment — détail des paramètres, réponses et chemins exacts à confirmer dans le code (`sla_router` / `sla_service.py`). La documentation complète et interactive reste disponible via Swagger sur `/docs`.

---

## Tests

```bash
cd backend
pytest tests/ -v
```

Couverture actuelle : machine à états (transitions valides/invalides), cycle de vie complet d'une NC, workflow d'audit avec escalade.

---

## État d'avancement

- ✅ Non-conformités — machine à états, historique des transitions
- ✅ Audits — planification, constats, escalade
- ✅ Authentification JWT
- ✅ Alertes SLA — migrées du polling vers un flux SSE
- ✅ Notifications in-app
- ✅ Gestion des départements & organisations
- ✅ Dashboard (indicateurs qualité)
- ✅ Export des non-conformités
- ✅ Environnement de développement conteneurisé (Docker Compose, hot-reload)
- ✅ Prédiction du risque de dépassement de délai (ML) 
---

<div align="center">

Projet réalisé dans le cadre du programme d'internat **TeachCODEX** — Nexus 4.0 (`NEX-FS-INTERN-2026`)

</div>