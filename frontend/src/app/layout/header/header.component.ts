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
import { ConfigService } from '@config';
import { UnsubscribeOnDestroyAdapter } from '@shared';
import { LanguageService, InConfiguration, AuthService } from '@core';
import { NgScrollbar } from 'ngx-scrollbar';
import { MatMenuModule } from '@angular/material/menu';
import { FeatherIconsComponent } from '@shared/components/feather-icons/feather-icons.component';
import { MatButtonModule } from '@angular/material/button';
import { HttpClient } from '@angular/common/http';

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

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
  imports: [
    RouterLink,
    NgClass,
    MatButtonModule,
    FeatherIconsComponent,
    MatMenuModule,
    NgScrollbar,
  ]
})
export class HeaderComponent extends UnsubscribeOnDestroyAdapter implements OnInit, OnDestroy {
  public config!: InConfiguration;
  userName = '';
  userInitials = '';
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

  private readonly API = 'http://localhost:8000';

  private eventSource?: EventSource;
  private undoTimeoutHandle?: ReturnType<typeof setTimeout>;

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

    // ─── Charge SLA immédiatement, puis écoute le flux temps réel (SSE) ───
    this.refreshAlerts();
    this.connectToSlaStream();
  }

  // ─── Temps réel (SSE) ───

  private connectToSlaStream(): void {
    this.eventSource = new EventSource(`${this.API}/sla/stream`);

    this.eventSource.onmessage = (event) => {
      this.ngZone.run(() => {
        try {
          const payload = JSON.parse(event.data);
          console.log('[SLA] événement temps réel reçu :', payload);
          this.refreshAlerts();
        } catch (e) {
          console.error('[SLA] payload SSE invalide :', e);
        }
      });
    };

    this.eventSource.onerror = () => {
      console.warn('[SLA] connexion SSE interrompue, reconnexion automatique en cours…');
    };
  }

  // ─── Data loading ───

  private refreshAlerts(): void {
    this.loadAlerts();
    this.loadUnreadCount();
  }

  private loadAlerts(): void {
    this.http.get<{ alerts: SlaAlert[] }>(`${this.API}/sla/alerts`).subscribe({
      next: (data) => {
        this.slaAlerts = (data.alerts || []).map((a) => this.toView(a));
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

  private toView(a: SlaAlert): SlaAlertView {
    return {
      ...a,
      message: a.alert_type === 'BREACHED'
        ? `NC ${a.nc_id} has breached the 5-day ISO 10.2 SLA — immediate action required`
        : `NC ${a.nc_id} is approaching its SLA deadline — due within 24h`,
      time: this.timeAgo(new Date(a.created_at)),
      color: a.alert_type === 'BREACHED' ? 'nfc-red' : 'nfc-orange'
    };
  }

  private timeAgo(date: Date): string {
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return `${Math.floor(diff / 86400)}d`;
  }

  // ─── Actions ───

  markAllAsRead(): void {
    if (this.unreadCount === 0) return;
    this.http.post(`${this.API}/sla/alerts/read-all`, {}).subscribe({
      next: () => {
        this.slaAlerts = this.slaAlerts.map((a) => ({ ...a, is_read: true }));
        this.unreadCount = 0;
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
        this.slaAlerts = this.slaAlerts.filter((a) => a.id !== alert.id);
        if (wasUnread) this.unreadCount = Math.max(0, this.unreadCount - 1);
        this.showUndo(alert.id);
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

  callFullscreen() {
    if (!this.isFullScreen) {
      if (this.docElement?.requestFullscreen != null) {
        this.docElement?.requestFullscreen();
      }
    } else {
      document.exitFullscreen();
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
    this.eventSource?.close();
    super.ngOnDestroy();
  }
}