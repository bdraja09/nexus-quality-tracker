from app.enums import NCState

ALLOWED_TRANSITIONS = {
    NCState.RAISED: [NCState.ASSIGNED],
    NCState.ASSIGNED: [NCState.UNDER_INVESTIGATION, NCState.REJECTED],
    NCState.UNDER_INVESTIGATION: [NCState.CORRECTIVE_ACTION, NCState.REJECTED],
    NCState.CORRECTIVE_ACTION: [NCState.CLOSED, NCState.UNDER_INVESTIGATION],
    NCState.CLOSED: [],
    NCState.REJECTED: [],
}


def can_transition(from_state: NCState, to_state: NCState) -> bool:
    return to_state in ALLOWED_TRANSITIONS.get(from_state, [])