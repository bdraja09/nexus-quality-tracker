import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';

@Injectable({ providedIn: 'root' })
export class NcService {
  private apiUrl = 'http://localhost:8000/nc';

  constructor(private http: HttpClient) {}

  raiseNc(data: any) {
    return this.http.post(`${this.apiUrl}/`, data);
  }

  getNcs(state?: string) {
    let params = new HttpParams();
    if (state) params = params.set('state', state);
    return this.http.get<any[]>(`${this.apiUrl}/`, { params });
  }

  getKpi() {
    return this.http.get<any>(`${this.apiUrl}/kpi`);
  }

  getOperators() {
    return this.http.get<any[]>(`${this.apiUrl}/operators`);
  }

  deleteNc(id: string) {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }

  transitionNc(id: string, toState: string, extra: { notes?: string; assigned_to?: string; due_date?: string } = {}) {
    return this.http.post(`${this.apiUrl}/${id}/transition`, { to_state: toState, ...extra });
  }
}