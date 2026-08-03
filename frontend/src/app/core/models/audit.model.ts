export interface Audit {
  id_audit: string;
  dept_id: string;
  auditor_id: string;
  audit_type: string;
  scheduled_date: string;
  completed_date?: string | null;
  findings?: string | null;
}

export interface AuditFinding {
  id_finding: string;
  audit_id: string;
  severity: 'low' | 'medium' | 'high' | 'critical' | 'Low' | 'Med' | 'High' | 'Critical';
  description: string;
  nc_id?: string | null;
}

export interface AuditCreatePayload {
  dept_id: string;
  auditor_id: string;
  audit_type: string;
  scheduled_date: string;
}

export interface AuditCompletePayload {
  findings?: string;
}

export interface FindingCreatePayload {
  severity: string;
  description: string;
}

export interface EscalateFindingPayload {
  title: string;
}
