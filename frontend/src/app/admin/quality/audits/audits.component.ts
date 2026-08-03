import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { FeatherModule } from 'angular-feather';

import { AuditService, Audit, AuditFinding, AuthService } from '@core';

export const DEPARTMENTS = [
  { id: 'DEPT-PROD', name: 'Production' },
  { id: 'DEPT-QUAL', name: 'Qualité & Conformité' },
  { id: 'DEPT-MAINT', name: 'Maintenance & Ingénierie' },
  { id: 'DEPT-LOG', name: 'Logistique & Supply Chain' },
  { id: 'DEPT-RD', name: 'Recherche & Développement' }
];

export const AUDIT_TYPES = [
  'ISO 9001:2015 Audit Interne',
  'Audit Procédé & Qualité',
  'Audit Fournisseur / Sous-traitant',
  'Audit Sécurité & Environnement'
];

export const SEVERITY_OPTIONS = [
  { value: 'low', label: 'Faible', color: 'var(--qc-green)' },
  { value: 'medium', label: 'Moyenne', color: 'var(--qc-amber)' },
  { value: 'high', label: 'Élevée', color: 'var(--qc-red)' },
  { value: 'critical', label: 'Critique', color: 'var(--qc-purple)' }
];

@Component({
  selector: 'app-audits',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
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

  // Audit creation modal
  showCreateModal = false;
  submittingAudit = false;
  newAudit = {
    dept_id: 'DEPT-PROD',
    auditor_id: '',
    audit_type: 'ISO 9001:2015 Audit Interne',
    scheduled_date: new Date().toISOString().substring(0, 10)
  };

  // Complete Audit modal
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
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    const user = this.authService.currentUserValue;
    if (user && user.id) {
      this.newAudit.auditor_id = user.id;
    } else {
      this.newAudit.auditor_id = 'USR-AUDITOR-01';
    }
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
        // Pre-fetch findings for audits
        data.forEach(a => this.loadFindingsForAudit(a.id_audit));
      },
      error: (err) => {
        this.error = 'Erreur lors du chargement des audits: ' + (err.error?.detail || err.message);
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
      // Status filter
      if (this.statusFilter === 'SCHEDULED' && audit.completed_date) return false;
      if (this.statusFilter === 'COMPLETED' && !audit.completed_date) return false;

      // Dept filter
      if (this.deptFilter !== 'ALL' && audit.dept_id !== this.deptFilter) return false;

      // Search term
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

  // Counters
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

  // Modal actions - Create Audit
  openCreateModal(): void {
    this.showCreateModal = true;
  }
  closeCreateModal(): void {
    this.showCreateModal = false;
  }
  submitCreateAudit(): void {
    if (this.submittingAudit) return;
    this.submittingAudit = true;
    this.error = '';

    this.auditService.createAudit({
      dept_id: this.newAudit.dept_id,
      auditor_id: this.newAudit.auditor_id,
      audit_type: this.newAudit.audit_type,
      scheduled_date: this.newAudit.scheduled_date
    }).subscribe({
      next: (created) => {
        this.submittingAudit = false;
        this.showCreateModal = false;
        this.successMessage = `Audit ${created.id_audit} planifié avec succès!`;
        this.loadAudits();
        setTimeout(() => this.successMessage = '', 4000);
      },
      error: (err) => {
        this.submittingAudit = false;
        this.error = 'Échec de la planification: ' + (err.error?.detail || err.message);
      }
    });
  }

  // Modal actions - Complete Audit
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
        this.successMessage = `Audit ${this.selectedAuditForComplete?.id_audit} marqué comme clôturé.`;
        this.selectedAuditForComplete = null;
        this.loadAudits();
        setTimeout(() => this.successMessage = '', 4000);
      },
      error: (err) => {
        this.submittingComplete = false;
        this.error = 'Erreur lors de la clôture de l’audit: ' + (err.error?.detail || err.message);
      }
    });
  }

  // Modal actions - Add Finding
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
        this.successMessage = `Constat d'audit (${finding.id_finding}) ajouté avec succès!`;
        this.loadFindingsForAudit(auditId);
        this.expandedAuditId = auditId;
        this.selectedAuditForFinding = null;
        setTimeout(() => this.successMessage = '', 4000);
      },
      error: (err) => {
        this.submittingFinding = false;
        this.error = 'Erreur lors de l’ajout du constat: ' + (err.error?.detail || err.message);
      }
    });
  }

  // Modal actions - Escalate Finding to NC
  openEscalateModal(finding: AuditFinding): void {
    this.selectedFindingForEscalate = finding;
    this.escalateTitle = `Non-conformité suite à constat audit ${finding.id_finding}`;
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
        this.successMessage = `Constat ${finding.id_finding} escaladé en Non-Conformité ${nc.ref_code || nc.id_nc}!`;
        this.loadFindingsForAudit(finding.audit_id);
        this.selectedFindingForEscalate = null;
        setTimeout(() => this.successMessage = '', 5000);
      },
      error: (err) => {
        this.submittingEscalate = false;
        this.error = 'Échec de l’escalade en NC: ' + (err.error?.detail || err.message);
      }
    });
  }

  dismissError(): void { this.error = ''; }
  dismissSuccess(): void { this.successMessage = ''; }
}
