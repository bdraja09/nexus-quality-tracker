from datetime import datetime, date
from typing import List, Optional
from sqlmodel import Session, select
from app.models.non_conformance import NonConformance
from app.models.nc_event import NCEvent
from app.models.root_cause import RootCause
from app.models.corrective_action import CorrectiveAction
from app.models.user import User
from app.enums import NCState
from app.services.state_machine import can_transition, role_can_transition
from app.services.id_generator import generate_id
from app.services.sla_service import resolve_alerts_for_nc, check_sla_and_create_alerts


class InvalidTransitionError(Exception):
    pass


class UnauthorizedTransitionError(Exception):
    pass


def raise_nc(session: Session, title: str, description: str, severity, dept_id: str, raised_by: str) -> NonConformance:
    nc_id = generate_id(session, "nc")
    nc = NonConformance(
        id_nc=nc_id,
        ref_code=nc_id,
        title=title,
        description=description,
        severity=severity,
        dept_id=dept_id,
        raised_by=raised_by,
        current_state=NCState.RAISED,
    )
    session.add(nc)
    session.flush()

    event = NCEvent(
        id_event=generate_id(session, "event"),
        nc_id=nc.id_nc,
        from_state=None,
        to_state=NCState.RAISED,
        actor_id=raised_by,
        notes="NC créée",
    )
    session.add(event)

    session.commit()
    session.refresh(nc)
    check_sla_and_create_alerts(session)
    return nc


def list_ncs(session: Session, current_user: dict, state: Optional[str] = None) -> List[NonConformance]:
    """Liste les NC visibles par l'utilisateur courant. Un Operator ne voit
    que les NC qu'il a levées ou qui lui sont assignées ; les autres rôles
    voient tout."""
    query = select(NonConformance).where(NonConformance.is_deleted == False)

    if current_user["role"] == "Operator":
        uid = current_user["id"]
        query = query.where(
            (NonConformance.raised_by == uid) | (NonConformance.assigned_to == uid)
        )

    if state:
        query = query.where(NonConformance.current_state == state)

    query = query.order_by(NonConformance.raised_at.desc())
    return session.exec(query).all()


def list_operators(session: Session) -> List[User]:
    stmt = select(User).where(User.role == "Operator")
    return session.exec(stmt).all()


def transition_nc(
    session: Session, nc_id: str, to_state: NCState, current_user: dict, notes: Optional[str] = None
) -> NonConformance:
    nc = session.get(NonConformance, nc_id)
    if not nc:
        raise ValueError("NC introuvable")

    if not can_transition(nc.current_state, to_state):
        raise InvalidTransitionError(f"Transition {nc.current_state} → {to_state} interdite")

    if not role_can_transition(nc.current_state, to_state, current_user["role"]):
        raise UnauthorizedTransitionError(
            f"Le rôle {current_user['role']} ne peut pas effectuer la transition {nc.current_state} → {to_state}"
        )

    actor_id = current_user["id"]

    event = NCEvent(
        id_event=generate_id(session, "event"),
        nc_id=nc_id,
        from_state=nc.current_state,
        to_state=to_state,
        actor_id=actor_id,
        notes=notes,
    )
    session.add(event)

    nc.current_state = to_state
    if to_state == NCState.CLOSED:
        nc.closed_at = datetime.utcnow()
    session.add(nc)

    session.commit()
    session.refresh(nc)

    if to_state in (NCState.CLOSED, NCState.REJECTED):
        resolve_alerts_for_nc(session, nc_id)
    else:
        check_sla_and_create_alerts(session)

    return nc


def assign_nc(session: Session, nc_id: str, operator_id: str, due_date: date, actor_id: str) -> NonConformance:
    nc = session.get(NonConformance, nc_id)
    if not nc:
        raise ValueError("NC introuvable")

    if not can_transition(nc.current_state, NCState.ASSIGNED):
        raise InvalidTransitionError(f"Transition {nc.current_state} → ASSIGNED interdite")

    event = NCEvent(
        id_event=generate_id(session, "event"),
        nc_id=nc_id,
        from_state=nc.current_state,
        to_state=NCState.ASSIGNED,
        actor_id=actor_id,
        notes=f"Assignée à {operator_id}, échéance {due_date.isoformat()}",
    )
    session.add(event)

    nc.assigned_to = operator_id
    nc.due_date = due_date
    nc.current_state = NCState.ASSIGNED
    session.add(nc)

    session.commit()
    session.refresh(nc)
    check_sla_and_create_alerts(session)
    return nc


def soft_delete_nc(session: Session, nc_id: str, actor_id: str) -> NonConformance:
    nc = session.get(NonConformance, nc_id)
    if not nc:
        raise ValueError("NC introuvable")

    nc.is_deleted = True
    nc.deleted_at = datetime.utcnow()
    session.add(nc)

    event = NCEvent(
        id_event=generate_id(session, "event"),
        nc_id=nc_id,
        from_state=nc.current_state,
        to_state=nc.current_state,
        actor_id=actor_id,
        notes="NC supprimée (soft delete)",
    )
    session.add(event)
    session.commit()
    return nc


def get_nc(session: Session, nc_id: str) -> NonConformance:
    nc = session.get(NonConformance, nc_id)
    if not nc:
        raise ValueError("NC introuvable")
    return nc


def get_nc_events(session: Session, nc_id: str) -> List[NCEvent]:
    stmt = select(NCEvent).where(NCEvent.nc_id == nc_id).order_by(NCEvent.timestamp)
    return session.exec(stmt).all()


def add_root_cause(session: Session, nc_id: str, category: str, description: str, identified_by: str) -> RootCause:
    if not session.get(NonConformance, nc_id):
        raise ValueError("NC introuvable")

    rc = RootCause(
        id_cause=generate_id(session, "cause"),
        nc_id=nc_id,
        category=category,
        description=description,
        identified_by=identified_by,
    )
    session.add(rc)
    session.commit()
    session.refresh(rc)
    return rc


def add_corrective_action(session: Session, nc_id: str, description: str, assigned_to: str, due_date: date) -> CorrectiveAction:
    if not session.get(NonConformance, nc_id):
        raise ValueError("NC introuvable")

    ca = CorrectiveAction(
        id_action=generate_id(session, "action"),
        nc_id=nc_id,
        description=description,
        assigned_to=assigned_to,
        due_date=due_date,
    )
    session.add(ca)
    session.commit()
    session.refresh(ca)
    return ca


def get_kpi(session: Session) -> dict:
    all_ncs = session.exec(select(NonConformance).where(NonConformance.is_deleted == False)).all()
    closed = [nc for nc in all_ncs if nc.current_state == NCState.CLOSED and nc.closed_at]
    open_ncs = [nc for nc in all_ncs if nc.current_state not in (NCState.CLOSED, NCState.REJECTED)]

    avg_days = None
    if closed:
        total_seconds = sum((nc.closed_at - nc.raised_at).total_seconds() for nc in closed)
        avg_days = round((total_seconds / len(closed)) / 86400, 1)

    from datetime import timedelta
    sla_breaches = [nc for nc in open_ncs if (datetime.utcnow() - nc.raised_at) > timedelta(days=5)]

    by_severity, by_state = {}, {}
    for nc in all_ncs:
        by_severity[nc.severity] = by_severity.get(nc.severity, 0) + 1
        by_state[nc.current_state] = by_state.get(nc.current_state, 0) + 1

    return {
        "total_nc": len(all_ncs), "open_nc": len(open_ncs), "closed_nc": len(closed),
        "avg_close_days": avg_days, "sla_breaches": len(sla_breaches),
        "by_severity": by_severity, "by_state": by_state,
    }


def get_trend(session: Session, days: int = 14) -> List[dict]:
    from datetime import timedelta
    since = datetime.utcnow() - timedelta(days=days)
    ncs = session.exec(
        select(NonConformance).where(
            NonConformance.is_deleted == False,
            NonConformance.raised_at >= since,
        )
    ).all()

    buckets: dict = {}
    for i in range(days):
        day = (since + timedelta(days=i)).date().isoformat()
        buckets[day] = 0
    for nc in ncs:
        day = nc.raised_at.date().isoformat()
        if day in buckets:
            buckets[day] += 1

    return [{"date": d, "count": c} for d, c in buckets.items()]