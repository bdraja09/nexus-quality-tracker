import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { NcService, AuthService } from '@core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { FeatherModule } from 'angular-feather';
import { Router, RouterLink } from '@angular/router';

interface SeverityOption {
  value: 'low' | 'medium' | 'high' | 'critical';
  label: string;
  description: string;
}

const SEVERITY_OPTIONS: SeverityOption[] = [
  { value: 'low', label: 'Low', description: 'Cosmetic or minor issue, no operational impact.' },
  { value: 'medium', label: 'Medium', description: 'Needs attention, no immediate risk.' },
  { value: 'high', label: 'High', description: 'Operational impact — prioritise this week.' },
  { value: 'critical', label: 'Critical', description: 'Safety or compliance risk — act immediately.' }
];

const TITLE_MAX_LENGTH = 120;
const MAX_FILE_SIZE_MB = 10;
const MAX_FILES = 5;
const ACCEPTED_TYPES = '.jpg,.jpeg,.png,.pdf,.doc,.docx';

@Component({
  selector: 'app-nc-form',
  standalone: true,
  imports: [
    FormsModule,
    CommonModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    FeatherModule,
    RouterLink
  ],
  templateUrl: './nc-form.component.html',
  styleUrl: './nc-form.component.scss'
})
export class NcFormComponent {
  title = '';
  description = '';
  severity: SeverityOption['value'] = 'medium';
  deptId = '';
  success = '';
  error = '';
  submitting = false;

  severityOptions = SEVERITY_OPTIONS;
  titleMaxLength = TITLE_MAX_LENGTH;
  acceptedTypes = ACCEPTED_TYPES;
  maxFileSizeMb = MAX_FILE_SIZE_MB;
  maxFiles = MAX_FILES;

  // ─── Evidence attachments (QNC-01) ───
  selectedFiles: File[] = [];
  fileError = '';
  isDraggingOver = false;

  constructor(
    private ncService: NcService,
    private authService: AuthService,
    private router: Router
  ) {}

  get selectedSeverityOption(): SeverityOption {
    return this.severityOptions.find(s => s.value === this.severity) ?? this.severityOptions[1];
  }

  selectSeverity(value: SeverityOption['value']): void {
    this.severity = value;
  }

  // ─── Evidence handling ───
  onFilesPicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      this.addFiles(Array.from(input.files));
      input.value = ''; // allow re-selecting the same file afterwards
    }
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDraggingOver = false;
    if (event.dataTransfer?.files) {
      this.addFiles(Array.from(event.dataTransfer.files));
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDraggingOver = true;
  }

  onDragLeave(): void {
    this.isDraggingOver = false;
  }

  private addFiles(files: File[]): void {
    this.fileError = '';

    if (this.selectedFiles.length + files.length > this.maxFiles) {
      this.fileError = `You can attach up to ${this.maxFiles} files.`;
      return;
    }

    for (const file of files) {
      if (file.size > this.maxFileSizeMb * 1024 * 1024) {
        this.fileError = `"${file.name}" exceeds the ${this.maxFileSizeMb} MB limit.`;
        continue;
      }
      this.selectedFiles.push(file);
    }
  }

  removeFile(index: number): void {
    this.selectedFiles.splice(index, 1);
    this.fileError = '';
  }

  fileIcon(file: File): string {
    if (file.type.startsWith('image/')) return 'image';
    if (file.type === 'application/pdf') return 'file-text';
    return 'file';
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  onSubmit(): void {
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
        this.uploadEvidenceIfAny(nc.id_nc);
      },
      error: () => {
        this.error = 'Something went wrong while creating the non-conformance. Please try again.';
        this.success = '';
        this.submitting = false;
      }
    });
  }

  // TODO: assumes NcService exposes `uploadEvidence(ncId, files)` against a
  // multipart endpoint (e.g. POST /nc/{id}/evidence). The schema in §4.4.1
  // doesn't yet define storage for attachments — that needs a backend
  // decision (a dedicated `evidence` table, or URLs on `non_conformances`)
  // before this call does anything server-side. Until then, it degrades
  // gracefully: the NC is still created even if this step isn't wired up.
  private uploadEvidenceIfAny(ncId: string): void {
    if (this.selectedFiles.length === 0 || !(this.ncService as any).uploadEvidence) {
      this.submitting = false;
      setTimeout(() => this.router.navigate(['/admin/quality/nc-list']), 1500);
      return;
    }

    (this.ncService as any).uploadEvidence(ncId, this.selectedFiles).subscribe({
      next: () => {
        this.submitting = false;
        setTimeout(() => this.router.navigate(['/admin/quality/nc-list']), 1500);
      },
      error: () => {
        this.submitting = false;
        this.error = 'The NC was created, but evidence upload failed. You can attach files later from the register.';
        setTimeout(() => this.router.navigate(['/admin/quality/nc-list']), 2200);
      }
    });
  }
}