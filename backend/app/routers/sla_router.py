from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlmodel import Session

from app.database import get_session
from app.auth import get_current_user, get_current_user_optional
from app.services.sla_service import (
    check_sla_and_create_alerts,
    get_active_alerts,
    get_unread_count,
    mark_as_read,
    mark_all_as_read,
    delete_alert,
    delete_all_alerts,
    restore_alert,
)
from app.services.sla_broadcaster import broadcaster

router = APIRouter(prefix="/sla", tags=["sla"])


@router.get("/alerts")
def list_alerts(
    unread_only: bool = False,
    session: Session = Depends(get_session),
    current_user: Optional[dict] = Depends(get_current_user_optional),
):
    """Chargement initial, et secours si la connexion SSE se coupe."""
    return {"alerts": get_active_alerts(session, unread_only=unread_only, current_user=current_user)}


@router.get("/alerts/unread-count")
def unread_count(
    session: Session = Depends(get_session),
    current_user: Optional[dict] = Depends(get_current_user_optional),
):
    """Pour le badge de notification côté UI."""
    return {"count": get_unread_count(session, current_user=current_user)}


@router.get("/stream")
async def stream_alerts():
    """Flux SSE temps réel — EventSource se reconnecte automatiquement
    côté navigateur, sans logique de retry à écrire."""
    return StreamingResponse(
        broadcaster.stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        }
    )

@router.patch("/alerts/{alert_id}/read")
def read_alert(
    alert_id: int,
    session: Session = Depends(get_session),
    current_user: Optional[dict] = Depends(get_current_user_optional),
):
    user_id = current_user["id"] if current_user else None
    alert = mark_as_read(session, alert_id, user_id=user_id)
    if alert is None:
        raise HTTPException(status_code=404, detail="Alerte introuvable")
    return alert


@router.post("/alerts/read-all")
def read_all_alerts(
    session: Session = Depends(get_session),
    current_user: Optional[dict] = Depends(get_current_user_optional),
):
    user_id = current_user["id"] if current_user else None
    count = mark_all_as_read(session, user_id=user_id)
    return {"marked_read": count}

@router.delete("/alerts/{alert_id}")
def remove_alert(
    alert_id: int,
    force: bool = False,
    session: Session = Depends(get_session),
):
    try:
        deleted = delete_alert(session, alert_id, force=force)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    if not deleted:
        raise HTTPException(status_code=404, detail="Alerte introuvable ou déjà supprimée")
    return {"deleted": True}


@router.delete("/alerts")
def remove_all_alerts(
    only_resolved: bool = True,
    session: Session = Depends(get_session),
):
    count = delete_all_alerts(session, only_resolved=only_resolved)
    return {"deleted": count}


@router.post("/alerts/{alert_id}/restore")
def restore(alert_id: int, session: Session = Depends(get_session)):
    alert = restore_alert(session, alert_id)
    if alert is None:
        raise HTTPException(status_code=404, detail="Alerte introuvable ou non supprimée")
    return alert

@router.post("/check")
def trigger_sla_check(session: Session = Depends(get_session)):
    """Déclenche manuellement le scan SLA — utile pour les tests et démos,
    sans attendre le prochain passage horaire du scheduler."""
    stats = check_sla_and_create_alerts(session)
    return stats