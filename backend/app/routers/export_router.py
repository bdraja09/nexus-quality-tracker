import csv
import io
from datetime import datetime, date
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse, JSONResponse
from sqlmodel import Session, select

from app.database import get_session
from app.models.non_conformance import NonConformance
from app.models.nc_event import NCEvent
from app.models.root_cause import RootCause
from app.models.corrective_action import CorrectiveAction
from app.models.departement import Department
from app.models.user import User

router = APIRouter(prefix="/export", tags=["export"])


def build_nc_export_data(session: Session, include_deleted: bool = False) -> List[Dict[str, Any]]:
    """
    Construit un jeu de données complet et enrichi pour chaque Fiche de Non-Conformité (NC).
    Regroupe les informations de la NC, du département, des utilisateurs (émetteur/responsable),
    des causes racines (5M), des actions correctives (CAPA), de l'historique des événements et 
    calcule des caractéristiques (features) et cibles (targets) pour l'entraînement de modèles IA/ML.
    """
    # 1. Requête principale NonConformance
    nc_stmt = select(NonConformance)
    if not include_deleted:
        nc_stmt = nc_stmt.where(NonConformance.is_deleted == False)
    ncs = session.exec(nc_stmt).all()

    # 2. Dictionnaires de recherche rapide (Lookups)
    dept_map = {d.id_dept: d.name for d in session.exec(select(Department)).all()}
    users = session.exec(select(User)).all()
    user_map = {u.id_usr: f"{u.first_name} {u.last_name}" for u in users}
    user_role_map = {u.id_usr: u.role for u in users}

    # 3. Événements regroupés par NC
    events_all = session.exec(select(NCEvent).order_by(NCEvent.timestamp)).all()
    events_by_nc: Dict[str, List[NCEvent]] = {}
    for ev in events_all:
        events_by_nc.setdefault(ev.nc_id, []).append(ev)

    # 4. Causes racines (5M) regroupées par NC
    causes_all = session.exec(select(RootCause)).all()
    causes_by_nc: Dict[str, List[RootCause]] = {}
    for rc in causes_all:
        causes_by_nc.setdefault(rc.nc_id, []).append(rc)

    # 5. Actions correctives (CAPA) regroupées par NC
    actions_all = session.exec(select(CorrectiveAction)).all()
    actions_by_nc: Dict[str, List[CorrectiveAction]] = {}
    for ca in actions_all:
        actions_by_nc.setdefault(ca.nc_id, []).append(ca)

    now = datetime.utcnow()
    export_list = []

    for nc in ncs:
        nc_events = events_by_nc.get(nc.id_nc, [])
        nc_causes = causes_by_nc.get(nc.id_nc, [])
        nc_actions = actions_by_nc.get(nc.id_nc, [])

        latest_cause = nc_causes[-1] if nc_causes else None
        latest_action = nc_actions[-1] if nc_actions else None

        # --- Feature Engineering & Calculs Métriques ML ---
        is_closed = nc.current_state == "CLOSED" or nc.closed_at is not None
        end_time = nc.closed_at if (is_closed and nc.closed_at) else now
        resolution_duration_hours = round((end_time - nc.raised_at).total_seconds() / 3600.0, 2)
        days_open = round((end_time - nc.raised_at).total_seconds() / 86400.0, 2)

        # Calcul du retard / SLA
        is_overdue = False
        delay_days = 0.0
        if nc.due_date:
            due_dt = datetime.combine(nc.due_date, datetime.min.time())
            if end_time > due_dt:
                is_overdue = True
                delay_days = round((end_time - due_dt).total_seconds() / 86400.0, 2)

        # Nombre de réouvertures
        reopen_count = sum(1 for e in nc_events if e.notes and "rouverte" in e.notes.lower())

        # Traitement NLP Texte Combiné
        nlp_text_parts = [
            f"Titre: {nc.title}",
            f"Description: {nc.description}"
        ]
        if latest_cause:
            nlp_text_parts.append(f"Cause racine [{latest_cause.category}]: {latest_cause.description}")
        if latest_action:
            nlp_text_parts.append(f"Action corrective: {latest_action.description}")

        nlp_combined_text = " | ".join(nlp_text_parts)

        # Extraction des valeurs d'Enum string
        severity_val = nc.severity.value if hasattr(nc.severity, "value") else str(nc.severity)
        current_state_val = nc.current_state.value if hasattr(nc.current_state, "value") else str(nc.current_state)

        # Construction du dictionnaire complet de la NC
        row = {
            # --- Identificateurs & Metadata ---
            "nc_id": nc.id_nc,
            "ref_code": nc.ref_code,
            
            # --- Informations principales (NonConformance) ---
            "title": nc.title,
            "description": nc.description,
            "severity": severity_val,
            "dept_id": nc.dept_id,
            "dept_name": dept_map.get(nc.dept_id, "Inconnu"),
            
            # --- Acteurs & Rôles (User) ---
            "raised_by_id": nc.raised_by,
            "raised_by_name": user_map.get(nc.raised_by, nc.raised_by),
            "raised_by_role": user_role_map.get(nc.raised_by, ""),
            "assigned_to_id": nc.assigned_to or "",
            "assigned_to_name": user_map.get(nc.assigned_to, "") if nc.assigned_to else "",
            "assigned_to_role": user_role_map.get(nc.assigned_to, "") if nc.assigned_to else "",
            
            # --- Dates & États ---
            "raised_at": nc.raised_at.isoformat() if nc.raised_at else "",
            "due_date": nc.due_date.isoformat() if nc.due_date else "",
            "closed_at": nc.closed_at.isoformat() if nc.closed_at else "",
            "current_state": current_state_val,
            "is_deleted": nc.is_deleted,
            "deleted_at": nc.deleted_at.isoformat() if nc.deleted_at else "",
            
            # --- Cause Racine (RootCause - 5M) ---
            "root_cause_count": len(nc_causes),
            "root_cause_category": latest_cause.category if latest_cause else "",
            "root_cause_description": latest_cause.description if latest_cause else "",
            "root_cause_identified_by": latest_cause.identified_by if latest_cause else "",
            "root_cause_identified_at": latest_cause.identified_at.isoformat() if (latest_cause and latest_cause.identified_at) else "",
            
            # --- Action Corrective (CorrectiveAction - CAPA) ---
            "corrective_action_count": len(nc_actions),
            "corrective_action_description": latest_action.description if latest_action else "",
            "corrective_assigned_to": latest_action.assigned_to if latest_action else "",
            "corrective_due_date": latest_action.due_date.isoformat() if (latest_action and latest_action.due_date) else "",
            "corrective_completed_at": latest_action.completed_at.isoformat() if (latest_action and latest_action.completed_at) else "",
            "corrective_verified_by": latest_action.verified_by if (latest_action and latest_action.verified_by) else "",
            
            # --- Engineered ML Features & Target Variables ---
            "resolution_duration_hours": resolution_duration_hours,
            "days_open": days_open,
            "is_closed": 1 if is_closed else 0,
            "is_overdue": 1 if is_overdue else 0,
            "delay_days": delay_days,
            "event_count": len(nc_events),
            "reopen_count": reopen_count,
            "nlp_combined_text": nlp_combined_text,
            
            # --- Historique détaillé des événements (NCEvent / Process Mining) ---
            "events_history": [
                {
                    "id_event": ev.id_event,
                    "from_state": ev.from_state.value if (ev.from_state and hasattr(ev.from_state, "value")) else str(ev.from_state or ""),
                    "to_state": ev.to_state.value if hasattr(ev.to_state, "value") else str(ev.to_state),
                    "actor_id": ev.actor_id,
                    "actor_name": user_map.get(ev.actor_id, ev.actor_id),
                    "timestamp": ev.timestamp.isoformat() if ev.timestamp else "",
                    "notes": ev.notes or ""
                }
                for ev in nc_events
            ]
        }

        export_list.append(row)

    return export_list


@router.get("/dataset/csv")
def export_dataset_csv(
    include_deleted: bool = Query(False, description="Inclure les NC supprimées"),
    session: Session = Depends(get_session)
):
    """
    Exporte le jeu de données complet des NC au format CSV (Table Plate Enrichie).
    Parfait pour l'entraînement avec Pandas, Scikit-Learn, XGBoost, LightGBM, CatBoost.
    Une ligne = Une Fiche NC enrichie avec metadata, causes racines, actions et features ML.
    """
    data = build_nc_export_data(session, include_deleted=include_deleted)
    
    if not data:
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["message"])
        writer.writerow(["Aucune donnée trouvée"])
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=nc_ml_dataset_empty.csv"}
        )

    # Nettoyage des dictionnaires pour le CSV (exclure le champ list complexe `events_history`)
    csv_rows = []
    headers = [k for k in data[0].keys() if k != "events_history"]

    for item in data:
        row = {k: item[k] for k in headers}
        csv_rows.append(row)

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=headers)
    writer.writeheader()
    writer.writerows(csv_rows)

    filename = f"nc_ml_dataset_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/events/csv")
def export_events_csv(session: Session = Depends(get_session)):
    """
    Exporte l'historique complet des événements (Format Process Mining / Modèles de Séquences / RNN).
    Une ligne = Une transition d'état d'événement (NCEvent) enrichie des métadonnées de la NC parente.
    """
    stmt = (
        select(NCEvent, NonConformance)
        .join(NonConformance, NCEvent.nc_id == NonConformance.id_nc)
        .order_by(NCEvent.nc_id, NCEvent.timestamp)
    )
    rows = session.exec(stmt).all()

    users = session.exec(select(User)).all()
    user_map = {u.id_usr: f"{u.first_name} {u.last_name}" for u in users}
    dept_map = {d.id_dept: d.name for d in session.exec(select(Department)).all()}

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "nc_id", "ref_code", "title", "severity", "dept_id", "dept_name",
        "nc_raised_at", "nc_due_date", "nc_current_state", "nc_closed_at",
        "id_event", "from_state", "to_state", "actor_id", "actor_name",
        "timestamp", "notes"
    ])

    for ev, nc in rows:
        writer.writerow([
            nc.id_nc,
            nc.ref_code,
            nc.title,
            nc.severity.value if hasattr(nc.severity, "value") else str(nc.severity),
            nc.dept_id,
            dept_map.get(nc.dept_id, ""),
            nc.raised_at.isoformat() if nc.raised_at else "",
            nc.due_date.isoformat() if nc.due_date else "",
            nc.current_state.value if hasattr(nc.current_state, "value") else str(nc.current_state),
            nc.closed_at.isoformat() if nc.closed_at else "",
            ev.id_event,
            ev.from_state.value if (ev.from_state and hasattr(ev.from_state, "value")) else str(ev.from_state or ""),
            ev.to_state.value if hasattr(ev.to_state, "value") else str(ev.to_state),
            ev.actor_id,
            user_map.get(ev.actor_id, ev.actor_id),
            ev.timestamp.isoformat() if ev.timestamp else "",
            ev.notes or ""
        ])

    filename = f"nc_events_process_mining_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/dataset/json")
def export_dataset_json(
    include_deleted: bool = Query(False, description="Inclure les NC supprimées"),
    session: Session = Depends(get_session)
):
    """
    Exporte le jeu de données hiérarchique complet au format JSON.
    Contient l'arborescence complète (NC + Historique Événements + Cause Racine 5M + Actions Correctives CAPA).
    Recommandé pour Fine-Tuning de LLMs (GPT, Llama), HuggingFace Datasets, PyTorch / TensorFlow.
    """
    data = build_nc_export_data(session, include_deleted=include_deleted)
    return JSONResponse(content=data)


@router.get("/ml-training-pack")
def export_ml_training_pack(
    session: Session = Depends(get_session)
):
    """
    Package d'entraînement complet pour Machine Learning comprenant :
    - Metadata du dataset (timestamps, version, cibles conseillées)
    - Encoders Mappings (Catégories 5M, Severités, États)
    - Le jeu de données enrichi complet
    """
    data = build_nc_export_data(session, include_deleted=False)

    severity_enum = ["LOW", "MEDIUM", "HIGH", "CRITICAL"]
    state_enum = ["RAISED", "ASSIGNED", "UNDER_INVESTIGATION", "CORRECTIVE_ACTION", "CLOSED", "REJECTED"]
    root_cause_categories = ["main_oeuvre", "methode", "materiel", "matiere", "milieu"]

    payload = {
        "metadata": {
            "exported_at": datetime.utcnow().isoformat(),
            "total_records": len(data),
            "version": "1.0",
            "suggested_targets": [
                "severity",
                "resolution_duration_hours",
                "is_overdue",
                "root_cause_category"
            ]
        },
        "encoders_mappings": {
            "severity": {val: idx for idx, val in enumerate(severity_enum)},
            "current_state": {val: idx for idx, val in enumerate(state_enum)},
            "root_cause_category": {val: idx for idx, val in enumerate(root_cause_categories)}
        },
        "dataset": data
    }
    return JSONResponse(content=payload)
