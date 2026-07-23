import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NcService, AuthService, Role } from '@core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { RouterLink } from '@angular/router';

const ACTION_LABELS: any = {
  ASSIGNED: 'Assigner',
  UNDER_INVESTIGATION: 'Démarrer investigation',
  CORRECTIVE_ACTION: 'Proposer action corrective',
  CLOSED: 'Clôturer',
  REJECTED: 'Rejeter'
};

@Component({
  selector: 'app-nc-list',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatIconModule, MatCardModule, RouterLink],
  templateUrl: './nc-list.component.html',
  styleUrl: './nc-list.component.scss'
})
export class NcListComponent implements OnInit {
  ncs: any[] = [];
  operators: any[] = [];
  loading = true;
  error = '';

  assigningNcId: string | null = null;
  selectedOperator = '';
  dueDate = '';
  assignNotes = '';

  constructor(private ncService: NcService, private authService: AuthService) {}

  get userRole(): string {
    return this.authService.currentUserValue?.role;
  }

  get canDelete(): boolean {
    return this.userRole === Role.Manager;
  }

  get isReadOnly(): boolean {
    return this.userRole === Role.Auditor;
  }

  ngOnInit() {
    this.loadNcs();
    if (this.userRole === Role.Manager) {
      this.ncService.getOperators().subscribe({
        next: (data) => this.operators = data,
        error: () => {}
      });
    }
  }

  loadNcs() {
    this.loading = true;
    this.ncService.getNcs().subscribe({
      next: (data) => { this.ncs = data; this.loading = false; },
      error: () => { this.error = 'Erreur lors du chargement'; this.loading = false; }
    });
  }

  availableActions(state: string): string[] {
    const role = this.userRole;
    const rules: any = {
      Manager: {
        RAISED: ['ASSIGNED'],
        ASSIGNED: ['REJECTED'],
        UNDER_INVESTIGATION: ['REJECTED'],
        CORRECTIVE_ACTION: ['CLOSED', 'UNDER_INVESTIGATION']
      },
      Operator: {
        ASSIGNED: ['UNDER_INVESTIGATION'],
        UNDER_INVESTIGATION: ['CORRECTIVE_ACTION']
      },
      Auditor: {}
    };
    return rules[role]?.[state] || [];
  }

  actionLabel(state: string): string {
    return ACTION_LABELS[state] || state;
  }

  toggleAssignForm(nc: any) {
    if (this.assigningNcId === nc.id_nc) {
      this.assigningNcId = null;
    } else {
      this.assigningNcId = nc.id_nc;
      this.selectedOperator = '';
      this.dueDate = '';
      this.assignNotes = '';
    }
  }

  confirmAssign(nc: any) {
    if (!this.selectedOperator) {
      alert('Sélectionne un opérateur');
      return;
    }
    this.ncService.transitionNc(nc.id_nc, 'ASSIGNED', {
      assigned_to: this.selectedOperator,
      due_date: this.dueDate || undefined,
      notes: this.assignNotes || undefined
    }).subscribe({
      next: () => { this.assigningNcId = null; this.loadNcs(); },
      error: (err) => alert(err.error?.detail || 'Erreur lors de l\'assignation')
    });
  }

  doTransition(nc: any, toState: string) {
    if (toState === 'ASSIGNED') {
      this.toggleAssignForm(nc);
      return;
    }
    let notes: string | null = null;
    if (toState === 'CORRECTIVE_ACTION') {
      notes = prompt('Décrivez l\'action corrective proposée :');
      if (notes === null) return;
    } else if (toState === 'REJECTED') {
      notes = prompt('Motif du rejet :');
      if (notes === null) return;
    }
    this.ncService.transitionNc(nc.id_nc, toState, { notes: notes || undefined }).subscribe({
      next: () => this.loadNcs(),
      error: (err) => alert(err.error?.detail || 'Erreur lors de la transition')
    });
  }

  deleteNc(nc: any) {
    if (!confirm(`Supprimer la NC ${nc.ref_code} ?`)) return;
    this.ncService.deleteNc(nc.id_nc).subscribe({
      next: () => this.loadNcs(),
      error: () => alert('Erreur lors de la suppression')
    });
  }

  operatorName(id: string): string {
    const op = this.operators.find(o => o.id === id);
    return op ? op.name : (id || '—');
  }

  severityColor(s: string) {
    const c: any = { low: '#4caf50', medium: '#ff9800', high: '#f44336', critical: '#9c27b0' };
    return c[s] || '#9e9e9e';
  }

  stateColor(s: string) {
    const c: any = { RAISED: '#2196f3', ASSIGNED: '#ff9800', UNDER_INVESTIGATION: '#9c27b0',
                     CORRECTIVE_ACTION: '#00bcd4', CLOSED: '#4caf50', REJECTED: '#757575' };
    return c[s] || '#9e9e9e';
  }
}