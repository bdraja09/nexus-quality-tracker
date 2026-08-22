import logging
from datetime import datetime, timedelta
from typing import List, Optional
from enum import Enum

from sqlmodel import Session, select

from app.models.user import User
from app.models.notification import Notification  # ← IMPORT depuis models
from app.services.sla_broadcaster import broadcaster

logger = logging.getLogger(__name__)


class NotificationType(str, Enum):
    ASSIGNMENT = "assignment"
    REASSIGNMENT = "reassignment"
    CLOSED = "closed"
    REJECTED = "rejected"
    REOPENED = "reopened"
    CORRECTIVE_ACTION_ASSIGNED = "corrective_action_assigned"
    CORRECTIVE_ACTION_PROPOSED = "corrective_action_proposed"


class NotificationChannel(str, Enum):
    IN_APP = "in_app"
    EMAIL = "email"
    PUSH = "push"


# ─── Broadcast helper ──────────────────────────────────────────────────────────

def _publish(notif: Notification) -> None:
    """Diffuse l'événement vers tous les clients SSE connectés."""
    try:
        broadcaster.publish({
            "event": "workflow_notification",
            "id": notif.id,
            "nc_id": notif.nc_id,
            "ref_code": notif.ref_code,
            "type": notif.type,
            "title": notif.title,
            "message": notif.message,
            "reason": notif.reason,
            "recipient_id": notif.recipient_id,
            "is_read": notif.is_read,
            "created_at": notif.created_at.isoformat() if notif.created_at else None,
        })
    except Exception as exc:
        logger.warning("Broadcast workflow notification failed: %s", exc)


def _create(
    session: Session,
    *,
    recipient_id: str,
    type_: NotificationType,
    title: str,
    message: str,
    nc_id: Optional[str] = None,
    ref_code: Optional[str] = None,
    reason: Optional[str] = None,
    channel: NotificationChannel = NotificationChannel.IN_APP,
) -> Notification:
    notif = Notification(
        recipient_id=recipient_id,
        nc_id=nc_id,
        ref_code=ref_code,
        type=type_.value,
        title=title,
        message=message,
        reason=reason,
        channel=channel.value,
    )
    session.add(notif)
    session.commit()
    session.refresh(notif)
    _publish(notif)
    logger.info("Notification [%s] → %s | NC=%s", type_.value, recipient_id, ref_code or nc_id)
    return notif


def _managers(session: Session) -> List[User]:
    stmt = select(User).where(User.role.in_(["Manager", "Admin"]))
    return session.exec(stmt).all()


# ─── API publique ──────────────────────────────────────────────────────────────

def notify_assignment(session: Session, nc_id: str, ref_code: str, operator_id: str) -> Notification:
    return _create(
        session,
        recipient_id=operator_id,
        type_=NotificationType.ASSIGNMENT,
        title=f"Nouvelle assignation — {ref_code}",
        message=f"Vous avez été assigné à la non-conformance {ref_code}.",
        nc_id=nc_id,
        ref_code=ref_code,
    )


def notify_reassignment(session: Session, nc_id: str, ref_code: str, assigned_to: str, reason: Optional[str] = None) -> Notification:
    msg = f"La NC {ref_code} vous a été réassignée."
    if reason:
        msg += f" Motif : {reason}."
    return _create(
        session,
        recipient_id=assigned_to,
        type_=NotificationType.REASSIGNMENT,
        title=f"Réassignation — {ref_code}",
        message=msg,
        nc_id=nc_id,
        ref_code=ref_code,
        reason=reason,
    )


def notify_closed(session: Session, nc_id: str, ref_code: str, recipient_id: str) -> Notification:
    return _create(
        session,
        recipient_id=recipient_id,
        type_=NotificationType.CLOSED,
        title=f"NC clôturée — {ref_code}",
        message=f"La non-conformance {ref_code} a été résolue et clôturée.",
        nc_id=nc_id,
        ref_code=ref_code,
    )


def notify_rejected(session: Session, nc_id: str, ref_code: str, recipient_id: str, reason: Optional[str] = None) -> Notification:
    msg = f"La NC {ref_code} a été rejetée."
    if reason:
        msg += f" Motif : {reason}."
    else:
        msg += " Aucun motif n'a été fourni."
    return _create(
        session,
        recipient_id=recipient_id,
        type_=NotificationType.REJECTED,
        title=f"NC rejetée — {ref_code}",
        message=msg,
        nc_id=nc_id,
        ref_code=ref_code,
        reason=reason,
    )


def notify_reopened(session: Session, nc_id: str, ref_code: str, assigned_to: Optional[str]) -> Optional[Notification]:
    if not assigned_to:
        return None
    return _create(
        session,
        recipient_id=assigned_to,
        type_=NotificationType.REOPENED,
        title=f"NC rouverte — {ref_code}",
        message=f"La NC {ref_code} a été rouverte. Veuillez reprendre l'investigation.",
        nc_id=nc_id,
        ref_code=ref_code,
    )


def notify_corrective_action_assigned(session: Session, nc_id: str, ref_code: str, assigned_to: str) -> Notification:
    return _create(
        session,
        recipient_id=assigned_to,
        type_=NotificationType.CORRECTIVE_ACTION_ASSIGNED,
        title=f"Action corrective assignée — {ref_code}",
        message=f"Une action corrective a été définie pour la NC {ref_code} et vous est assignée.",
        nc_id=nc_id,
        ref_code=ref_code,
    )


def notify_corrective_action_proposed(session: Session, nc_id: str, ref_code: str) -> List[Notification]:
    managers = _managers(session)
    created: List[Notification] = []
    for mgr in managers:
        n = _create(
            session,
            recipient_id=mgr.id,
            type_=NotificationType.CORRECTIVE_ACTION_PROPOSED,
            title=f"Action corrective à valider — {ref_code}",
            message=f"Une action corrective a été proposée pour la NC {ref_code}. Veuillez la vérifier.",
            nc_id=nc_id,
            ref_code=ref_code,
        )
        created.append(n)
    return created


# ─── Inbox / Queries ───────────────────────────────────────────────────────────

def get_notifications_for_user(
    session: Session, recipient_id: str, unread_only: bool = False, limit: int = 50
) -> List[Notification]:
    stmt = (
        select(Notification)
        .where(Notification.recipient_id == recipient_id)
        .where(Notification.deleted_at.is_(None))
    )
    if unread_only:
        stmt = stmt.where(Notification.is_read == False)
    stmt = stmt.order_by(Notification.created_at.desc()).limit(limit)
    return session.exec(stmt).all()


def get_unread_count(session: Session, recipient_id: str) -> int:
    stmt = select(Notification).where(
        Notification.recipient_id == recipient_id,
        Notification.is_read == False,
        Notification.deleted_at.is_(None),
    )
    return len(session.exec(stmt).all())


def mark_as_read(session: Session, notification_id: int, user_id: str) -> Optional[Notification]:
    notif = session.get(Notification, notification_id)
    if not notif or notif.recipient_id != user_id:
        return None
    if notif.is_read:
        return notif
    notif.is_read = True
    notif.read_at = datetime.utcnow()
    session.add(notif)
    session.commit()
    session.refresh(notif)
    _publish(notif)
    return notif


def mark_all_as_read(session: Session, user_id: str) -> int:
    stmt = select(Notification).where(
        Notification.recipient_id == user_id,
        Notification.is_read == False,
        Notification.deleted_at.is_(None),
    )
    notifs = session.exec(stmt).all()
    now = datetime.utcnow()
    for n in notifs:
        n.is_read = True
        n.read_at = now
        _publish(n)
    session.commit()
    return len(notifs)


def delete_notification(session: Session, notification_id: int, user_id: str) -> bool:
    notif = session.get(Notification, notification_id)
    if not notif or notif.recipient_id != user_id or notif.deleted_at:
        return False
    notif.deleted_at = datetime.utcnow()
    session.add(notif)
    session.commit()
    return True


def restore_notification(session: Session, notification_id: int, user_id: str) -> Optional[Notification]:
    notif = session.get(Notification, notification_id)
    if not notif or notif.recipient_id != user_id or notif.deleted_at is None:
        return None
    notif.deleted_at = None
    session.add(notif)
    session.commit()
    session.refresh(notif)
    return notif


def delete_old_notifications(session: Session, days: int = 90) -> int:
    cutoff = datetime.utcnow() - timedelta(days=days)
    stmt = select(Notification).where(
        Notification.is_read == True,
        Notification.read_at < cutoff,
    )
    old = session.exec(stmt).all()
    for n in old:
        session.delete(n)
    session.commit()
    return len(old)