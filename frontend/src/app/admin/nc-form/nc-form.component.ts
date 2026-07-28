import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { NcService } from '../core/services/nc.service';
import { AuthService } from '../core/services/auth.service';

@Component({
  selector: 'app-nc-form',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './nc-form.component.html',
  styleUrls: ['./nc-form.component.scss']
})
export class NcFormComponent {
  title = '';
  description = '';
  severity = 'medium';
  deptId = '';
  success = '';
  error = '';

  constructor(private ncService: NcService, private authService: AuthService) {}

  onSubmit() {
    const user = this.authService.getUser();
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
      },
      error: (err) => {
        this.error = 'Erreur lors de la création de la NC';
        this.success = '';
      }
    });
  }
}