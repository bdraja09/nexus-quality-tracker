"""
seed_constants.py — source de vérité unique pour les IDs d'organisation,
départements et opérateurs utilisés par TOUS les scripts de seed
(seed_org.py, seed_nc_test_data.py, seed_1000_ncs.py, ...).

Pourquoi ce fichier existe : ces IDs étaient dupliqués indépendamment dans
chaque script de seed. Un dept_id invalide ("DEPT-PROD", n'appartenant à
aucune des listes dupliquées) s'est déjà retrouvé dans les données de
production de test -- signe que les copies avaient divergé quelque part.
En important ces constantes depuis un seul endroit, il devient impossible
qu'un script de seed utilise un dept_id ou un user_id que seed_org.py n'a
pas réellement créé en base.
"""

ORG_ID = "226org0000"
ORG_NAME = "Nexus N3 Industries"

DEPARTMENTS = [
    ("226dept0000", "Production"),
    ("226dept0001", "Qualité & Conformité"),
    ("226dept0002", "Maintenance & Ingénierie"),
    ("226dept0003", "Logistique & Supply Chain"),
    ("226dept0004", "Ressources Humaines"),
]
DEPARTMENT_IDS = [d[0] for d in DEPARTMENTS]

# (email, password, first_name, last_name, role, dept_id)
USERS = [
    ("manager@nexus.com",   "Password123!", "Jean",   "Manager",   "Manager",  "226dept0000"),
    ("operator1@nexus.com", "Password123!", "Alice",  "Operateur", "Operator", "226dept0000"),
    ("operator2@nexus.com", "Password123!", "Marc",   "Operateur", "Operator", "226dept0001"),
    ("auditor@nexus.com",   "Password123!", "Sophie", "Auditeur",  "Auditor",  "226dept0001"),
    ("admin@nexus.com",     "Password123!", "Root",   "Admin",     "Admin",    "226dept0000"),
]

MANAGER_ID = "226usr0000"
OPERATORS = ["226usr0001", "226usr0002"]

# Couplage opérateur <-> département d'appartenance. Dérivé automatiquement
# de USERS plutôt que ré-écrit à la main dans chaque script de seed NC --
# c'est ce couplage qui donne à dept_id sa valeur prédictive (un opérateur
# traite en priorité les NC de son propre département).
OPERATOR_HOME_DEPT = {
    f"226usr{i:04d}": dept_id
    for i, (_, _, _, _, role, dept_id) in enumerate(USERS)
    if role == "Operator"
}

assert set(OPERATOR_HOME_DEPT) == set(OPERATORS), (
    "OPERATORS et OPERATOR_HOME_DEPT ont divergé -- vérifiez USERS ci-dessus."
)
assert all(dept_id in DEPARTMENT_IDS for dept_id in OPERATOR_HOME_DEPT.values()), (
    "Un opérateur pointe vers un dept_id absent de DEPARTMENTS."
)