from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session
from app.database import get_session
from app.auth import get_current_user
from app.services import notification_service

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("/")
def list_notifications(
    unread_only: bool = False,
    session: Session = Depends(get_session),
    current_user: dict = Depends(get_current_user),
):
    return {
        "notifications": notification_service.get_notifications_for_user(
            session, current_user["id"], unread_only
        )
    }


@router.get("/unread-count")
def unread_count(
    session: Session = Depends(get_session),
    current_user: dict = Depends(get_current_user),
):
    return {"count": notification_service.get_unread_count(session, current_user["id"])}


@router.post("/read-all")
def read_all(
    session: Session = Depends(get_session),
    current_user: dict = Depends(get_current_user),
):
    count = notification_service.mark_all_as_read(session, current_user["id"])
    return {"marked": count}


@router.patch("/{notification_id}/read")
def mark_read(
    notification_id: int,
    session: Session = Depends(get_session),
    current_user: dict = Depends(get_current_user),
):
    notif = notification_service.mark_as_read(session, notification_id, current_user["id"])
    if not notif:
        raise HTTPException(status_code=404, detail="Notification introuvable")
    return notif


@router.delete("/{notification_id}")
def delete_notification(
    notification_id: int,
    session: Session = Depends(get_session),
    current_user: dict = Depends(get_current_user),
):
    ok = notification_service.delete_notification(session, notification_id, current_user["id"])
    if not ok:
        raise HTTPException(status_code=404, detail="Notification introuvable")
    return {"deleted": True}


@router.post("/{notification_id}/restore")
def restore_notification(
    notification_id: int,
    session: Session = Depends(get_session),
    current_user: dict = Depends(get_current_user),
):
    notif = notification_service.restore_notification(session, notification_id, current_user["id"])
    if not notif:
        raise HTTPException(status_code=404, detail="Notification introuvable")
    return notif