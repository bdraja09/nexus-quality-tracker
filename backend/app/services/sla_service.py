from datetime import datetime, timedelta
from typing import List, Optional
from sqlmodel import Session, select

from app.models.non_conformance import NonConformance
from app.models.sla_alert import SlaAlert
from app.enums import NCState
from app.services.sla_broadcaster import broadcaster

SLA_TARGET_DAYS = 5
SLA_WARNING_WINDOW = timedelta(hours=24)

# ISO 9001:2015 §10.2 — le seuil réel du KPI, calculé depuis raised_at.
# Distinct de NonConformance.due_date (engagement d'assignation, QNC-02) :
# une NC jamais assignée n'a pas de due_date mais reste soumise à ce seuil.
SLA_TARGET_DAYS = 5
SLA_WARNING_WINDOW = timedelta(hours=24)


def check_sla_and_create_alerts(session: Session) -> dict:
    """
    Job périodique : scanne toutes les NC non terminées et crée des alertes
    en fonction du seuil ISO 10.2 (raised_at + 5 jours), pas de due_date.
    Retourne un résumé {warning, breached, escalated, total_checked}.
    """
    now = datetime.utcnow()

    stmt = select(NonConformance).where(
        NonConformance.current_state.not_in([
            NCState.CLOSED.value,
            NCState.REJECTED.value
        ]),
        NonConformance.is_deleted == False
    )
    open_ncs = session.exec(stmt).all()

    stats = {"warning": 0, "breached": 0, "escalated": 0, "total_checked": len(open_ncs)}

    for nc in open_ncs:
        raised_at = nc.raised_at
        if not isinstance(raised_at, datetime):
            raised_at = datetime.combine(raised_at, datetime.min.time())

        sla_deadline = raised_at + timedelta(days=SLA_TARGET_DAYS)
        time_left = sla_deadline - now

        if time_left <= timedelta(0):
            _upsert_alert(session, nc.id_nc, "BREACHED", stats)
        elif time_left <= SLA_WARNING_WINDOW:
            _upsert_alert(session, nc.id_nc, "WARNING", stats)

    session.commit()
    return stats

def _upsert_alert(session: Session, nc_id: str, alert_type: str, stats: dict) -> None:
    existing = session.exec(
        select(SlaAlert).where(
            SlaAlert.nc_id == nc_id,
            SlaAlert.alert_type == alert_type,
            SlaAlert.resolved_at.is_(None),
            SlaAlert.deleted_at.is_(None),  # <-- ajouté
        )
    ).first()
    if existing:
        return

    if alert_type == "BREACHED":
        stale_warning = session.exec(
            select(SlaAlert).where(
                SlaAlert.nc_id == nc_id,
                SlaAlert.alert_type == "WARNING",
                SlaAlert.resolved_at.is_(None),
                SlaAlert.deleted_at.is_(None),  # <-- ajouté
            )
        ).first()
        if stale_warning:
            stale_warning.resolved_at = datetime.utcnow()
            stats["escalated"] += 1

    alert = SlaAlert(nc_id=nc_id, alert_type=alert_type)
    session.add(alert)
    stats[alert_type.lower()] += 1

    broadcaster.publish({
        "nc_id": nc_id,
        "alert_type": alert_type,
        "created_at": datetime.utcnow().isoformat()
    })


def get_active_alerts(session: Session, unread_only: bool = False) -> List[SlaAlert]:
    """Alertes non résolues et non supprimées. `unread_only=True` pour le
    badge de notification (ne montrer que ce qui n'a pas été vu)."""
    conditions = [
        SlaAlert.resolved_at.is_(None),
        SlaAlert.deleted_at.is_(None),
    ]
    if unread_only:
        conditions.append(SlaAlert.is_read == False)

    alerts = session.exec(select(SlaAlert).where(*conditions)).all()
    severity = {"BREACHED": 0, "WARNING": 1}
    alerts.sort(key=lambda a: (severity.get(a.alert_type, 99), -a.created_at.timestamp()))
    return alerts


def get_unread_count(session: Session) -> int:
    """Pour un compteur de badge côté UI."""
    stmt = select(SlaAlert).where(
        SlaAlert.is_read == False,
        SlaAlert.deleted_at.is_(None),
    )
    return len(session.exec(stmt).all())


def mark_as_read(session: Session, alert_id: int, user_id: Optional[int] = None) -> Optional[SlaAlert]:
    alert = session.get(SlaAlert, alert_id)
    if not alert or alert.is_read:
        return alert
    alert.is_read = True
    alert.read_at = datetime.utcnow()
    alert.read_by = user_id
    session.add(alert)
    session.commit()
    session.refresh(alert)
    return alert


def mark_all_as_read(session: Session, user_id: Optional[int] = None) -> int:
    stmt = select(SlaAlert).where(
        SlaAlert.is_read == False,
        SlaAlert.deleted_at.is_(None),
    )
    alerts = session.exec(stmt).all()
    now = datetime.utcnow()
    for alert in alerts:
        alert.is_read = True
        alert.read_at = now
        alert.read_by = user_id
    session.commit()
    return len(alerts)


def delete_alert(session: Session, alert_id: int, force: bool = False) -> bool:
    """Suppression douce. Refuse par défaut si l'alerte est encore active
    (non résolue) — voir l'explication du bug plus haut. force=True pour
    un nettoyage admin explicite malgré tout."""
    alert = session.get(SlaAlert, alert_id)
    if not alert or alert.deleted_at is not None:
        return False
    if alert.resolved_at is None and not force:
        raise ValueError("Alerte active : résolvez-la ou utilisez force=True")
    alert.deleted_at = datetime.utcnow()
    session.add(alert)
    session.commit()
    return True


def delete_all_alerts(session: Session, only_resolved: bool = True) -> int:
    """only_resolved=True (par défaut) : ne purge que l'historique déjà
    résolu — un « effacer tout » sûr côté notifications, sans jamais
    masquer une violation SLA en cours."""
    conditions = [SlaAlert.deleted_at.is_(None)]
    if only_resolved:
        conditions.append(SlaAlert.resolved_at.is_not(None))

    alerts = session.exec(select(SlaAlert).where(*conditions)).all()
    now = datetime.utcnow()
    for alert in alerts:
        alert.deleted_at = now
    session.commit()
    return len(alerts)


def restore_alert(session: Session, alert_id: int) -> Optional[SlaAlert]:
    """Annule une suppression douce."""
    alert = session.get(SlaAlert, alert_id)
    if not alert or alert.deleted_at is None:
        return None
    alert.deleted_at = None
    session.add(alert)
    session.commit()
    session.refresh(alert)
    return alert


def resolve_alerts_for_nc(session: Session, nc_id: str) -> int:
    stmt = select(SlaAlert).where(
        SlaAlert.nc_id == nc_id,
        SlaAlert.resolved_at.is_(None),
        SlaAlert.deleted_at.is_(None),  # <-- ajouté
    )
    alerts = session.exec(stmt).all()
    now = datetime.utcnow()
    for alert in alerts:
        alert.resolved_at = now
    session.commit()

    if alerts:
        broadcaster.publish({
            "nc_id": nc_id,
            "alert_type": "RESOLVED",
            "created_at": now.isoformat()
        })

    return len(alerts)