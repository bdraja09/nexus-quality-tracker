import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { NcService, AuthService, Role } from '@core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { FeatherModule } from 'angular-feather';
import { RouterLink } from '@angular/router';

const ACTION_LABELS: Record<string, string> = {
  ASSIGNED: 'Assign',
  UNDER_INVESTIGATION: 'Start investigation',
  CORRECTIVE_ACTION: 'Propose corrective action',
  CLOSED: 'Close',
  REJECTED: 'Reject'
};

const STATE_LABELS: Record<string, string> = {
  RAISED: 'Raised',
  ASSIGNED: 'Assigned',
  UNDER_INVESTIGATION: 'Investigating',
  CORRECTIVE_ACTION: 'Corrective action',
  CLOSED: 'Closed',
  REJECTED: 'Rejected'
};

// 5M (Ishikawa) categories for root cause classification.
// Values stay as-is (backend contract); only the displayed label is English.
export const ROOT_CAUSE_CATEGORIES = [
  { value: 'main_oeuvre', label: 'Manpower' },
  { value: 'methode', label: 'Method' },
  { value: 'materiel', label: 'Machine' },
  { value: 'matiere', label: 'Material' },
  { value: 'milieu', label: 'Environment' }
];

@Component({
  selector: 'app-nc-list',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatIconModule, FeatherModule, RouterLink],
  templateUrl: './nc-list.component.html',
  styleUrl: './nc-list.component.scss'
})
export class NcListComponent implements OnInit {
  ncs: any[] = [];
  operators: any[] = [];
  loading = true;

  rootCauseCategories = ROOT_CAUSE_CATEGORIES;

  // ── Page-level error banner (load failures, delete, generic transitions) ──
  listError = '';

  // ── Status filter ──
  stateFilter = 'ALL';
  stateFilters = [
    { value: 'ALL', label: 'All' },
    { value: 'RAISED', label: 'Raised' },
    { value: 'ASSIGNED', label: 'Assigned' },
    { value: 'UNDER_INVESTIGATION', label: 'Investigating' },
    { value: 'CORRECTIVE_ACTION', label: 'Corrective action' },
    { value: 'CLOSED', label: 'Closed' },
    { value: 'REJECTED', label: 'Rejected' }
  ];

  // ── Assign form ──
  assigningNcId: string | null = null;
  selectedOperator = '';
  dueDate = '';
  assignNotes = '';
  assignError = '';

  // ── Root cause + corrective action form ──
  correctiveNcId: string | null = null;
  rootCauseCategory = '';
  rootCauseDescription = '';
  correctiveDescription = '';
  correctiveAssignedTo = '';
  correctiveDueDate = '';
  correctiveSubmitting = false;
  correctiveError = '';

  // ── Reject form ──
  rejectingNcId: string | null = null;
  rejectReason = '';
  rejectError = '';

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

  get filteredNcs(): any[] {
    if (this.stateFilter === 'ALL') return this.ncs;
    return this.ncs.filter(nc => nc.current_state === this.stateFilter);
  }

  get stateCounts(): Record<string, number> {
    const counts: Record<string, number> = { ALL: this.ncs.length };
    for (const nc of this.ncs) {
      counts[nc.current_state] = (counts[nc.current_state] || 0) + 1;
    }
    return counts;
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
      error: () => { this.listError = 'Something went wrong while loading non-conformances.'; this.loading = false; }
    });
  }

  setStateFilter(value: string): void {
    this.stateFilter = value;
  }

  dismissListError(): void {
    this.listError = '';
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

  stateLabel(state: string): string {
    return STATE_LABELS[state] || state;
  }

  stateClass(state: string): string {
    return 'state-' + (state || '').toLowerCase().replace(/_/g, '-');
  }

  private closeAllInlineForms() {
    this.assigningNcId = null;
    this.correctiveNcId = null;
    this.rejectingNcId = null;
  }

  // ── Assign ──
  toggleAssignForm(nc: any) {
    const wasOpen = this.assigningNcId === nc.id_nc;
    this.closeAllInlineForms();
    if (!wasOpen) {
      this.assigningNcId = nc.id_nc;
      this.selectedOperator = '';
      this.dueDate = '';
      this.assignNotes = '';
      this.assignError = '';
    }
  }

  confirmAssign(nc: any) {
    if (!this.selectedOperator) return;
    this.assignError = '';
    this.ncService.transitionNc(nc.id_nc, 'ASSIGNED', {
      assigned_to: this.selectedOperator,
      due_date: this.dueDate || undefined,
      notes: this.assignNotes || undefined
    }).subscribe({
      next: () => { this.assigningNcId = null; this.loadNcs(); },
      error: (err) => this.assignError = err.error?.detail || 'Something went wrong while assigning this NC.'
    });
  }

  // ── Root cause + corrective action ──
  toggleCorrectiveForm(nc: any) {
    const wasOpen = this.correctiveNcId === nc.id_nc;
    this.closeAllInlineForms();
    if (!wasOpen) {
      this.correctiveNcId = nc.id_nc;
      this.rootCauseCategory = '';
      this.rootCauseDescription = '';
      this.correctiveDescription = '';
      this.correctiveAssignedTo = '';
      this.correctiveDueDate = '';
      this.correctiveError = '';
    }
  }

  // due_date and assigned_to are required by CorrectiveActionRequest on the API side
  get correctiveFormValid(): boolean {
    return !!this.rootCauseCategory
      && this.rootCauseDescription.trim().length > 0
      && this.correctiveDescription.trim().length > 0
      && !!this.correctiveAssignedTo
      && !!this.correctiveDueDate;
  }

  confirmCorrectiveAction(nc: any) {
    if (!this.correctiveFormValid || this.correctiveSubmitting) return;
    this.correctiveSubmitting = true;
    this.correctiveError = '';

    const identifiedBy = this.authService.currentUserValue?.id;

    forkJoin({
      rootCause: this.ncService.addRootCause(
        nc.id_nc,
        this.rootCauseCategory,
        this.rootCauseDescription.trim(),
        identifiedBy
      ),
      correctiveAction: this.ncService.addCorrectiveAction(
        nc.id_nc,
        this.correctiveDescription.trim(),
        this.correctiveAssignedTo,
        this.correctiveDueDate
      )
    }).subscribe({
      next: () => {
        this.ncService.transitionNc(nc.id_nc, 'CORRECTIVE_ACTION', {}).subscribe({
          next: () => {
            this.correctiveSubmitting = false;
            this.correctiveNcId = null;
            this.loadNcs();
          },
          error: (err) => {
            this.correctiveSubmitting = false;
            this.correctiveError = err.error?.detail || 'Root cause and corrective action were saved, but the state transition failed.';
            this.loadNcs();
          }
        });
      },
      error: (err) => {
        this.correctiveSubmitting = false;
        this.correctiveError = err.error?.detail || 'Something went wrong while saving the root cause or corrective action.';
      }
    });
  }

  // ── Reject ──
  toggleRejectForm(nc: any) {
    const wasOpen = this.rejectingNcId === nc.id_nc;
    this.closeAllInlineForms();
    if (!wasOpen) {
      this.rejectingNcId = nc.id_nc;
      this.rejectReason = '';
      this.rejectError = '';
    }
  }

  confirmReject(nc: any) {
    if (!this.rejectReason.trim()) return;
    this.rejectError = '';
    this.ncService.transitionNc(nc.id_nc, 'REJECTED', { notes: this.rejectReason.trim() }).subscribe({
      next: () => { this.rejectingNcId = null; this.loadNcs(); },
      error: (err) => this.rejectError = err.error?.detail || 'Something went wrong while rejecting this NC.'
    });
  }

  // ── Generic transition dispatch ──
  doTransition(nc: any, toState: string) {
    if (toState === 'ASSIGNED') { this.toggleAssignForm(nc); return; }
    if (toState === 'CORRECTIVE_ACTION') { this.toggleCorrectiveForm(nc); return; }
    if (toState === 'REJECTED') { this.toggleRejectForm(nc); return; }

    // Transitions without a form (e.g. CLOSED, back to UNDER_INVESTIGATION)
    this.ncService.transitionNc(nc.id_nc, toState, {}).subscribe({
      next: () => this.loadNcs(),
      error: (err) => this.listError = err.error?.detail || 'Something went wrong while updating this NC.'
    });
  }

  deleteNc(nc: any) {
    if (!confirm(`Delete NC ${nc.ref_code}?`)) return;
    this.ncService.deleteNc(nc.id_nc).subscribe({
      next: () => this.loadNcs(),
      error: () => this.listError = 'Something went wrong while deleting this NC.'
    });
  }

  operatorName(id: string): string {
    const op = this.operators.find(o => o.id === id);
    return op ? op.name : (id || '—');
  }
}