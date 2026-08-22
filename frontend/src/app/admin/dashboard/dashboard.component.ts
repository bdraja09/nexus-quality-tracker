import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NcService } from '@core';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { FeatherModule } from 'angular-feather';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartData } from 'chart.js';
import { Subscription, timer } from 'rxjs';
import { switchMap } from 'rxjs/operators';

type RagStatus = 'green' | 'amber' | 'red';

interface LifecycleStage {
  key: string;
  label: string;
  count: number;
  color: string;
  terminal?: boolean;
}

interface SeverityItem {
  label: string;
  color: string;
  pct: number;
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
export class DashboardComponent implements OnInit, OnDestroy {
  kpi: any = null;
  loading = true;
  lastUpdated: Date | null = null;
  private autoRefreshSub?: Subscription;

  // ISO 9001:2015 clause 10.2 SLA target
  readonly SLA_TARGET_DAYS = 5;

  // Professional Executive Palette
  private readonly NAVY = '#1e3a8a';
  private readonly BLUE = '#2563eb';
  private readonly SLATE_DARK = '#334155';
  private readonly SLATE_MUTED = '#64748b';
  private readonly GREEN = '#16a34a';
  private readonly AMBER = '#d97706';
  private readonly RED = '#dc2626';
  private readonly INDIGO = '#4f46e5';

  // ─── Avg. resolution lead time status (QNC-07, ISO 10.2) ───
  avgCloseStatus: RagStatus = 'green';
  avgCloseStatusLabel = 'ISO 10.2 Compliant (< 5d)';

  // ─── SLA Alert Counts (QNC-08) ───
  slaAtRisk = 0;
  slaBreached = 0;

  // ─── ML Predicted Delay Risk (QNC-ML) ───
  predictedAtRisk = 0;

  // ─── Severity Summary for legend ───
  totalSeverity = 0;
  severitySummary: SeverityItem[] = [];

  // ─── NC Lifecycle Stages (§4.3 state machine) ───
  lifecycleStages: LifecycleStage[] = [
    { key: 'RAISED', label: 'Raised', count: 0, color: '#2563eb' },
    { key: 'ASSIGNED', label: 'Assigned', count: 0, color: '#4f46e5' },
    { key: 'UNDER_INVESTIGATION', label: 'Under Investigation', count: 0, color: '#d97706' },
    { key: 'CORRECTIVE_ACTION', label: 'Corrective Action', count: 0, color: '#0284c7' },
    { key: 'CLOSED', label: 'Closed', count: 0, color: '#16a34a', terminal: true },
    { key: 'REJECTED', label: 'Rejected', count: 0, color: '#64748b', terminal: true }
  ];

  // ─── 1. Grouped Bar Chart: Monthly NC Trend (Created vs Closed) ───
  trendChartData: ChartData<'bar'> = {
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    datasets: [
      {
        label: 'NCs Raised',
        data: [12, 5, 8, 10, 5, 7, 11, 6, 13, 8, 10, 9],
        backgroundColor: '#2563eb',
        hoverBackgroundColor: '#1d4ed8',
        borderRadius: 4,
        barPercentage: 0.7,
        categoryPercentage: 0.6
      },
      {
        label: 'NCs Closed',
        data: [10, 11, 14, 17, 10, 13, 11, 15, 14, 12, 10, 13],
        backgroundColor: '#16a34a',
        hoverBackgroundColor: '#15803d',
        borderRadius: 4,
        barPercentage: 0.7,
        categoryPercentage: 0.6
      }
    ]
  };

  trendChartOptions: ChartConfiguration<'bar'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        align: 'end',
        labels: {
          usePointStyle: true,
          boxWidth: 8,
          font: { family: 'Inter', size: 12, weight: 500 },
          padding: 16,
          color: '#334155'
        }
      },
      tooltip: {
        backgroundColor: '#0f172a',
        titleFont: { family: 'Inter', size: 13, weight: 600 },
        bodyFont: { family: 'Inter', size: 12 },
        padding: 12,
        cornerRadius: 8
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { font: { family: 'IBM Plex Mono', size: 11 }, color: '#64748b' }
      },
      y: {
        beginAtZero: true,
        grid: { color: '#f1f5f9' },
        ticks: { font: { family: 'IBM Plex Mono', size: 11 }, color: '#64748b', stepSize: 5 }
      }
    }
  };

  // ─── 2. Dedicated Bar Chart: Lead Time (Days) vs SLA Target ───
  leadTimeChartData: ChartData<'bar'> = {
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    datasets: [
      {
        label: 'Avg. Lead Time (Days)',
        data: [6.0, 5.0, 7.2, 5.5, 4.9, 4.8, 4.5, 4.9, 4.2, 4.6, 4.0, 3.8],
        backgroundColor: (context) => {
          const val = context.raw as number;
          return val > 5.0 ? '#dc2626' : '#d97706';
        },
        borderRadius: 4,
        barThickness: 16
      }
    ]
  };

  leadTimeChartOptions: ChartConfiguration<'bar'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#0f172a',
        callbacks: {
          label: (context) => `Avg. Lead Time: ${context.formattedValue} days (Target: < 5d)`
        }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { font: { family: 'IBM Plex Mono', size: 11 }, color: '#64748b' }
      },
      y: {
        beginAtZero: true,
        max: 10,
        grid: { color: '#f1f5f9' },
        ticks: {
          font: { family: 'IBM Plex Mono', size: 11 },
          color: '#64748b',
          callback: (value) => `${value}d`
        }
      }
    }
  };

  // ─── 3. Horizontal Bar Chart: Lifecycle Distribution (§4.3) ───
  lifecycleChartData: ChartData<'bar'> = {
    labels: ['Raised', 'Assigned', 'Investigation', 'Corrective Action', 'Closed', 'Rejected'],
    datasets: [
      {
        label: 'NC Count',
        data: [0, 0, 0, 0, 0, 0],
        backgroundColor: ['#2563eb', '#4f46e5', '#d97706', '#0284c7', '#16a34a', '#64748b'],
        borderRadius: 4,
        barThickness: 16
      }
    ]
  };

  lifecycleChartOptions: ChartConfiguration<'bar'>['options'] = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { backgroundColor: '#0f172a' }
    },
    scales: {
      x: {
        beginAtZero: true,
        grid: { color: '#f1f5f9' },
        ticks: { font: { family: 'IBM Plex Mono', size: 11 }, color: '#64748b' }
      },
      y: {
        grid: { display: false },
        ticks: { font: { family: 'Inter', size: 12, weight: 500 }, color: '#334155' }
      }
    }
  };

  // ─── 4. Doughnut Chart: Severity Breakdown (QNC-11) ───
  donutChartData: ChartData<'doughnut'> = {
    labels: ['Critical', 'High', 'Medium', 'Low'],
    datasets: [{
      data: [15, 30, 40, 15],
      backgroundColor: ['#b91c1c', '#dc2626', '#d97706', '#2563eb'],
      hoverBackgroundColor: ['#991b1b', '#b91c1c', '#b45309', '#1d4ed8'],
      borderWidth: 3,
      borderColor: '#ffffff'
    }]
  };

  donutChartOptions: ChartConfiguration<'doughnut'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#0f172a',
        titleFont: { family: 'Inter', size: 13, weight: 600 },
        bodyFont: { family: 'Inter', size: 12 },
        padding: 12,
        cornerRadius: 8
      }
    },
    cutout: '72%'
  };

  constructor(private ncService: NcService) { }

  ngOnInit(): void {
    // Start real-time auto-refresh polling every 5 seconds
    this.autoRefreshSub = timer(0, 5000).pipe(
      switchMap(() => this.ncService.getKpi())
    ).subscribe({
      next: (data) => this.processKpiData(data),
      error: (err) => {
        console.error('[Dashboard] Real-time KPI poll error:', err);
        this.loading = false;
      }
    });
  }

  refresh(): void {
    this.loading = true;
    this.ncService.getKpi().subscribe({
      next: (data) => this.processKpiData(data),
      error: () => this.loading = false
    });
  }

  private processKpiData(data: any): void {
    this.kpi = data;

    if (data.by_severity) {
      const keys = Object.keys(data.by_severity);
      const values = Object.values(data.by_severity) as number[];
      const palette = ['#b91c1c', '#dc2626', '#d97706', '#2563eb', '#64748b'];

      this.totalSeverity = values.reduce((a, b) => a + b, 0);

      if (keys.length > 0) {
        this.donutChartData = {
          labels: keys.map(k => this.formatLabel(k)),
          datasets: [{
            data: values,
            backgroundColor: palette.slice(0, keys.length),
            hoverBackgroundColor: ['#991b1b', '#b91c1c', '#b45309', '#1d4ed8', '#475569'],
            borderWidth: 3,
            borderColor: '#ffffff'
          }]
        };

        this.severitySummary = keys.map((k, i) => ({
          label: this.formatLabel(k),
          color: palette[i] || '#64748b',
          pct: this.totalSeverity > 0 ? Math.round((values[i] / this.totalSeverity) * 100) : 0
        }));
      }
    }

    if (data.by_state) {
      this.lifecycleStages = this.lifecycleStages.map(stage => ({
        ...stage,
        count: data.by_state[stage.key] ?? 0
      }));

      this.lifecycleChartData = {
        labels: this.lifecycleStages.map(s => s.label),
        datasets: [{
          label: 'NC Count',
          data: this.lifecycleStages.map(s => s.count),
          backgroundColor: this.lifecycleStages.map(s => s.color),
          borderRadius: 4,
          barThickness: 16
        }]
      };
    }

    // ─── SLA & ML Risk extraction ───────────────────────────────────────────
    this.slaAtRisk    = data.sla_at_risk ?? 0;
    this.slaBreached  = data.sla_breached ?? 0;
    this.predictedAtRisk = data.predicted_at_risk ?? 0;   // ← AJOUT

    if (typeof data.avg_resolution_days === 'number') {
      this.avgCloseStatus = this.ragStatus(data.avg_resolution_days, this.SLA_TARGET_DAYS);
      this.avgCloseStatusLabel = this.statusLabel(this.avgCloseStatus);
    }

    this.loading = false;
    this.lastUpdated = new Date();
  }

  private ragStatus(value: number, target: number): RagStatus {
    if (value <= target) return 'green';
    if (value <= target * 1.2) return 'amber';
    return 'red';
  }

  private statusLabel(status: RagStatus): string {
    switch (status) {
      case 'green': return 'ISO 10.2 Compliant (< 5d)';
      case 'amber': return 'Under Review (5-6d)';
      default: return 'Target Exceeded (> 6d)';
    }
  }

  private formatLabel(key: string): string {
    return key.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  ngOnDestroy(): void {
    this.autoRefreshSub?.unsubscribe();
  }
}