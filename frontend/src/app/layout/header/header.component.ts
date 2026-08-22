import { DOCUMENT, NgClass } from '@angular/common';
import {
  Component,
  Inject,
  ElementRef,
  OnInit,
  OnDestroy,
  Renderer2,
  NgZone,
  ChangeDetectorRef,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ConfigService } from '@config';
import { UnsubscribeOnDestroyAdapter } from '@shared';
import { LanguageService, InConfiguration, AuthService } from '@core';
import { NgScrollbar } from 'ngx-scrollbar';
import { MatMenuModule } from '@angular/material/menu';
import { FeatherIconsComponent } from '@shared/components/feather-icons/feather-icons.component';
import { MatButtonModule } from '@angular/material/button';
import { HttpClient } from '@angular/common/http';
import { trigger, state, style, transition, animate } from '@angular/animations';

/* ─── SLA ─── */
interface SlaAlert {
  id: number;
  nc_id: string;
  alert_type: 'WARNING' | 'BREACHED';
  created_at: string;
  resolved_at: string | null;
  is_read: boolean;
}

interface SlaAlertView extends SlaAlert {
  message: string;
  time: string;
  color: 'nfc-red' | 'nfc-orange';
}

/* ─── Workflow Notifications ─── */
interface WorkflowNotification {
  id: number;
  nc_id: string | null;
  ref_code: string | null;
  type: string;
  title: string;
  message: string;
  reason: string | null;
  is_read: boolean;
  created_at: string;
}

interface WorkflowNotificationView extends WorkflowNotification {
  time: string;
  icon: string;
  iconColor: string;
  bgColor: string;
}

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
  imports: [
    RouterLink,
    NgClass,
    FormsModule,
    MatButtonModule,
    FeatherIconsComponent,
    MatMenuModule,
    NgScrollbar,
  ],
  animations: [
    trigger('badgePop', [
      transition(':increment', [
        style({ transform: 'scale(1.4)' }),
        animate('200ms ease-out', style({ transform: 'scale(1)' }))
      ]),
      transition(':decrement', [
        style({ transform: 'scale(0.8)' }),
        animate('200ms ease-out', style({ transform: 'scale(1)' }))
      ])
    ])
  ]
})
export class HeaderComponent extends UnsubscribeOnDestroyAdapter implements OnInit, OnDestroy {
  public config!: InConfiguration;
  userName = '';
  userInitials = '';
  currentUserId = '';
  homePage?: string;
  isNavbarCollapsed = true;
  flagvalue: string | string[] | undefined;
  countryName: string | string[] = [];
  langStoreValue?: string;
  defaultFlag?: string;
  isOpenSidebar?: boolean;
  docElement?: HTMLElement;
  isFullScreen = false;

  // ─── SLA ───
  slaAlerts: SlaAlertView[] = [];
  unreadCount = 0;
  confirmingDismissId: number | null = null;
  recentlyDismissedId: number | null = null;
  sortOrder: 'newest' | 'oldest' | 'breached-first' | 'warning-first' = 'newest';

  // ─── Workflow Notifications ───
  workflowNotifications: WorkflowNotificationView[] = [];
  workflowUnreadCount = 0;
  wfConfirmingDismissId: number | null = null;
  wfRecentlyDismissedId: number | null = null;

  private readonly API = 'http://localhost:8000';
  private eventSource?: EventSource;
  private undoTimeoutHandle?: ReturnType<typeof setTimeout>;
  private wfUndoTimeoutHandle?: ReturnType<typeof setTimeout>;

  get hasBreachedNotification(): boolean {
    return this.slaAlerts.some(a => a.alert_type === 'BREACHED' && !a.resolved_at && !a.is_read);
  }

  constructor(
    @Inject(DOCUMENT) private document: Document,
    private renderer: Renderer2,
    public elementRef: ElementRef,
    private configService: ConfigService,
    private authService: AuthService,
    private router: Router,
    public languageService: LanguageService,
    private http: HttpClient,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef
  ) {
    super();
  }

  listLang = [
    { text: 'English', flag: 'assets/images/flags/us.jpg', lang: 'en' },
    { text: 'Spanish', flag: 'assets/images/flags/spain.jpg', lang: 'es' },
    { text: 'German', flag: 'assets/images/flags/germany.jpg', lang: 'de' },
  ];

  ngOnInit() {
    this.config = this.configService.configData;
    const user = this.authService.currentUserValue;
    const userRole = user?.role;

    // ← ESSENTIEL : récupère l'ID utilisateur (id ou id_usr selon ton backend)
    this.currentUserId = user?.id || user?.id_usr || user?.sub || '';
    this.userName = user ? `${user.first_name} ${user.last_name}` : 'User';
    this.userInitials = user
      ? `${user.first_name?.[0] || ''}${user.last_name?.[0] || ''}`.toUpperCase()
      : '?';

    this.docElement = document.documentElement;

    if (userRole === 'Admin') {
      this.homePage = 'admin/dashboard/main';
    } else if (userRole === 'Client') {
      this.homePage = 'client/dashboard';
    } else if (userRole === 'Employee') {
      this.homePage = 'employee/dashboard';
    } else if (userRole === 'Manager' || userRole === 'Operator' || userRole === 'Auditor') {
      this.homePage = 'admin/quality/dashboard';
    } else {
      this.homePage = 'admin/dashboard/main';
    }

    this.langStoreValue = localStorage.getItem('lang') as string;
    const val = this.listLang.filter((x) => x.lang === this.langStoreValue);
    this.countryName = val.map((element) => element.text);
    if (val.length === 0) {
      if (this.flagvalue === undefined) {
        this.defaultFlag = 'assets/images/flags/us.jpg';
      }
    } else {
      this.flagvalue = val.map((element) => element.flag);
    }

    this.refreshAlerts();
    this.refreshWorkflowNotifications();
    this.connectToSlaStream();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  SSE — temps réel SLA + Workflow
  // ═══════════════════════════════════════════════════════════════════════════

  private connectToSlaStream(): void {
    this.eventSource = new EventSource(`${this.API}/sla/stream`);
    this.eventSource.onmessage = (event) => {
      this.ngZone.run(() => {
        try {
          const data = JSON.parse(event.data);
          console.log('[SSE] received:', data.event, data); // DEBUG

          if (data.event === 'sla_alert' || data.event === 'sla_resolved') {
            this.refreshAlerts();
          }

          // ← PAS DE FILTRE recipient_id ici : le backend filtre déjà dans l'API
          if (data.event === 'workflow_notification') {
            console.log('[SSE] workflow notif received, refreshing...');
            this.refreshWorkflowNotifications();
          }
        } catch (e) {
          console.error('[SSE] invalid payload:', e);
        }
      });
    };
    this.eventSource.onerror = () => {
      console.warn('[SSE] connection lost, reconnecting...');
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  SLA
  // ═══════════════════════════════════════════════════════════════════════════

  private refreshAlerts(): void {
    this.loadAlerts();
    this.loadUnreadCount();
  }

  private loadAlerts(): void {
    this.http.get<{ alerts: SlaAlert[] }>(`${this.API}/sla/alerts`).subscribe({
      next: (data) => {
        const mapped = (data.alerts || []).map((a) => this.toSlaView(a));
        this.slaAlerts = this.applySort(mapped);
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('[SLA] loadAlerts error:', err);
        this.slaAlerts = [];
        this.cdr.markForCheck();
      }
    });
  }

  private loadUnreadCount(): void {
    this.http.get<{ count: number }>(`${this.API}/sla/alerts/unread-count`).subscribe({
      next: (data) => {
        this.unreadCount = data.count;
        this.cdr.markForCheck();
      },
      error: (err) => console.error('[SLA] unread-count error:', err)
    });
  }

  private toSlaView(a: SlaAlert): SlaAlertView {
    return {
      ...a,
      message: a.alert_type === 'BREACHED'
        ? `NC ${a.nc_id} has breached the 5-day ISO 10.2 SLA — immediate action required`
        : `NC ${a.nc_id} is approaching its SLA deadline — due within 24h`,
      time: this.timeAgo(new Date(a.created_at)),
      color: a.alert_type === 'BREACHED' ? 'nfc-red' : 'nfc-orange'
    };
  }

  private applySort(alerts: SlaAlertView[]): SlaAlertView[] {
    return [...alerts].sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();

      switch (this.sortOrder) {
        case 'newest':
          return dateB - dateA;
        case 'oldest':
          return dateA - dateB;
        case 'breached-first':
          if (a.alert_type === b.alert_type) return dateB - dateA;
          return a.alert_type === 'BREACHED' ? -1 : 1;
        case 'warning-first':
          if (a.alert_type === b.alert_type) return dateB - dateA;
          return a.alert_type === 'WARNING' ? -1 : 1;
        default:
          return dateB - dateA;
      }
    });
  }

  onSortChange(): void {
    this.slaAlerts = this.applySort(this.slaAlerts);
    this.cdr.markForCheck();
  }

  markAllAsRead(): void {
    if (this.unreadCount === 0) return;
    this.http.post(`${this.API}/sla/alerts/read-all`, {}).subscribe({
      next: () => {
        this.slaAlerts = this.slaAlerts.map(a => ({ ...a, is_read: true }));
        this.unreadCount = 0;
        this.cdr.markForCheck();
      },
      error: (err) => console.error('[SLA] read-all error:', err)
    });
  }

  onNotificationClick(alert: SlaAlertView): void {
    if (!alert.is_read) {
      this.http.patch(`${this.API}/sla/alerts/${alert.id}/read`, {}).subscribe({
        next: () => {
          alert.is_read = true;
          this.unreadCount = Math.max(0, this.unreadCount - 1);
          this.cdr.markForCheck();
        },
        error: (err) => console.error('[SLA] patch read error:', err)
      });
    }
    this.router.navigate(['/admin/quality/nc-list'], {
      queryParams: { highlight: alert.nc_id }
    });
  }

  dismissAlert(event: Event, alert: SlaAlertView): void {
    event.stopPropagation();
    const isActive = !alert.resolved_at;

    if (isActive && this.confirmingDismissId !== alert.id) {
      this.confirmingDismissId = alert.id;
      return;
    }

    const force = isActive;
    this.http.delete(`${this.API}/sla/alerts/${alert.id}`, {
      params: force ? { force: 'true' } : {}
    }).subscribe({
      next: () => {
        this.confirmingDismissId = null;
        const wasUnread = !alert.is_read;
        this.slaAlerts = this.slaAlerts.filter(a => a.id !== alert.id);
        if (wasUnread) this.unreadCount = Math.max(0, this.unreadCount - 1);
        this.showUndo(alert.id);
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('[SLA] delete error:', err);
        this.confirmingDismissId = null;
      }
    });
  }

  cancelDismiss(): void {
    this.confirmingDismissId = null;
  }

  private showUndo(alertId: number): void {
    this.recentlyDismissedId = alertId;
    clearTimeout(this.undoTimeoutHandle);
    this.undoTimeoutHandle = setTimeout(() => {
      if (this.recentlyDismissedId === alertId) this.recentlyDismissedId = null;
      this.cdr.markForCheck();
    }, 5000);
  }

  undoDismiss(): void {
    if (this.recentlyDismissedId == null) return;
    const id = this.recentlyDismissedId;
    this.http.post(`${this.API}/sla/alerts/${id}/restore`, {}).subscribe({
      next: () => {
        this.recentlyDismissedId = null;
        this.refreshAlerts();
      },
      error: (err) => {
        console.error('[SLA] restore error:', err);
        this.recentlyDismissedId = null;
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Workflow Notifications
  // ═══════════════════════════════════════════════════════════════════════════

  private refreshWorkflowNotifications(): void {
    this.loadWorkflowNotifications();
    this.loadWorkflowUnreadCount();
  }

  private loadWorkflowNotifications(): void {
    this.http.get<{ notifications: WorkflowNotification[] }>(
      `${this.API}/notifications`
    ).subscribe({
      next: (data) => {
        const mapped = (data.notifications || []).map(n => this.toWorkflowView(n));
        this.workflowNotifications = mapped.sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('[Workflow] load error:', err);
        this.workflowNotifications = [];
        this.cdr.markForCheck();
      }
    });
  }

  private loadWorkflowUnreadCount(): void {
    this.http.get<{ count: number }>(`${this.API}/notifications/unread-count`).subscribe({
      next: (data) => {
        this.workflowUnreadCount = data.count;
        this.cdr.markForCheck();
      },
      error: (err) => console.error('[Workflow] unread-count error:', err)
    });
  }

  private toWorkflowView(n: WorkflowNotification): WorkflowNotificationView {
    const meta = this.workflowIconMeta(n.type);
    return {
      ...n,
      time: this.timeAgo(new Date(n.created_at)),
      icon: meta.icon,
      iconColor: meta.color,
      bgColor: meta.bg,
    };
  }

  private workflowIconMeta(type: string): { icon: string; color: string; bg: string } {
    switch (type) {
      case 'assignment':          return { icon: 'user-plus',   color: '#2563eb', bg: '#eff6ff' };
      case 'reassignment':        return { icon: 'user-check',  color: '#4f46e5', bg: '#eef2ff' };
      case 'closed':              return { icon: 'check-circle',color: '#16a34a', bg: '#f0fdf4' };
      case 'rejected':            return { icon: 'x-circle',    color: '#dc2626', bg: '#fef2f2' };
      case 'reopened':            return { icon: 'rotate-ccw',  color: '#d97706', bg: '#fffbeb' };
      case 'corrective_action_assigned':
                                  return { icon: 'clipboard',   color: '#0284c7', bg: '#f0f9ff' };
      case 'corrective_action_proposed':
                                  return { icon: 'shield',      color: '#7c3aed', bg: '#f5f3ff' };
      default:                    return { icon: 'bell',        color: '#64748b', bg: '#f1f5f9' };
    }
  }

  markAllWorkflowAsRead(): void {
    if (this.workflowUnreadCount === 0) return;
    this.http.post(`${this.API}/notifications/read-all`, {}).subscribe({
      next: () => {
        this.workflowNotifications = this.workflowNotifications.map(n => ({ ...n, is_read: true }));
        this.workflowUnreadCount = 0;
        this.cdr.markForCheck();
      },
      error: (err) => console.error('[Workflow] read-all error:', err)
    });
  }

  onWorkflowClick(n: WorkflowNotificationView): void {
    if (!n.is_read) {
      this.http.patch(`${this.API}/notifications/${n.id}/read`, {}).subscribe({
        next: () => {
          n.is_read = true;
          this.workflowUnreadCount = Math.max(0, this.workflowUnreadCount - 1);
          this.cdr.markForCheck();
        },
        error: (err) => console.error('[Workflow] patch read error:', err)
      });
    }
    if (n.nc_id) {
      this.router.navigate(['/admin/quality/nc-list'], {
        queryParams: { highlight: n.nc_id }
      });
    }
  }

  dismissWorkflow(event: Event, n: WorkflowNotificationView): void {
    event.stopPropagation();
    if (this.wfConfirmingDismissId !== n.id) {
      this.wfConfirmingDismissId = n.id;
      return;
    }
    this.http.delete(`${this.API}/notifications/${n.id}`).subscribe({
      next: () => {
        this.wfConfirmingDismissId = null;
        const wasUnread = !n.is_read;
        this.workflowNotifications = this.workflowNotifications.filter(x => x.id !== n.id);
        if (wasUnread) this.workflowUnreadCount = Math.max(0, this.workflowUnreadCount - 1);
        this.showWorkflowUndo(n.id);
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('[Workflow] delete error:', err);
        this.wfConfirmingDismissId = null;
      }
    });
  }

  cancelWorkflowDismiss(): void {
    this.wfConfirmingDismissId = null;
  }

  private showWorkflowUndo(id: number): void {
    this.wfRecentlyDismissedId = id;
    clearTimeout(this.wfUndoTimeoutHandle);
    this.wfUndoTimeoutHandle = setTimeout(() => {
      if (this.wfRecentlyDismissedId === id) this.wfRecentlyDismissedId = null;
      this.cdr.markForCheck();
    }, 5000);
  }

  undoWorkflowDismiss(): void {
    if (this.wfRecentlyDismissedId == null) return;
    const id = this.wfRecentlyDismissedId;
    this.http.post(`${this.API}/notifications/${id}/restore`, {}).subscribe({
      next: () => {
        this.wfRecentlyDismissedId = null;
        this.refreshWorkflowNotifications();
      },
      error: (err) => {
        console.error('[Workflow] restore error:', err);
        this.wfRecentlyDismissedId = null;
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Shared helpers
  // ═══════════════════════════════════════════════════════════════════════════

  private timeAgo(date: Date): string {
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return `${Math.floor(diff / 86400)}d`;
  }

  callFullscreen() {
    if (!this.isFullScreen) {
      this.docElement?.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
    this.isFullScreen = !this.isFullScreen;
  }

  setLanguage(text: string, lang: string, flag: string) {
    this.countryName = text;
    this.flagvalue = flag;
    this.langStoreValue = lang;
    this.languageService.setLanguage(lang);
  }

  mobileMenuSidebarOpen(event: Event, className: string) {
    const hasClass = (event.target as HTMLInputElement).classList.contains(className);
    if (hasClass) {
      this.renderer.removeClass(this.document.body, className);
    } else {
      this.renderer.addClass(this.document.body, className);
    }
  }

  callSidemenuCollapse() {
    const hasClass = this.document.body.classList.contains('side-closed');
    if (hasClass) {
      this.renderer.removeClass(this.document.body, 'side-closed');
      this.renderer.removeClass(this.document.body, 'submenu-closed');
      localStorage.setItem('collapsed_menu', 'false');
    } else {
      this.renderer.addClass(this.document.body, 'side-closed');
      this.renderer.addClass(this.document.body, 'submenu-closed');
      localStorage.setItem('collapsed_menu', 'true');
    }
  }

  logout() {
    this.subs.sink = this.authService.logout().subscribe((res) => {
      if (!res.success) {
        this.router.navigate(['/authentication/signin']);
      }
    });
  }

  override ngOnDestroy(): void {
    clearTimeout(this.undoTimeoutHandle);
    clearTimeout(this.wfUndoTimeoutHandle);
    this.eventSource?.close();
    super.ngOnDestroy();
  }
}