import { Routes } from '@angular/router';
import { NcFormComponent } from './quality/nc-form/nc-form.component';
import { NcListComponent } from './quality/nc-list/nc-list.component';
import { DashboardComponent } from './dashboard/dashboard.component';

export const ADMIN_ROUTE: Routes = [
  { path: 'quality/dashboard', component: DashboardComponent },
  { path: 'quality/nc-form', component: NcFormComponent },
  { path: 'quality/nc-list', component: NcListComponent }
];