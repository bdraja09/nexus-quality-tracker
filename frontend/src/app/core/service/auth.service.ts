import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private apiUrl = 'http://localhost:8000/auth';
  private currentUserSubject: BehaviorSubject<any>;
  public currentUser: Observable<any>;

  constructor(private http: HttpClient, private router: Router) {
    this.currentUserSubject = new BehaviorSubject<any>(
      JSON.parse(localStorage.getItem('currentUser') || 'null')
    );
    this.currentUser = this.currentUserSubject.asObservable();
  }

  public get currentUserValue(): any {
    return this.currentUserSubject.value;
  }

  login(username: string, password: string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/login`, { email: username, password }).pipe(
      map((data) => {
        const currentUser = {
          token: data.access_token,
          id: data.user.id,
          email: data.user.email,
          role: data.user.role,
          first_name: data.user.first_name,
          last_name: data.user.last_name
        };
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        this.currentUserSubject.next(currentUser);
        return currentUser;
      })
    );
  }

  logout(): Observable<any> {
    localStorage.removeItem('currentUser');
    this.currentUserSubject.next(null);
    this.router.navigate(['/authentication/signin']);
    return of(true);   // <- renvoie un Observable pour que .subscribe() fonctionne
  }

  isLoggedIn(): boolean {
    return !!this.currentUserValue?.token;
  }
}