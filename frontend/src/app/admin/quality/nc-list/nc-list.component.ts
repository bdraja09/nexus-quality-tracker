import { Component, OnInit, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NcService, AuthService, Role } from '@core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { FeatherModule } from 'angular-feather';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';

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
export class NcListComponent implements OnInit, OnDestroy {
  ncs: any[] = [];
  operators: any[] = [];
  loading = true;

  rootCauseCategories = ROOT_CAUSE_CATEGORIES;

  listError = '';

  // ── Highlight from Notification / Direct Link ──
  highlightedNcId: string | null = null;
  private querySub?: Subscription;

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

  // ── Search & Additional Filters ──
  searchQuery = '';
  severityFilter = 'ALL';
  severityFilters = [
    { value: 'ALL', label: 'All Severities' },
    { value: 'LOW', label: 'Low' },
    { value: 'MEDIUM', label: 'Medium' },
    { value: 'HIGH', label: 'High' },
    { value: 'CRITICAL', label: 'Critical' }
  ];

  assignedToFilter = 'ALL';
  riskFilter = 'ALL'; // 'ALL' | 'RISK_ONLY' | 'NO_RISK'
  sortBy = 'date_desc'; // 'date_desc' | 'date_asc' | 'severity_desc' | 'severity_asc' | 'ref_asc' | 'ref_desc'

  // ── Pagination & Display Count (Choice of page size, 50 by default) ──
  pageSize = 50;
  pageSizeOptions = [10, 25, 50, 100, 200, 0]; // 0 = All
  currentPage = 1;

  // ── Export ML ──
  downloading = false;
  downloadError = '';

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
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef
  ) { }

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
    let list = [...this.ncs];

    // 1. State Filter
    if (this.stateFilter !== 'ALL') {
      list = list.filter(nc => nc.current_state === this.stateFilter);
    }

    // 2. Severity Filter
    if (this.severityFilter !== 'ALL') {
      list = list.filter(nc => (nc.severity || '').toUpperCase() === this.severityFilter.toUpperCase());
    }

    // 3. Assigned Operator Filter
    if (this.assignedToFilter !== 'ALL') {
      if (this.assignedToFilter === 'UNASSIGNED') {
        list = list.filter(nc => !nc.assigned_to);
      } else {
        list = list.filter(nc => nc.assigned_to === this.assignedToFilter);
      }
    }

    // 4. Risk Filter
    if (this.riskFilter === 'RISK_ONLY') {
      list = list.filter(nc => nc.predicted_delay_risk && !this.isTerminalState(nc.current_state));
    } else if (this.riskFilter === 'NO_RISK') {
      list = list.filter(nc => !nc.predicted_delay_risk || this.isTerminalState(nc.current_state));
    }

    // 5. Search Query
    if (this.searchQuery && this.searchQuery.trim()) {
      const q = this.searchQuery.trim().toLowerCase();
      list = list.filter(nc => {
        const refCode = (nc.ref_code || '').toLowerCase();
        const title = (nc.title || '').toLowerCase();
        const desc = (nc.description || nc.details || '').toLowerCase();
        const opName = this.operatorName(nc.assigned_to).toLowerCase();
        const severity = (nc.severity || '').toLowerCase();
        const state = (nc.current_state || '').toLowerCase();
        const stateLbl = this.stateLabel(nc.current_state).toLowerCase();
        const rootCause = (nc.root_cause_description || nc.root_cause || '').toLowerCase();
        const corrective = (nc.corrective_action_description || nc.action_description || '').toLowerCase();

        return refCode.includes(q) ||
          title.includes(q) ||
          desc.includes(q) ||
          opName.includes(q) ||
          severity.includes(q) ||
          state.includes(q) ||
          stateLbl.includes(q) ||
          rootCause.includes(q) ||
          corrective.includes(q);
      });
    }

    // 6. Sorting
    const severityWeight: Record<string, number> = {
      CRITICAL: 4,
      HIGH: 3,
      MEDIUM: 2,
      LOW: 1
    };

    list.sort((a, b) => {
      switch (this.sortBy) {
        case 'date_asc':
          return new Date(a.raised_at || 0).getTime() - new Date(b.raised_at || 0).getTime();
        case 'date_desc':
          return new Date(b.raised_at || 0).getTime() - new Date(a.raised_at || 0).getTime();
        case 'severity_desc': {
          const wA = severityWeight[(a.severity || '').toUpperCase()] || 0;
          const wB = severityWeight[(b.severity || '').toUpperCase()] || 0;
          return wB - wA;
        }
        case 'severity_asc': {
          const wA = severityWeight[(a.severity || '').toUpperCase()] || 0;
          const wB = severityWeight[(b.severity || '').toUpperCase()] || 0;
          return wA - wB;
        }
        case 'ref_asc':
          return (a.ref_code || '').localeCompare(b.ref_code || '');
        case 'ref_desc':
          return (b.ref_code || '').localeCompare(a.ref_code || '');
        default:
          return new Date(b.raised_at || 0).getTime() - new Date(a.raised_at || 0).getTime();
      }
    });

    return list;
  }

  get totalItems(): number {
    return this.filteredNcs.length;
  }

  get totalPages(): number {
    if (this.pageSize === 0 || this.totalItems === 0) return 1;
    return Math.ceil(this.totalItems / this.pageSize);
  }

  get visibleNcs(): any[] {
    if (this.pageSize === 0) {
      return this.filteredNcs;
    }
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredNcs.slice(start, start + this.pageSize);
  }

  get startIndex(): number {
    if (this.totalItems === 0) return 0;
    return (this.currentPage - 1) * this.pageSize + 1;
  }

  get endIndex(): number {
    if (this.pageSize === 0) return this.totalItems;
    return Math.min(this.currentPage * this.pageSize, this.totalItems);
  }

  get pageNumbers(): (number | string)[] {
    const total = this.totalPages;
    const current = this.currentPage;
    if (total <= 7) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }
    const pages: (number | string)[] = [];
    if (current <= 4) {
      pages.push(1, 2, 3, 4, 5, '...', total);
    } else if (current >= total - 3) {
      pages.push(1, '...', total - 4, total - 3, total - 2, total - 1, total);
    } else {
      pages.push(1, '...', current - 1, current, current + 1, '...', total);
    }
    return pages;
  }

  get stateCounts(): Record<string, number> {
    const counts: Record<string, number> = { ALL: this.ncs.length };
    for (const nc of this.ncs) {
      counts[nc.current_state] = (counts[nc.current_state] || 0) + 1;
    }
    return counts;
  }

  get isAnyFilterActive(): boolean {
    return this.searchQuery.trim().length > 0 ||
      this.stateFilter !== 'ALL' ||
      this.severityFilter !== 'ALL' ||
      this.assignedToFilter !== 'ALL' ||
      this.riskFilter !== 'ALL' ||
      this.sortBy !== 'date_desc';
  }

  get activeFilterCount(): number {
    let count = 0;
    if (this.searchQuery.trim().length > 0) count++;
    if (this.stateFilter !== 'ALL') count++;
    if (this.severityFilter !== 'ALL') count++;
    if (this.assignedToFilter !== 'ALL') count++;
    if (this.riskFilter !== 'ALL') count++;
    if (this.sortBy !== 'date_desc') count++;
    return count;
  }

  ngOnInit() {
    this.loadNcs();

    if (this.userRole === Role.Manager || this.userRole === Role.Operator) {
      this.ncService.getOperators().subscribe({
        next: (data) => this.operators = data,
        error: () => { }
      });
    }

    this.querySub = this.route.queryParams.subscribe(params => {
      const highlight = params['highlight'] || params['id'] || params['nc_id'];
      const filter = params['filter'];

      if (filter === 'sla') {
        this.riskFilter = 'RISK_ONLY';
        this.currentPage = 1;
      }

      if (highlight) {
        this.highlightedNcId = highlight;
        if (this.ncs.length > 0) {
          this.focusHighlightedNc();
        }
      }
    });
  }

  loadNcs() {
    this.loading = true;
    this.ncService.getNcs().subscribe({
      next: (data) => {
        this.ncs = data;
        this.loading = false;

        if (this.highlightedNcId) {
          this.focusHighlightedNc();
        } else if (this.currentPage > this.totalPages) {
          this.currentPage = Math.max(1, this.totalPages);
        }
        this.cdr.markForCheck();
      },
      error: () => {
        this.listError = 'Something went wrong while loading non-conformances.';
        this.loading = false;
        this.cdr.markForCheck();
      }
    });
  }

  focusHighlightedNc(): void {
    if (!this.highlightedNcId || this.ncs.length === 0) return;
    const target = this.highlightedNcId.trim().toLowerCase();

    const foundNc = this.ncs.find(nc => {
      const id = (nc.id_nc || '').toLowerCase();
      const ref = (nc.ref_code || '').toLowerCase();
      return id === target || ref === target || id.includes(target) || ref.includes(target);
    });

    if (foundNc) {
      // Ensure target NC is not hidden by active filters
      if (this.stateFilter !== 'ALL' && this.stateFilter !== foundNc.current_state) {
        this.stateFilter = 'ALL';
      }
      if (this.severityFilter !== 'ALL' && (foundNc.severity || '').toUpperCase() !== this.severityFilter.toUpperCase()) {
        this.severityFilter = 'ALL';
      }
      if (this.assignedToFilter !== 'ALL' && foundNc.assigned_to !== this.assignedToFilter) {
        this.assignedToFilter = 'ALL';
      }
      if (this.searchQuery) {
        this.searchQuery = '';
      }

      // Compute which page contains this NC
      const filtered = this.filteredNcs;
      const index = filtered.findIndex(nc => nc.id_nc === foundNc.id_nc);
      if (index !== -1 && this.pageSize > 0) {
        this.currentPage = Math.floor(index / this.pageSize) + 1;
      }

      this.cdr.detectChanges();

      // Scroll smoothly to target NC
      setTimeout(() => {
        const el = document.getElementById('nc-card-' + foundNc.id_nc);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 250);
    }
  }

  isNcHighlighted(nc: any): boolean {
    if (!this.highlightedNcId) return false;
    const target = this.highlightedNcId.trim().toLowerCase();
    const id = (nc.id_nc || '').toLowerCase();
    const ref = (nc.ref_code || '').toLowerCase();
    return id === target || ref === target || id.includes(target) || ref.includes(target);
  }

  ngOnDestroy(): void {
    this.querySub?.unsubscribe();
  }

  setStateFilter(value: string): void {
    this.stateFilter = value;
    this.currentPage = 1;
  }

  onFilterChange(): void {
    this.currentPage = 1;
  }

  onPageSizeChange(newSize: any): void {
    this.pageSize = Number(newSize);
    this.currentPage = 1;
  }

  setPage(page: number | string): void {
    if (typeof page !== 'number') return;
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
    }
  }

  prevPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
    }
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.currentPage = 1;
  }

  resetFilters(): void {
    this.searchQuery = '';
    this.stateFilter = 'ALL';
    this.severityFilter = 'ALL';
    this.assignedToFilter = 'ALL';
    this.riskFilter = 'ALL';
    this.sortBy = 'date_desc';
    this.currentPage = 1;
  }

  dismissListError(): void {
    this.listError = '';
  }

  // ── Export ML Dataset ──
  exportMlDataset(): void {
    this.downloading = true;
    this.downloadError = '';
    this.ncService.downloadMlDataset().subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `nc_ml_dataset_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        this.downloading = false;
      },
      error: (err) => {
        this.downloadError = 'Failed to export ML dataset.';
        this.downloading = false;
        console.error('[Export ML]', err);
      }
    });
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
        console.log('[NC Detail] loaded:', detail);
        this.ncDetailMap[ncId] = detail;
        this.loadingDetailMap[ncId] = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('[NC Detail] error:', err);
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

    this.ncService.transitionNc(nc.id_nc, 'UNDER_INVESTIGATION', {
      assigned_to: this.verifyReassignTo,
      due_date: this.verifyDueDate,
      notes: this.verifyRejectReason.trim()
    }).subscribe({
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

    this.ncService.reopenNc(nc.id_nc, this.reopenOperator, this.reopenDueDate).subscribe({
      next: () => {
        this.reopenNcId = null;
        this.reopenSubmitting = false;
        this.loadNcs();
      },
      error: (err) => {
        this.reopenSubmitting = false;
        this.reopenError = err.error?.detail || 'Failed to reopen NC. Add endpoint POST /ncs/{id}/reopen on backend.';
        this.loadNcs();
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

  isTerminalState(state: string): boolean {
    return state === 'CLOSED' || state === 'REJECTED';
  }
}