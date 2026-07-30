from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlmodel import Session

from app.database import get_session
from app.routers.auth_router import get_current_user_id
from app.services.sla_service import (
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
):
    """Chargement initial, et secours si la connexion SSE se coupe."""
    return {"alerts": get_active_alerts(session, unread_only=unread_only)}


@router.get("/alerts/unread-count")
def unread_count(session: Session = Depends(get_session)):
    """Pour le badge de notification côté UI."""
    return {"count": get_unread_count(session)}


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
    user_id: Optional[int] = Depends(get_current_user_id),
):
    alert = mark_as_read(session, alert_id, user_id=user_id)
    if alert is None:
        raise HTTPException(status_code=404, detail="Alerte introuvable")
    return alert


@router.post("/alerts/read-all")
def read_all_alerts(
    session: Session = Depends(get_session),
    user_id: Optional[int] = Depends(get_current_user_id),
):
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
        # Alerte encore active : on refuse sauf si force=True
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