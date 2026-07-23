import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { RouteInfo } from './sidebar.metadata';

@Injectable({
  providedIn: 'root',
})
export class SidebarService {
  constructor(private http: HttpClient) {}

  /**
   * Get sidebar menu items from JSON file
   * @returns Observable<RouteInfo[]>
   */
  getRouteInfo(): Observable<RouteInfo[]> {
    // Assuming the JSON file is in the assets folder
    return this.http
      .get<{ routes: RouteInfo[] }>('assets/data/routes.json')
      .pipe(map((response) => response.routes));
  }
}
