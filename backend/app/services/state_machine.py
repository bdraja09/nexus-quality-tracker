from app.enums import NCState

ALLOWED_TRANSITIONS = {
    NCState.RAISED: [NCState.ASSIGNED],
    NCState.ASSIGNED: [NCState.UNDER_INVESTIGATION, NCState.REJECTED],
    NCState.UNDER_INVESTIGATION: [NCState.CORRECTIVE_ACTION, NCState.REJECTED],
    NCState.CORRECTIVE_ACTION: [NCState.CLOSED, NCState.UNDER_INVESTIGATION],
    NCState.CLOSED: [],
    NCState.REJECTED: [],
}

TRANSITION_ROLES = {
    (NCState.RAISED, NCState.ASSIGNED): ["Manager"],
    (NCState.ASSIGNED, NCState.UNDER_INVESTIGATION): ["Operator"],
    (NCState.ASSIGNED, NCState.REJECTED): ["Manager"],
    (NCState.UNDER_INVESTIGATION, NCState.CORRECTIVE_ACTION): ["Operator"],
    (NCState.UNDER_INVESTIGATION, NCState.REJECTED): ["Manager"],
    (NCState.CORRECTIVE_ACTION, NCState.CLOSED): ["Manager"],
    (NCState.CORRECTIVE_ACTION, NCState.UNDER_INVESTIGATION): ["Manager"],
}


def can_transition(from_state: NCState, to_state: NCState) -> bool:
    return to_state in ALLOWED_TRANSITIONS.get(from_state, [])


def role_can_transition(from_state: NCState, to_state: NCState, role: str) -> bool:
    allowed_roles = TRANSITION_ROLES.get((from_state, to_state), [])
    return role in allowed_roles