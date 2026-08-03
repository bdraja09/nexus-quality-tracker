import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Audit, AuditFinding, AuditCreatePayload, AuditCompletePayload, FindingCreatePayload, EscalateFindingPayload } from '../models/audit.model';

@Injectable({
  providedIn: 'root'
})
export class AuditService {
  private apiUrl = 'http://localhost:8000/audits';

  constructor(private http: HttpClient) {}

  listAudits(deptId?: string): Observable<Audit[]> {
    let params = new HttpParams();
    if (deptId) {
      params = params.set('dept_id', deptId);
    }
    return this.http.get<Audit[]>(`${this.apiUrl}/`, { params });
  }

  createAudit(payload: AuditCreatePayload): Observable<Audit> {
    return this.http.post<Audit>(`${this.apiUrl}/`, payload);
  }

  getAudit(auditId: string): Observable<Audit> {
    return this.http.get<Audit>(`${this.apiUrl}/${auditId}`);
  }

  completeAudit(auditId: string, findings?: string): Observable<Audit> {
    const payload: AuditCompletePayload = { findings };
    return this.http.patch<Audit>(`${this.apiUrl}/${auditId}/complete`, payload);
  }

  listFindings(auditId: string): Observable<AuditFinding[]> {
    return this.http.get<AuditFinding[]>(`${this.apiUrl}/${auditId}/findings`);
  }

  addFinding(auditId: string, payload: FindingCreatePayload): Observable<AuditFinding> {
    return this.http.post<AuditFinding>(`${this.apiUrl}/${auditId}/findings`, payload);
  }

  escalateFindingToNc(findingId: string, title: string): Observable<any> {
    const payload: EscalateFindingPayload = { title };
    return this.http.post<any>(`${this.apiUrl}/findings/${findingId}/escalate`, payload);
  }
}
