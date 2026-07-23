import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { NcService, AuthService } from '@core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { Router } from '@angular/router';


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

  constructor(private ncService: NcService, private authService: AuthService, private router: Router) {}

  onSubmit() {
    const user = this.authService.currentUserValue;
    this.ncService.raiseNc({
      title: this.title,
      description: this.description,
      severity: this.severity,
      dept_id: this.deptId,
      raised_by: user?.id
    }).subscribe({
      next: (nc: any) => {
        this.success = nc.ref_code;
        this.error = '';
        setTimeout(() => this.router.navigate(['/admin/quality/nc-list']), 1500);
      },
      error: () => {
        this.error = 'Erreur lors de la création de la NC';
        this.success = '';
      }
    });
  }
}