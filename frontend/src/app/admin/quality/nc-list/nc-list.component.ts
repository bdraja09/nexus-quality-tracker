import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NcService, AuthService, Role } from '@core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { FeatherModule } from 'angular-feather';
import { RouterLink } from '@angular/router';

const ACTION_LABELS: Record<string, string> = {
  ASSIGNED: 'Assign',
  UNDER_INVESTIGATION: 'Start investigation',
  ROOT_CAUSE: 'Identify root cause',
  CORRECTIVE_ACTION: 'Propose corrective action',
  CLOSED: 'Close',
  REJECTED: 'Reject',
  VERIFY: 'Verify corrective actions',
  REOPEN: 'Reopen'
};

const STATE_LABELS: Record<string, string> = {
  RAISED: 'Raised',
  ASSIGNED: 'Assigned',
  UNDER_INVESTIGATION: 'Investigating',
  CORRECTIVE_ACTION: 'Corrective action',
  CLOSED: 'Closed',
  REJECTED: 'Rejected'
};

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

  listError = '';

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

  // ── Root cause form ──
  rootCauseNcId: string | null = null;
  rootCauseCategory = '';
  rootCauseDescription = '';
  rootCauseSubmitting = false;
  rootCauseError = '';

  // ── Corrective action form ──
  correctiveNcId: string | null = null;
  correctiveDescription = '';
  correctiveAssignedTo = '';
  correctiveDueDate = '';
  correctiveSubmitting = false;
  correctiveError = '';

  // ── Reject form ──
  rejectingNcId: string | null = null;
  rejectReason = '';
  rejectError = '';

  // ── Manager verification form ──
  verifyNcId: string | null = null;
  verifySubmitting = false;
  verifyError = '';
  verifyReassignTo = '';
  verifyDueDate = '';
  verifyRejectReason = '';

  // ── Reopen form (CLOSED → ASSIGNED) ──
  reopenNcId: string | null = null;
  reopenOperator = '';
  reopenDueDate = '';
  reopenError = '';
  reopenSubmitting = false;

  // ── Detail cache (for verify panel) ──
  ncDetailMap: { [ncId: string]: any } = {};
  loadingDetailMap: { [ncId: string]: boolean } = {};

  constructor(
    private ncService: NcService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) {}

  get userRole(): string {
    return this.authService.currentUserValue?.role;
  }

  get currentUserId(): string {
    return this.authService.currentUserValue?.id ?? '';
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
    if (this.userRole === Role.Manager || this.userRole === Role.Operator) {
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
        CORRECTIVE_ACTION: ['CLOSED', 'VERIFY'],
        CLOSED: ['REOPEN']
      },
      Operator: {
        ASSIGNED: ['UNDER_INVESTIGATION'],
        UNDER_INVESTIGATION: ['ROOT_CAUSE', 'CORRECTIVE_ACTION'],
        CORRECTIVE_ACTION: ['CORRECTIVE_ACTION']
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
    this.rootCauseNcId = null;
    this.correctiveNcId = null;
    this.rejectingNcId = null;
    this.verifyNcId = null;
    this.reopenNcId = null;
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
    if (!this.selectedOperator || !this.dueDate) return;
    this.assignError = '';
    this.ncService.assignNc(nc.id_nc, this.selectedOperator, this.dueDate).subscribe({
      next: () => { this.assigningNcId = null; this.loadNcs(); },
      error: (err) => this.assignError = err.error?.detail || 'Something went wrong while assigning this NC.'
    });
  }

  // ── Root cause form ──
  toggleRootCauseForm(nc: any) {
    const wasOpen = this.rootCauseNcId === nc.id_nc;
    this.closeAllInlineForms();
    if (!wasOpen) {
      this.rootCauseNcId = nc.id_nc;
      this.rootCauseCategory = '';
      this.rootCauseDescription = '';
      this.rootCauseError = '';
    }
  }

  get rootCauseFormValid(): boolean {
    return !!this.rootCauseCategory && this.rootCauseDescription.trim().length > 0;
  }

  confirmRootCause(nc: any) {
    if (!this.rootCauseFormValid || this.rootCauseSubmitting) return;
    this.rootCauseSubmitting = true;
    this.rootCauseError = '';

    const identifiedBy = this.authService.currentUserValue?.id;

    this.ncService.addRootCause(
      nc.id_nc,
      this.rootCauseCategory,
      this.rootCauseDescription.trim(),
      identifiedBy
    ).subscribe({
      next: () => {
        this.rootCauseSubmitting = false;
        this.rootCauseNcId = null;
        this.loadNcs();
      },
      error: (err) => {
        this.rootCauseSubmitting = false;
        this.rootCauseError = err.error?.detail || 'Something went wrong while saving the root cause.';
      }
    });
  }

  // ── Corrective action form ──
  toggleCorrectiveForm(nc: any) {
    const wasOpen = this.correctiveNcId === nc.id_nc;
    this.closeAllInlineForms();
    if (!wasOpen) {
      this.correctiveNcId = nc.id_nc;
      this.correctiveDescription = '';
      this.correctiveAssignedTo = this.userRole === Role.Operator ? this.currentUserId : '';
      this.correctiveDueDate = '';
      this.correctiveError = '';
    }
  }

  get correctiveFormValid(): boolean {
    return this.correctiveDescription.trim().length > 0
      && !!this.correctiveAssignedTo
      && !!this.correctiveDueDate;
  }

  confirmCorrectiveAction(nc: any) {
    if (!this.correctiveFormValid || this.correctiveSubmitting) return;
    this.correctiveSubmitting = true;
    this.correctiveError = '';

    this.ncService.addCorrectiveAction(
      nc.id_nc,
      this.correctiveDescription.trim(),
      this.correctiveAssignedTo,
      this.correctiveDueDate
    ).subscribe({
      next: () => {
        this.ncService.transitionNc(nc.id_nc, 'CORRECTIVE_ACTION', {}).subscribe({
          next: () => {
            this.correctiveSubmitting = false;
            this.correctiveNcId = null;
            this.loadNcs();
          },
          error: (err) => {
            this.correctiveSubmitting = false;
            this.correctiveError = err.error?.detail || 'Corrective action saved, but state transition failed.';
            this.loadNcs();
          }
        });
      },
      error: (err) => {
        this.correctiveSubmitting = false;
        this.correctiveError = err.error?.detail || 'Something went wrong while saving the corrective action.';
      }
    });
  }

  // ── Manager verification (CORRECTIVE_ACTION) ──
  toggleVerifyForm(nc: any) {
    const wasOpen = this.verifyNcId === nc.id_nc;
    this.closeAllInlineForms();
    if (!wasOpen) {
      this.verifyNcId = nc.id_nc;
      this.verifyReassignTo = nc.assigned_to || '';
      this.verifyDueDate = '';
      this.verifyRejectReason = '';
      this.verifyError = '';
      this.verifySubmitting = false;
      this.loadNcDetail(nc.id_nc);
    }
  }

  loadNcDetail(ncId: string): void {
    if (this.ncDetailMap[ncId] || this.loadingDetailMap[ncId]) return;
    this.loadingDetailMap[ncId] = true;
    this.ncService.getNc(ncId).subscribe({
      next: (detail) => {
        this.ncDetailMap[ncId] = detail;
        this.loadingDetailMap[ncId] = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loadingDetailMap[ncId] = false;
      }
    });
  }

  getNcDetail(ncId: string): any {
    return this.ncDetailMap[ncId] || {};
  }

  confirmValidate(nc: any) {
    if (this.verifySubmitting) return;
    this.verifySubmitting = true;
    this.verifyError = '';
    this.ncService.transitionNc(nc.id_nc, 'CLOSED', {}).subscribe({
      next: () => {
        this.verifyNcId = null;
        this.verifySubmitting = false;
        this.loadNcs();
      },
      error: (err) => {
        this.verifySubmitting = false;
        this.verifyError = err.error?.detail || 'Failed to validate and close NC.';
      }
    });
  }

  confirmRejectAndReassign(nc: any) {
    if (!this.verifyReassignTo || !this.verifyDueDate || !this.verifyRejectReason.trim() || this.verifySubmitting) return;
    this.verifySubmitting = true;
    this.verifyError = '';

    this.ncService.assignNc(nc.id_nc, this.verifyReassignTo, this.verifyDueDate).subscribe({
      next: () => {
        this.verifySubmitting = false;
        this.verifyNcId = null;
        this.loadNcs();
      },
      error: (err) => {
        this.verifySubmitting = false;
        this.verifyError = err.error?.detail || 'Failed to re-assign NC.';
      }
    });
  }

  // ── Reopen (CLOSED → ASSIGNED) ──
  toggleReopenForm(nc: any) {
    const wasOpen = this.reopenNcId === nc.id_nc;
    this.closeAllInlineForms();
    if (!wasOpen) {
      this.reopenNcId = nc.id_nc;
      this.reopenOperator = nc.assigned_to || '';
      this.reopenDueDate = '';
      this.reopenError = '';
      this.reopenSubmitting = false;
    }
  }

  confirmReopen(nc: any) {
    if (!this.reopenOperator || !this.reopenDueDate || this.reopenSubmitting) return;
    this.reopenSubmitting = true;
    this.reopenError = '';

    this.ncService.assignNc(nc.id_nc, this.reopenOperator, this.reopenDueDate).subscribe({
      next: () => {
        this.ncService.transitionNc(nc.id_nc, 'ASSIGNED', {}).subscribe({
          next: () => {
            this.reopenNcId = null;
            this.reopenSubmitting = false;
            this.loadNcs();
          },
          error: (err) => {
            this.reopenSubmitting = false;
            this.reopenError = err.error?.detail || 'Re-assigned, but failed to reopen NC.';
          }
        });
      },
      error: (err) => {
        this.reopenSubmitting = false;
        this.reopenError = err.error?.detail || 'Failed to re-assign NC.';
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
    if (toState === 'ROOT_CAUSE') { this.toggleRootCauseForm(nc); return; }
    if (toState === 'CORRECTIVE_ACTION') { this.toggleCorrectiveForm(nc); return; }
    if (toState === 'REJECTED') { this.toggleRejectForm(nc); return; }
    if (toState === 'VERIFY') { this.toggleVerifyForm(nc); return; }
    if (toState === 'REOPEN') { this.toggleReopenForm(nc); return; }

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
    const op = this.operators.find(o => o.id_usr === id);
    return op ? `${op.first_name} ${op.last_name}` : (id || '—');
  }
}