import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { Department } from '../models/department.model';

interface DepartmentApi {
  id_dept: string;
  name: string;
}

@Injectable({
  providedIn: 'root'
})
export class DepartmentService {
  private apiUrl = 'http://localhost:8000/departments';

  constructor(private http: HttpClient) {}

  listDepartments(): Observable<Department[]> {
    return this.http.get<DepartmentApi[]>(`${this.apiUrl}/`).pipe(
      map(depts => depts.map(d => ({ id: d.id_dept, name: d.name })))
    );
  }
}