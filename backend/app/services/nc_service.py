from sqlmodel import Session
from datetime import datetime
from app.models.non_conformance import NonConformance
from app.models.nc_event import NCEvent
from app.enums import NCState
from app.services.state_machine import can_transition
from app.services.id_generator import generate_id


class InvalidTransitionError(Exception):
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
        current_state=NCState.RAISED
    )
    session.add(nc)
    session.flush()

    event = NCEvent(
        id_event=generate_id(session, "event"),
        nc_id=nc.id_nc,
        from_state=None,
        to_state=NCState.RAISED,
        actor_id=raised_by,
        notes="NC créée"
    )
    session.add(event)

    session.commit()
    session.refresh(nc)
    return nc


def transition_nc(session: Session, nc_id: str, to_state: NCState, actor_id: str, notes: str = None) -> NonConformance:
    nc = session.get(NonConformance, nc_id)
    if not nc:
        raise ValueError("NC introuvable")

    if not can_transition(nc.current_state, to_state):
        raise InvalidTransitionError(f"Transition {nc.current_state} → {to_state} interdite")

    event = NCEvent(
        id_event=generate_id(session, "event"),
        nc_id=nc_id,
        from_state=nc.current_state,
        to_state=to_state,
        actor_id=actor_id,
        notes=notes
    )
    session.add(event)

    nc.current_state = to_state
    if to_state == NCState.CLOSED:
        nc.closed_at = datetime.utcnow()
    session.add(nc)

    session.commit()
    session.refresh(nc)
    return nc


def get_nc(session: Session, nc_id: str) -> NonConformance:
    nc = session.get(NonConformance, nc_id)
    if not nc:
        raise ValueError("NC introuvable")
    return nc


def get_nc_events(session: Session, nc_id: str) -> list[NCEvent]:
    from sqlmodel import select
    return session.exec(select(NCEvent).where(NCEvent.nc_id == nc_id).order_by(NCEvent.timestamp)).all()


def add_root_cause(session: Session, nc_id: str, category: str, description: str, identified_by: str):
    from app.models.root_cause import RootCause
    rc = RootCause(
        id_cause=generate_id(session, "cause"),
        nc_id=nc_id, category=category, description=description, identified_by=identified_by
    )
    session.add(rc)
    session.commit()
    session.refresh(rc)
    return rc


def add_corrective_action(session: Session, nc_id: str, description: str, assigned_to: str, due_date):
    from app.models.corrective_action import CorrectiveAction
    ca = CorrectiveAction(
        id_action=generate_id(session, "action"),
        nc_id=nc_id, description=description, assigned_to=assigned_to, due_date=due_date
    )
    session.add(ca)
    session.commit()
    session.refresh(ca)
    return ca