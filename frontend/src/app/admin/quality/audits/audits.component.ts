import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { FeatherModule } from 'angular-feather';

import { AuditService, Audit, AuditFinding, AuthService } from '@core';

export const DEPARTMENTS = [
  { id: 'DEPT-PROD', name: 'Production' },
  { id: 'DEPT-QUAL', name: 'Quality & Compliance' },
  { id: 'DEPT-MAINT', name: 'Maintenance & Engineering' },
  { id: 'DEPT-LOG', name: 'Logistics & Supply Chain' },
  { id: 'DEPT-RD', name: 'Research & Development' }
];

export const AUDIT_TYPES = [
  'ISO 9001:2015 Internal Audit',
  'Process & Quality Audit',
  'Supplier / Subcontractor Audit',
  'Safety & Environment Audit'
];

export const SEVERITY_OPTIONS = [
  { value: 'low', label: 'Low', color: 'var(--qc-green)' },
  { value: 'medium', label: 'Medium', color: 'var(--qc-amber)' },
  { value: 'high', label: 'High', color: 'var(--qc-red)' },
  { value: 'critical', label: 'Critical', color: 'var(--qc-purple)' }
];

@Component({
  selector: 'app-audits',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    FeatherModule
  ],
  templateUrl: './audits.component.html',
  styleUrl: './audits.component.scss'
})
export class AuditsComponent implements OnInit {
  audits: Audit[] = [];
  loading = true;
  error = '';
  successMessage = '';

  // Filter state
  statusFilter: 'ALL' | 'SCHEDULED' | 'COMPLETED' = 'ALL';
  deptFilter = 'ALL';
  searchTerm = '';

  departments = DEPARTMENTS;
  auditTypes = AUDIT_TYPES;
  severityOptions = SEVERITY_OPTIONS;

  // Schedule Audit modal
  showCreateModal = false;
  submittingAudit = false;
  createAuditForm!: FormGroup;

  // Close Audit modal
  showCompleteModal = false;
  submittingComplete = false;
  selectedAuditForComplete: Audit | null = null;
  completeFindingsText = '';

  // Add Finding modal
  showAddFindingModal = false;
  submittingFinding = false;
  selectedAuditForFinding: Audit | null = null;
  newFinding = {
    severity: 'medium',
    description: ''
  };

  // Escalate Finding modal
  showEscalateModal = false;
  submittingEscalate = false;
  selectedFindingForEscalate: AuditFinding | null = null;
  escalateTitle = '';

  // Findings cache per audit
  auditFindingsMap: { [auditId: string]: AuditFinding[] } = {};
  loadingFindingsMap: { [auditId: string]: boolean } = {};
  expandedAuditId: string | null = null;

  constructor(
    private auditService: AuditService,
    private authService: AuthService,
    private fb: FormBuilder
  ) {}

  ngOnInit(): void {
    const user = this.authService.currentUserValue;
    const defaultAuditor = (user && user.id) ? user.id : 'USR-AUDITOR-01';

    this.createAuditForm = this.fb.group({
      dept_id: ['DEPT-PROD', Validators.required],
      audit_type: ['ISO 9001:2015 Internal Audit', Validators.required],
      auditor_id: [defaultAuditor, Validators.required],
      scheduled_date: [new Date().toISOString().substring(0, 10), Validators.required]
    });

    this.loadAudits();
  }

  loadAudits(): void {
    this.loading = true;
    this.error = '';
    const dept = this.deptFilter !== 'ALL' ? this.deptFilter : undefined;

    this.auditService.listAudits(dept).subscribe({
      next: (data) => {
        this.audits = data;
        this.loading = false;
        data.forEach(a => this.loadFindingsForAudit(a.id_audit));
      },
      error: (err) => {
        this.error = 'Error loading audits: ' + (err.error?.detail || err.message);
        this.loading = false;
      }
    });
  }

  loadFindingsForAudit(auditId: string): void {
    this.loadingFindingsMap[auditId] = true;
    this.auditService.listFindings(auditId).subscribe({
      next: (findings) => {
        this.auditFindingsMap[auditId] = findings;
        this.loadingFindingsMap[auditId] = false;
      },
      error: () => {
        this.loadingFindingsMap[auditId] = false;
      }
    });
  }

  toggleExpandAudit(auditId: string): void {
    if (this.expandedAuditId === auditId) {
      this.expandedAuditId = null;
    } else {
      this.expandedAuditId = auditId;
      if (!this.auditFindingsMap[auditId]) {
        this.loadFindingsForAudit(auditId);
      }
    }
  }

  get filteredAudits(): Audit[] {
    return this.audits.filter(audit => {
      if (this.statusFilter === 'SCHEDULED' && audit.completed_date) return false;
      if (this.statusFilter === 'COMPLETED' && !audit.completed_date) return false;
      if (this.deptFilter !== 'ALL' && audit.dept_id !== this.deptFilter) return false;

      if (this.searchTerm.trim()) {
        const term = this.searchTerm.toLowerCase();
        const matchesId = audit.id_audit.toLowerCase().includes(term);
        const matchesType = audit.audit_type.toLowerCase().includes(term);
        const matchesAuditor = audit.auditor_id.toLowerCase().includes(term);
        const matchesFindings = (audit.findings || '').toLowerCase().includes(term);
        return matchesId || matchesType || matchesAuditor || matchesFindings;
      }
      return true;
    });
  }

  get totalAuditsCount(): number { return this.audits.length; }
  get scheduledCount(): number { return this.audits.filter(a => !a.completed_date).length; }
  get completedCount(): number { return this.audits.filter(a => !!a.completed_date).length; }
  get totalFindingsCount(): number {
    return Object.values(this.auditFindingsMap).reduce((acc, curr) => acc + (curr?.length || 0), 0);
  }
  get totalEscalatedNcCount(): number {
    return Object.values(this.auditFindingsMap).reduce((acc, curr) => {
      return acc + (curr ? curr.filter(f => !!f.nc_id).length : 0);
    }, 0);
  }

  getDeptName(deptId: string): string {
    const found = this.departments.find(d => d.id === deptId);
    return found ? found.name : deptId;
  }

  openCreateModal(): void {
    this.showCreateModal = true;
    const user = this.authService.currentUserValue;
    this.createAuditForm.reset({
      dept_id: 'DEPT-PROD',
      audit_type: 'ISO 9001:2015 Internal Audit',
      auditor_id: (user && user.id) ? user.id : 'USR-AUDITOR-01',
      scheduled_date: new Date().toISOString().substring(0, 10)
    });
  }

  closeCreateModal(): void {
    this.showCreateModal = false;
  }

  submitCreateAudit(): void {
    if (this.createAuditForm.invalid || this.submittingAudit) return;
    this.submittingAudit = true;
    this.error = '';

    this.auditService.createAudit(this.createAuditForm.value).subscribe({
      next: (created) => {
        this.submittingAudit = false;
        this.showCreateModal = false;
        this.successMessage = `Audit ${created.id_audit} scheduled successfully!`;
        this.loadAudits();
        setTimeout(() => this.successMessage = '', 4000);
      },
      error: (err) => {
        this.submittingAudit = false;
        this.error = 'Scheduling failed: ' + (err.error?.detail || err.message);
      }
    });
  }

  openCompleteModal(audit: Audit): void {
    this.selectedAuditForComplete = audit;
    this.completeFindingsText = audit.findings || '';
    this.showCompleteModal = true;
  }

  closeCompleteModal(): void {
    this.showCompleteModal = false;
    this.selectedAuditForComplete = null;
  }

  submitCompleteAudit(): void {
    if (!this.selectedAuditForComplete || this.submittingComplete) return;
    this.submittingComplete = true;

    this.auditService.completeAudit(
      this.selectedAuditForComplete.id_audit,
      this.completeFindingsText.trim()
    ).subscribe({
      next: () => {
        this.submittingComplete = false;
        this.showCompleteModal = false;
        this.successMessage = `Audit ${this.selectedAuditForComplete?.id_audit} marked as closed.`;
        this.selectedAuditForComplete = null;
        this.loadAudits();
        setTimeout(() => this.successMessage = '', 4000);
      },
      error: (err) => {
        this.submittingComplete = false;
        this.error = 'Error closing audit: ' + (err.error?.detail || err.message);
      }
    });
  }

  openAddFindingModal(audit: Audit): void {
    this.selectedAuditForFinding = audit;
    this.newFinding = { severity: 'medium', description: '' };
    this.showAddFindingModal = true;
  }

  closeAddFindingModal(): void {
    this.showAddFindingModal = false;
    this.selectedAuditForFinding = null;
  }

  submitAddFinding(): void {
    if (!this.selectedAuditForFinding || !this.newFinding.description.trim() || this.submittingFinding) return;
    this.submittingFinding = true;

    const auditId = this.selectedAuditForFinding.id_audit;
    this.auditService.addFinding(auditId, {
      severity: this.newFinding.severity,
      description: this.newFinding.description.trim()
    }).subscribe({
      next: (finding) => {
        this.submittingFinding = false;
        this.showAddFindingModal = false;
        this.successMessage = `Audit finding (${finding.id_finding}) added successfully!`;
        this.loadFindingsForAudit(auditId);
        this.expandedAuditId = auditId;
        this.selectedAuditForFinding = null;
        setTimeout(() => this.successMessage = '', 4000);
      },
      error: (err) => {
        this.submittingFinding = false;
        this.error = 'Error adding finding: ' + (err.error?.detail || err.message);
      }
    });
  }

  openEscalateModal(finding: AuditFinding): void {
    this.selectedFindingForEscalate = finding;
    this.escalateTitle = `Non-conformity following audit finding ${finding.id_finding}`;
    this.showEscalateModal = true;
  }

  closeEscalateModal(): void {
    this.showEscalateModal = false;
    this.selectedFindingForEscalate = null;
  }

  submitEscalateFinding(): void {
    if (!this.selectedFindingForEscalate || !this.escalateTitle.trim() || this.submittingEscalate) return;
    this.submittingEscalate = true;

    const finding = this.selectedFindingForEscalate;
    this.auditService.escalateFindingToNc(finding.id_finding, this.escalateTitle.trim()).subscribe({
      next: (nc) => {
        this.submittingEscalate = false;
        this.showEscalateModal = false;
        this.successMessage = `Finding ${finding.id_finding} escalated to Non-Conformity ${nc.ref_code || nc.id_nc}!`;
        this.loadFindingsForAudit(finding.audit_id);
        this.selectedFindingForEscalate = null;
        setTimeout(() => this.successMessage = '', 5000);
      },
      error: (err) => {
        this.submittingEscalate = false;
        this.error = 'NC escalation failed: ' + (err.error?.detail || err.message);
      }
    });
  }

  dismissError(): void { this.error = ''; }
  dismissSuccess(): void { this.successMessage = ''; }
}