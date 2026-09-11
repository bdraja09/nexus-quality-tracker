<div align="center">

# Nexus 4.0 — Système de Gestion de la Qualité & des Non-Conformités (QMS)

### *Plateforme de Suivi et Résolution des Non-Conformités certifiée conforme ISO 9001:2015 (Clause 10.2)*

**Projet 3 — Programme d'Internat Nexus 4.0** · Réf. `NEX-P3-QUALITY-2026`

<p align="center">
  <img src="https://img.shields.io/badge/Python-3.12-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python 3.12" />
  <img src="https://img.shields.io/badge/FastAPI-0.115+-009688?style=for-the-badge&logo=fastapi&logoColor=white" alt="FastAPI" />
  <img src="https://img.shields.io/badge/PostgreSQL-16+-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/SQLModel-ORM-6C5CE7?style=for-the-badge&logoColor=white" alt="SQLModel" />
  <img src="https://img.shields.io/badge/Angular-19-DD0031?style=for-the-badge&logo=angular&logoColor=white" alt="Angular 19" />
  <img src="https://img.shields.io/badge/Docker-Compose-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker Compose" />
  <img src="https://img.shields.io/badge/Machine%20Learning-Scikit--Learn-F7931E?style=for-the-badge&logo=scikit-learn&logoColor=white" alt="Scikit-Learn ML" />
  <img src="https://img.shields.io/badge/ISO-9001%3A2015-success?style=for-the-badge" alt="ISO 9001:2015" />
</p>

</div>

---

##  Sommaire

1. [Vue d'ensemble & Contexte Normatif](#-vue-densemble--contexte-normatif)
2. [Fonctionnalités Principales](#-fonctionnalités-principales)
3. [Architecture Globale](#-architecture-globale)
4. [Cycle de Vie & Machine à États (FSM)](#-cycle-de-vie--machine-à-états-fsm)
5. [Système d'Alertes SLA en Temps Réel (SSE)](#-système-dalertes-sla-en-temps-réel-sse)
6. [Module de Prédiction ML (Risque de Dépassement)](#-module-de-prédiction-ml-risque-de-dépassement)
7. [Modèle de Données (ERD)](#-modèle-de-données-erd)
8. [Stack Technique](#-stack-technique)
9. [Structure du Projet](#-structure-du-projet)
10. [Guide de Démarrage Rapide](#-guide-de-démarrage-rapide)
    - [Méthode 1 : Environnement Conteneurisé (Docker Compose)](#méthode-1--environnement-conteneurisé-docker-compose)
    - [Méthode 2 : Installation Locale (Bare-Metal)](#méthode-2--installation-locale-bare-metal)
    - [Peuplement des données (Seeding)](#peuplement-des-données-seeding)
11. [Référence des Endpoints API](#-référence-des-endpoints-api)
12. [Tests & Assurance Qualité](#-tests--assurance-qualité)
13. [Statut du Projet & Feuille de Route](#-statut-du-projet--feuille-de-route)

---

##  Vue d'ensemble & Contexte Normatif

La clause **10.2 (Non-conformité et actions correctives)** de la norme internationale **ISO 9001:2015** impose aux organisations :
* De réagir immédiatement aux non-conformités (NC) et d'en maîtriser les conséquences.
* D'évaluer la nécessité d'actions pour éliminer les causes profondes (*Root Causes*).
* De mettre en œuvre les actions requises et de vérifier systématiquement leur efficacité.
* De conserver des informations documentées et immuables comme preuves de traitement.

**Nexus 4.0 QMS** digitalise l'ensemble de ce workflow avec pour exigence opérationnelle un **MTTR (Mean Time to Resolution) inférieur à 5 jours ouvrés**.

### Double Finalité du Système :
1. **Outil Opérationnel d'Entreprise** : Gestion centralisée des audits, signalements directs, escalades de constats, investigations, actions correctives et notifications temps réel.
2. **Moteur d'Intelligence Prédictive** : Historisation granulaire de chaque événement pour entraîner des modèles de Machine Learning capables d'anticiper les goulots d'étranglement et les risques de dépassement de SLA.

---

##  Fonctionnalités Principales

| Domaine | Description fonctionnelle |
|---|---|
| **Gestion des Non-Conformités** | Création, qualification, suivi d'état avec machine à états finis (FSM) stricte et journalisation immuable (`nc_events`). |
| **Gestion des Audits Qualité** | Planification d'audits de départements, enregistrement de constats (*findings*) et escalade en un clic vers une NC formelle. |
| **Causes Racines & Actions** | Catégorisation standardisée des causes racines (5M, processus, facteurs humains) et affectation d'actions correctives datées. |
| **Monitoring SLA Temps Réel** | Détection automatique des retards et diffusion d'alertes push via **Server-Sent Events (SSE)**. |
| **Intelligence Artificielle (ML)** | Prédiction en temps réel de la probabilité de dépassement du SLA dès la qualification d'une NC. |
| **Notifications & Collaboration** | Notifications in-app par profil (Assigné, Manager, Auditeur) pour chaque transition d'état. |
| **Pilotage & Reporting** | Dashboard interactif (KPIs, temps moyen de résolution, taux de clôture, répartition par gravité) et export de données multi-formats. |
| **Sécurité & Contrôle d'Accès** | Authentification sécurisée par tokens JWT, hachage bcrypt, isolation par organisations et départements. |

---

##  Architecture Globale

Le système repose sur une architecture découplée, orientée services et temps réel :

```mermaid
graph TD
    subgraph Frontend ["Client Layer (Angular 19)"]
        UI[Interface Utilisateur Responsive]
        SLA_UI[Menu Alertes SLA Temps Réel]
        DASH[Tableaux de Bord & KPIs]
    end

    subgraph Backend ["Application Layer (FastAPI)"]
        AUTH[JWT Security & Auth Middleware]
        ROUTERS[API Routers / Endpoints REST]
        FSM[Machine à États des NC]
        BROADCAST[Broadcaster Temps Réel SSE]
        SCHED[Planificateur de Tâches SLA]
        ML_SERV[Service d'Inférence ML]
    end

    subgraph Storage ["Persistence & Data Layer"]
        ORM[SQLModel / SQLAlchemy ORM]
        MIGR[Alembic Migrations]
        PG[(PostgreSQL 16+)]
        MODEL_STORE[Modèles Entraînés .joblib]
    end

    UI -->|HTTP / REST + JWT| AUTH
    SLA_UI <-->|Flux Unidirectionnel SSE| BROADCAST
    AUTH --> ROUTERS
    ROUTERS --> FSM
    FSM --> ORM
    SCHED -->|Évaluation périodique| ORM
    SCHED -->|Push événements SLA| BROADCAST
    ROUTERS --> ML_SERV
    ML_SERV --> MODEL_STORE
    ORM --> PG
    MIGR -.->|Gestion de version de schéma| PG
```

---

##  Cycle de Vie & Machine à États (FSM)

Chaque non-conformité suit un workflow rigoureusement validé. Aucune transition arbitraire n'est autorisée, garantissant une intégrité totale des audits :

```mermaid
stateDiagram-v2
    [*] --> RAISED : Signalement direct ou escalade d'audit
    RAISED --> ASSIGNED : Assignation par un Manager Qualité
    ASSIGNED --> UNDER_INVESTIGATION : Prise en charge par le Responsable
    ASSIGNED --> REJECTED : Rejet (doublon, non applicable)
    UNDER_INVESTIGATION --> CORRECTIVE_ACTION : Cause racine identifiée & plan d'action
    UNDER_INVESTIGATION --> REJECTED : Clôture sans suite justifiée
    CORRECTIVE_ACTION --> CLOSED : Validation de l'efficacité par le Manager
    CORRECTIVE_ACTION --> UNDER_INVESTIGATION : Action corrective rejetée / incomplète
    CLOSED --> [*]
    REJECTED --> [*]
```

> **Audit Trail Immuable** : Chaque transition génère un enregistrement dans `nc_events` contenant l'horodatage précis, l'acteur responsable, l'état d'origine et l'état de destination.

---

##  Système d'Alertes SLA en Temps Réel (SSE)

Le respect de la cible des **5 jours ouvrés** est supervisé en continu par le service d'évaluation des SLA :

```
             J+0                          J+4                          J+5+
──────────────┼────────────────────────────┼────────────────────────────┼──────────►
         Création NC               ⚠️ Warning (Échéance < 24h)     🚨 Breached (SLA Dépassé)
                                    Alerte assigné               Alerte manager + assigné
```

* **Protocole SSE (`/sla/stream`)** : Remplacement du polling par un flux persistant ouvert et léger.
* **Gestion Frontend avancée** : Filtrage par criticité, acquittement individuel/collectif, historique des alertes résolues.

---

##  Module de Prédiction ML (Risque de Dépassement)

Le module de Machine Learning estime le risque de dérive calendaire d'une NC dès son émission :
* **Pipeline d'extraction (`app/ML/features.py`)** : Extraction de métriques telles que la gravité, le département cible, l'historique de charge de l'assigné et la récurrence de la catégorie.
* **Inférence (`delay_risk_service.py`)** : Prédiction instantanée de la probabilité de dépassement du seuil de 5 jours.
* **Monitoring (`/health/ml`)** : Endpoint de vérification de l'état et de la version du modèle sérialisé.

---

##  Modèle de Données (ERD)

```mermaid
erDiagram
    ORGANIZATION ||--o{ DEPARTMENT : structure
    DEPARTMENT ||--o{ USER : emploie
    DEPARTMENT ||--o{ NON_CONFORMANCE : impacte
    DEPARTMENT ||--o{ AUDIT : subit

    USER ||--o{ NON_CONFORMANCE : declare_ou_assigne
    USER ||--o{ NC_EVENT : declenche
    USER ||--o{ AUDIT : audite
    USER ||--o{ NOTIFICATION : recoit

    NON_CONFORMANCE ||--o{ NC_EVENT : trace
    NON_CONFORMANCE ||--o{ ROOT_CAUSE : analyse
    NON_CONFORMANCE ||--o{ CORRECTIVE_ACTION : resout
    NON_CONFORMANCE ||--o| AUDIT_FINDING : origine_constat

    AUDIT ||--o{ AUDIT_FINDING : releve

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
    AUDIT {
        uuid id PK
        uuid dept_id FK
        uuid auditor_id FK
        date scheduled_date
    }
```

---

## 🛠 Stack Technique

| Composant | Technologie | Rôle & Rationale |
|---|---|---|
| **Backend Core** | **Python 3.12 + FastAPI** | Performance asynchrone native, typage strict et documentation OpenAPI automatique. |
| **ORM & Schémas** | **SQLModel** | Unification transparente des modèles Pydantic et SQLAlchemy. |
| **Base de Données** | **PostgreSQL 16** | Robustesse relationnelle, intégrité transactionnelle et support JSON natif. |
| **Migrations** | **Alembic** | Versionnage et traçabilité des évolutions de schémas de données. |
| **Temps Réel** | **Server-Sent Events (SSE)** | Push serveur optimisé pour le streaming unidirectionnel d'alertes. |
| **Machine Learning**| **Scikit-Learn / Joblib** | Entraînement et inférence du modèle de scoring prédictif de risque SLA. |
| **Frontend Web** | **Angular 19 + TypeScript** | Architecture composants d'entreprise, typage strict et interfaces réactives. |
| **Conteneurs** | **Docker & Docker Compose** | Déploiement reproductible et synchronisation automatique en développement. |
| **Qualité & Tests** | **Pytest + TestClient** | Suite de tests d'intégration et de non-régression de la machine à états. |

---

##  Structure du Projet

```text
Nexus3/
├── docker-compose.yml              # Orchestration multi-conteneurs pour l'environnement de dev
├── README.md                       # Documentation technique centrale
├── .gitignore                      # Règles d'exclusion Git (builds, caches, seeds, tests)
├── backend/
│   ├── Dockerfile.dev              # Conteneurisation FastAPI avec hot-reload
│   ├── requirements.txt            # Dépendances Python verrouillées
│   ├── alembic.ini                 # Configuration des migrations de base de données
│   ├── alembic/                    # Scripts de migration de schéma
│   ├── app/
│   │   ├── main.py                 # Point d'entrée FastAPI, middlewares CORS et cycle de vie
│   │   ├── database.py             # Initialisation de la connexion et sessions PostgreSQL
│   │   ├── deps.py                 # Injections de dépendances (sessions DB, tokens JWT)
│   │   ├── auth.py                 # Hachage bcrypt, génération et validation des tokens JWT
│   │   ├── enums.py                # Définitions strictes des statuts, gravités et rôles
│   │   ├── scheduler.py            # Planification des routines SLA d'arrière-plan
│   │   ├── ML/                     # Pipeline Machine Learning et extraction de features
│   │   ├── models/                 # Modèles de données SQLModel
│   │   ├── routers/                # Endpoints de l'API REST (NC, Audits, Auth, SLA, etc.)
│   │   ├── schemas/                # Schémas de validation Pydantic (Request / Response)
│   │   └── services/               # Logique métier, FSM, calculs SLA et diffusion SSE
│   └── tests/                      # Suite de tests unitaires et fonctionnels Pytest
└── frontend/
    ├── Dockerfile.dev              # Conteneurisation Angular
    ├── angular.json                # Configuration du build Angular CLI
    ├── proxy.conf.json             # Proxy de développement pour redirection d'API
    ├── package.json                # Dépendances Node.js
    └── src/app/
        ├── admin/                  # Vues d'administration, dashboard qualité et formulaires
        ├── authentication/         # Connexion, réinitialisation de mot de passe, verrouillage
        ├── core/                   # Services HTTP, intercepteurs JWT, guards de routage
        ├── layout/                 # En-tête (cloche SLA, notifications), barre latérale
        └── shared/                 # Composants UI partagés, widgets statistiques et formulaires
```

---

##  Guide de Démarrage Rapide

### Prérequis
* [Docker Desktop](https://www.docker.com/products/docker-desktop/) (recommandé) **OU** Python 3.12+, PostgreSQL 16+ et Node.js 20+.
* Git.

---

### Méthode 1 : Environnement Conteneurisé (Docker Compose)

1. **Configuration des variables d'environnement** :
   Créez un fichier `.env` dans le dossier `backend/` :
   ```env
   DATABASE_URL=postgresql://nexus_user:motdepasse@host.docker.internal:5432/nexus_p3
   JWT_SECRET=votre_cle_secrete_ultra_securisee_2026
   JWT_ALGORITHM=HS256
   ```

2. **Démarrage des services** :
   ```bash
   docker compose up --build
   ```

3. **Accès aux services** :
   *  **Application Web (Frontend)** : [http://localhost:4200](http://localhost:4200)
   *  **Documentation Interactive de l'API (Swagger)** : [http://localhost:8000/docs](http://localhost:8000/docs)
   *  **Healthcheck ML** : [http://localhost:8000/health/ml](http://localhost:8000/health/ml)

---

### Méthode 2 : Installation Locale (Bare-Metal)

#### 1. Configuration de la Base de Données (PostgreSQL)
```bash
sudo service postgresql start
sudo -u postgres psql -c "CREATE USER nexus_user WITH PASSWORD 'motdepasse';"
sudo -u postgres psql -c "CREATE DATABASE nexus_p3 OWNER nexus_user;"
```

#### 2. Démarrage du Backend
```bash
cd backend
python3 -m venv env
source env/bin/activate          # Sur Windows : env\Scripts\activate
pip install -r requirements.txt

# Initialiser le fichier .env
cat <<EOF > .env
DATABASE_URL=postgresql://nexus_user:motdepasse@localhost:5432/nexus_p3
JWT_SECRET=cle_secrete_pour_le_dev
JWT_ALGORITHM=HS256
EOF

# Lancer le serveur d'API
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

#### 3. Démarrage du Frontend
```bash
cd frontend
npm install --legacy-peer-deps
npm start                        # Lance ng serve avec proxy.conf.json sur http://localhost:4200
```

---

###  Peuplement des données (Seeding)

Pour initialiser l'environnement avec des organisations, des départements, des utilisateurs et des jeux de données d'entraînement :
```bash
cd backend
python -m app.seed_base          # Utilisateurs initiaux & structure
python -m app.seed_org           # Organisations et départements
python -m app.seed_1000_ncs      # Dataset synthétique pour l'entraînement ML
```

---

##  Référence des Endpoints API

L'ensemble de l'API est documenté interactivement sous OpenAPI / Swagger à l'adresse `/docs`.

| Tag | Méthode | Route | Description & Rôle |
|---|---|---|---|
| **Auth** | `POST` | `/auth/login` | Authentification utilisateur et émission du token JWT |
| **Non-Conformités** | `GET` | `/nc/` | Liste paginée et filtrable des non-conformités |
| **Non-Conformités** | `POST` | `/nc/` | Déclaration d'une nouvelle non-conformité |
| **Non-Conformités** | `GET` | `/nc/{id}` | Consultation détaillée d'une fiche de NC |
| **Non-Conformités** | `POST` | `/nc/{id}/transition` | Déclenchement d'une transition d'état validée par la FSM |
| **Non-Conformités** | `GET` | `/nc/{id}/events` | Journal immuable de l'historique des transitions |
| **Causes Racines** | `POST` | `/nc/{id}/root-cause` | Qualification et enregistrement d'une cause racine |
| **Actions Correctives** | `POST` | `/nc/{id}/corrective-action` | Planification d'une action corrective et d'une date limite |
| **Audits** | `GET` | `/audits/` | Liste des audits programmés et réalisés |
| **Audits** | `POST` | `/audits/` | Création et planification d'un audit de département |
| **Audits** | `POST` | `/audits/{id}/findings` | Enregistrement d'un constat d'audit |
| **Audits** | `POST` | `/audits/findings/{id}/escalate` | Escalade immédiate d'un constat d'audit en NC officielle |
| **Monitoring SLA** | `GET` | `/sla/alerts` | Récupération de la liste des alertes actives |
| **Monitoring SLA** | `GET` | `/sla/stream` | Flux temps réel (Server-Sent Events) pour les alertes SLA |
| **Dashboard** | `GET` | `/dashboard/kpis` | Métriques de pilotage qualité (taux de résolution, MTTR, etc.) |
| **Notifications** | `GET` | `/notifications/` | Flux des notifications in-app de l'utilisateur connecté |
| **Export** | `GET` | `/export/nc` | Export des non-conformités au format CSV / JSON |
| **System** | `GET` | `/health` | Statut de disponibilité de l'API |
| **System** | `GET` | `/health/ml` | Statut d'intégrité du modèle de prédiction ML |

---

##  Tests & Assurance Qualité

Le projet intègre une suite de tests automatisés validant l'ensemble de la logique métier critique (machine à états, flux d'escalade, calculs SLA) :

```bash
cd backend
pytest tests/ -v --cov=app --cov-report=term-missing
```

### Vérifications Automatisées Clés :
-   **Conformité des transitions FSM** : validation des transitions autorisées et blocage systématique des sauts d'états illégaux.
-   **Workflow d'audit & escalade** : vérification de la création de NC dérivée depuis un constat d'audit.
-   **Broadcasting SLA** : tests unitaires sur la génération d'alertes Warning et Breached.

---

##  Statut du Projet & Feuille de Route

- [x] **Conformité ISO 9001 (Clause 10.2)** : Workflow complet de traçabilité des non-conformités.
- [x] **Machine à états finis (FSM)** : Contrôle d'intégrité des transitions et audit trail immuable.
- [x] **Gestion des Audits & Escalades** : Processus unifié des constats qualité.
- [x] **Sécurité JWT & Contrôle d'accès** : Authentification et cloisonnement multi-niveaux.
- [x] **Streaming d'Alertes SLA (SSE)** : Remplacement du polling par des Server-Sent Events.
- [x] **Module Prédictif ML** : Inférence du risque de retard de clôture.
- [x] **Conteneurisation Docker** : Environnement de développement standardisé.
- [ ] **Rapports PDF automatisés** : Génération de fiches 8D / fiches de non-conformité exportables.
- [ ] **Intégration Webhook externe** : Notifications Slack / Microsoft Teams pour les alertes critiques.

---

<div align="center">

**Nexus 4.0** · *Advanced Quality Management Suite*  
Développé dans le cadre du programme d'internat **TeachCODEX**

</div>
