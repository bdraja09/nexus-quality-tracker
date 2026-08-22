import enum

class NCState(str, enum.Enum):
    RAISED = "RAISED"
    ASSIGNED = "ASSIGNED"
    UNDER_INVESTIGATION = "UNDER_INVESTIGATION"
    CORRECTIVE_ACTION = "CORRECTIVE_ACTION"
    CLOSED = "CLOSED"
    REJECTED = "REJECTED"

class NCType(str, enum.Enum):
    INTERNAL = "internal"
    EXTERNAL = "external"

class NCStatus(str, enum.Enum):
    PENDING = "pending"
    COMPLETED = "completed"

class Severity(str, enum.Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"
