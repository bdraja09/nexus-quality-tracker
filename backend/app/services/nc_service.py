from datetime import datetime
from uuid import UUID, uuid4

from sqlmodel import Session, select

from app.enums import NCState
from app.models.non_conformance import NonConformance
from app.models.nc_event import NCEvent
from app.models.root_cause import RootCause
from app.models.corrective_action import CorrectiveAction
from app.services.state_machine import can_transition


class InvalidTransitionError(Exception):
    pass


def raise_nc(
    session: Session,
    title: str,
    description: str,
    severity,
    dept_id: UUID,
    raised_by: UUID,
) -> NonConformance:
    nc = NonConformance(
        ref_code=f"NC-{uuid4().hex[:8].upper()}",
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
        nc_id=nc.id,
        from_state=None,
        to_state=NCState.RAISED,
        actor_id=raised_by,
        notes="NC créée",
    )
    session.add(event)

    session.commit()
    session.refresh(nc)
    return nc


def transition_nc(
    session: Session,
    nc_id: UUID,
    to_state: NCState,
    actor_id: UUID,
    notes: str | None = None,
) -> NonConformance:
    nc = session.get(NonConformance, nc_id)
    if not nc:
        raise ValueError("NC introuvable")

    if not can_transition(nc.current_state, to_state):
        raise InvalidTransitionError(f"Transition {nc.current_state} → {to_state} interdite")

    event = NCEvent(
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
    return nc


def get_nc(session: Session, nc_id: UUID) -> NonConformance:
    nc = session.get(NonConformance, nc_id)
    if not nc:
        raise ValueError("NC introuvable")
    return nc


def get_nc_events(session: Session, nc_id: UUID) -> list[NCEvent]:
    return session.exec(
        select(NCEvent)
        .where(NCEvent.nc_id == nc_id)
        .order_by(NCEvent.timestamp)
    ).all()


def add_root_cause(
    session: Session,
    nc_id: UUID,
    category: str,
    description: str,
    identified_by: UUID,
) -> RootCause:
    root_cause = RootCause(
        nc_id=nc_id,
        category=category,
        description=description,
        identified_by=identified_by,
    )
    session.add(root_cause)
    session.commit()
    session.refresh(root_cause)
    return root_cause


def add_corrective_action(
    session: Session,
    nc_id: UUID,
    description: str,
    assigned_to: UUID,
    due_date,
) -> CorrectiveAction:
    action = CorrectiveAction(
        nc_id=nc_id,
        description=description,
        assigned_to=assigned_to,
        due_date=due_date,
    )
    session.add(action)
    session.commit()
    session.refresh(action)
    return action
