import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NcService } from '@core';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { FeatherModule } from 'angular-feather';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartData } from 'chart.js';

type RagStatus = 'green' | 'amber' | 'red';

interface LifecycleStage {
  key: string;
  label: string;
  count: number;
  color: string;
  terminal?: boolean;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    RouterLink,
    FeatherModule,
    BaseChartDirective
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit {
  kpi: any = null;
  loading = true;
  lastUpdated: Date | null = null;

  // ISO 9001:2015 clause 10.2 target used across the module
  private readonly SLA_TARGET_DAYS = 5;

  // Aligned with --qc-blue / --qc-ink from the quality theme
  private readonly INK = '#1e293b';
  private readonly BLUE = '#2563eb';
  private readonly BLUE_SOFT = '#93c5fd';
  private readonly GREEN = '#16a34a';
  private readonly AMBER = '#d97706';
  private readonly RED = '#dc2626';
  private readonly PURPLE = '#7c3aed';
  private readonly SLATE = '#94a3b8';

  // ─── Avg. time-to-close RAG status (QNC-07, ISO 10.2) ───
  avgCloseStatus: RagStatus = 'green';
  avgCloseStatusLabel = 'On target';

  // ─── SLA Watch (QNC-08 — dashboard echo of the header's SLA alerts) ───
  slaAtRisk = 0;
  slaBreached = 0;

  // ─── NC lifecycle distribution (§4.3 state machine) ───
  lifecycleStages: LifecycleStage[] = [
    { key: 'RAISED', label: 'Raised', count: 0, color: this.BLUE_SOFT },
    { key: 'ASSIGNED', label: 'Assigned', count: 0, color: this.BLUE },
    { key: 'UNDER_INVESTIGATION', label: 'Under investigation', count: 0, color: this.AMBER },
    { key: 'CORRECTIVE_ACTION', label: 'Corrective action', count: 0, color: this.PURPLE },
    { key: 'CLOSED', label: 'Closed', count: 0, color: this.GREEN, terminal: true },
    { key: 'REJECTED', label: 'Rejected', count: 0, color: this.SLATE, terminal: true }
  ];

  // Monthly trend: created vs closed. Replace with the real endpoint
  // (e.g. ncService.getMonthlyTrend()) as soon as it is available on the API.
  trendChartData: ChartData<'bar' | 'line'> = {
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    datasets: [
      {
        type: 'bar',
        label: 'NCRs created',
        data: [12, 5, 8, 10, 5, 7, 11, 6, 13, 8, 10, 9],
        backgroundColor: '#e2e8f0',
        borderRadius: 3,
        barThickness: 12
      },
      {
        type: 'line',
        label: 'NCRs closed',
        data: [10, 11, 14, 17, 10, 13, 11, 15, 14, 12, 10, 13],
        borderColor: this.BLUE,
        backgroundColor: 'rgba(37, 99, 235, 0.08)',
        fill: true,
        tension: 0.35,
        borderWidth: 2,
        pointRadius: 0
      },
      {
        type: 'line',
        label: 'Avg. lead time (d)',
        data: [6, 5, 7, 5.5, 5, 4.8, 4.5, 4.9, 4.2, 4.6, 4, 3.8],
        borderColor: this.AMBER,
        backgroundColor: 'transparent',
        fill: false,
        tension: 0.35,
        borderWidth: 2,
        pointRadius: 0,
        yAxisID: 'y1'
      }
    ]
  };

  trendChartOptions: ChartConfiguration<'bar' | 'line'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          usePointStyle: true,
          font: { family: 'IBM Plex Sans', size: 11 },
          padding: 16,
          color: this.INK
        }
      }
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { family: 'IBM Plex Mono', size: 10 } } },
      y: {
        beginAtZero: true,
        grid: { color: '#f1f5f9' },
        ticks: { font: { family: 'IBM Plex Mono', size: 10 } }
      },
      y1: {
        position: 'right',
        beginAtZero: true,
        grid: { display: false },
        ticks: { font: { family: 'IBM Plex Mono', size: 10 } }
      }
    }
  };

  donutChartData: ChartData<'doughnut'> = {
    labels: ['Critical', 'High', 'Medium', 'Low'],
    datasets: [{
      data: [15, 30, 40, 15],
      backgroundColor: [this.PURPLE, this.RED, this.AMBER, this.BLUE_SOFT],
      borderWidth: 2,
      borderColor: '#ffffff'
    }]
  };

  donutChartOptions: ChartConfiguration<'doughnut'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          usePointStyle: true,
          font: { family: 'IBM Plex Sans', size: 11 },
          padding: 14,
          color: this.INK
        }
      }
    },
    cutout: '68%'
  };

  constructor(private ncService: NcService) { }

  ngOnInit(): void {
    this.loadDashboard();
  }

  refresh(): void {
    this.loadDashboard();
  }

  private loadDashboard(): void {
    this.loading = true;
    this.ncService.getKpi().subscribe({
      next: (data) => {
        this.kpi = data;

        if (data.by_severity) {
          const keys = Object.keys(data.by_severity);
          const values = Object.values(data.by_severity) as number[];
          if (keys.length > 0) {
            this.donutChartData = {
              labels: keys.map(k => this.formatLabel(k)),
              datasets: [{
                data: values,
                backgroundColor: [this.PURPLE, this.RED, this.AMBER, this.BLUE_SOFT, '#cbd5e1'],
                borderWidth: 2,
                borderColor: '#ffffff'
              }]
            };
          }
        }

        // TODO: once the API exposes a GROUP BY current_state count
        // (a natural extension of the nc_events schema in §4.4.1), replace
        // this with data.by_state instead of leaving stages at 0.
        if (data.by_state) {
          this.lifecycleStages = this.lifecycleStages.map(stage => ({
            ...stage,
            count: data.by_state[stage.key] ?? 0
          }));
        }

        // TODO: the SLA counts should come from the same /sla/alerts source
        // the header notification bell already reads (QNC-08).
        this.slaAtRisk = data.sla_at_risk ?? 0;
        this.slaBreached = data.sla_breached ?? 0;

        if (typeof data.avg_resolution_days === 'number') {
          this.avgCloseStatus = this.ragStatus(data.avg_resolution_days, this.SLA_TARGET_DAYS);
          this.avgCloseStatusLabel = this.statusLabel(this.avgCloseStatus);
        }

        this.loading = false;
        this.lastUpdated = new Date();
      },
      error: () => {
        this.loading = false;
        this.lastUpdated = new Date();
      }
    });
  }

  private ragStatus(value: number, target: number): RagStatus {
    if (value <= target) return 'green';
    if (value <= target * 1.2) return 'amber';
    return 'red';
  }

  private statusLabel(status: RagStatus): string {
    switch (status) {
      case 'green': return 'On target';
      case 'amber': return 'Attention';
      default: return 'Breached';
    }
  }

  private formatLabel(key: string): string {
    return key.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
}