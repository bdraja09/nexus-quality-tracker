import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { NcService, AuthService } from '@core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { Router } from '@angular/router';

const SEVERITY_OPTIONS = [
  { value: 'low', label: 'Faible', color: 'var(--qc-green)' },
  { value: 'medium', label: 'Moyenne', color: 'var(--qc-amber)' },
  { value: 'high', label: 'Élevée', color: 'var(--qc-red)' },
  { value: 'critical', label: 'Critique', color: 'var(--qc-purple)' }
];

const TITLE_MAX_LENGTH = 120;

@Component({
  selector: 'app-nc-form',
  standalone: true,
  imports: [
    FormsModule,
    CommonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule
  ],
  templateUrl: './nc-form.component.html',
  styleUrl: './nc-form.component.scss'
})
export class NcFormComponent {
  title = '';
  description = '';
  severity = 'medium';
  deptId = '';
  success = '';
  error = '';
  submitting = false;

  severityOptions = SEVERITY_OPTIONS;
  titleMaxLength = TITLE_MAX_LENGTH;

  constructor(private ncService: NcService, private authService: AuthService, private router: Router) { }

  get selectedSeverity() {
    return this.severityOptions.find(s => s.value === this.severity) ?? this.severityOptions[1];
  }

  onSubmit() {
    if (this.submitting) return;
    this.submitting = true;

    const user = this.authService.currentUserValue;
    this.ncService.raiseNc({
      title: this.title.trim(),
      description: this.description.trim(),
      severity: this.severity,
      dept_id: this.deptId.trim(),
      raised_by: user?.id
    }).subscribe({
      next: (nc: any) => {
        this.success = nc.ref_code;
        this.error = '';
        this.submitting = false;
        setTimeout(() => this.router.navigate(['/admin/quality/nc-list']), 1500);
      },
      error: () => {
        this.error = 'Error creating NC';
        this.success = '';
        this.submitting = false;
      }
    });
  }
}