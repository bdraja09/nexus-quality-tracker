import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Injectable({
  providedIn: 'root'
})
export class NcService {
  private apiUrl = 'http://localhost:8000/nc';

  constructor(private http: HttpClient) {}

  raiseNc(data: any) {
    return this.http.post(`${this.apiUrl}/`, data);
  }
}