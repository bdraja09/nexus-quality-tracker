import { Routes } from '@angular/router';
import { NcFormComponent } from './nc-form/nc-form.component';
import { NcListComponent } from './nc-list/nc-list.component';
import { AuditsComponent } from './audits/audits.component';
import { DashboardComponent } from '../dashboard/dashboard.component';

export const QUALITY_ROUTES: Routes = [
  { path: 'dashboard', component: DashboardComponent },
  { path: 'nc-form', component: NcFormComponent },
  { path: 'nc-list', component: NcListComponent },
  { path: 'audits', component: AuditsComponent }
];
