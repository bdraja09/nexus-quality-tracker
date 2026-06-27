\# Nexus N3 — Module Qualité \& Non-Conformité



> Suivi en temps réel des non-conformités et audits internes — Nexus 4.0



\---



\##  Contexte



Les équipes qualité gèrent des \*\*non-conformités critiques\*\* et des \*\*audits internes\*\* avec un KPI de clôture en \*\*moins de 5 jours\*\* (clause ISO 10.2). Ce module assure le suivi complet du cycle de vie des non-conformités, tout en produisant les \*\*données historiques structurées\*\* consommées par le module IA (P5).



\---



\##  Objectifs



\- \*\*Suivi des non-conformités\*\* : enregistrer, assigner, suivre et clôturer via une machine à états claire

\- \*\*Audits internes\*\* : gérer les audits et le suivi des actions correctives

\- \*\*Données structurées\*\* : capturer horodatages et résultats dans un format exploitable par P5

\- \*\*KPI temps réel\*\* : mesurer le temps moyen de clôture (objectif < 5 jours, clause ISO 10.2)



\---





\##  Machine à états



```

OUVERTE → ASSIGNÉE → EN COURS → EN RÉVISION → CLÔTURÉE

&#x20;                                     ↓

&#x20;                                 REJETÉE → EN COURS

```



\---



\## 📦 Structure du projet



```

Nexus-N3/

├── src/

│   ├── api/              # Endpoints REST (CRUD non-conformités, audits)

│   ├── models/           # Schémas BDD (non-conformité, événement, audit)

│   ├── services/         # Logique métier \& machine à états

│   └── dashboard/        # Calcul et affichage des KPIs

├── migrations/           # Scripts de migration BDD

├── tests/

├── .env.example

└── README.md

```



\---



\##  Installation



```bash

git clone https://github.com/TeachCODEX/Nexus-N3.git

cd Nexus-N3

npm install

cp .env.example .env

npm run migrate

npm run dev

```



\---



\##  Critères d'acceptation



\- \[ ] Cycle complet démontré : créer → assigner → clôturer une non-conformité

\- \[ ] KPI temps moyen de clôture affiché en dashboard (< 5 jours)

\- \[ ] Historique des événements documenté et requêtable

\- \[ ] Schéma d'événements validé avec l'équipe P5 avant intégration



\---





