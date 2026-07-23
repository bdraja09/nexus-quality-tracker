import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NcService } from '@core';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatButtonModule, RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit {
  kpi: any = null;
  loading = true;

  constructor(private ncService: NcService) {}

  ngOnInit() {
    this.ncService.getKpi().subscribe({
      next: (data) => {
        this.kpi = data;
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  get slaStatus(): string {
    return (this.kpi?.sla_breaches ?? 0) > 0 ? 'warn' : 'ok';
  }
}