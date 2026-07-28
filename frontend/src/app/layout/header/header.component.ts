import { DOCUMENT, NgClass } from '@angular/common';
import {
  Component,
  Inject,
  ElementRef,
  OnInit,
  Renderer2,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ConfigService } from '@config';
import { UnsubscribeOnDestroyAdapter } from '@shared';
import { LanguageService, InConfiguration, AuthService, NcService } from '@core';
import { NgScrollbar } from 'ngx-scrollbar';
import { MatMenuModule } from '@angular/material/menu';
import { FeatherIconsComponent } from '@shared/components/feather-icons/feather-icons.component';
import { MatButtonModule } from '@angular/material/button';
import { HttpClient } from '@angular/common/http';

interface SlaNotification {
  id: number;
  nc_id: string;
  type: 'BREACHED' | 'WARNING';
  message: string;
  time: string;
  color: string;
  status: string;
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
export class HeaderComponent
  extends UnsubscribeOnDestroyAdapter
  implements OnInit
{
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

  // ─── SLA notifications ───
  slaNotifications: SlaNotification[] = [];
  unreadCount = 0;

  get hasBreachedNotification(): boolean {
    return this.slaNotifications.some(n => n.type === 'BREACHED');
  }

  constructor(
    @Inject(DOCUMENT) private document: Document,
    private renderer: Renderer2,
    public elementRef: ElementRef,
    private configService: ConfigService,
    private authService: AuthService,
    private router: Router,
    public languageService: LanguageService,
    private http: HttpClient
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

    this.loadSlaNotifications();
    setInterval(() => this.loadSlaNotifications(), 2 * 60 * 1000);
  }

  loadSlaNotifications() {
    this.http.get<any>('/sla/alerts').subscribe({
      next: (data) => {
        const alerts = data.alerts || [];
        this.unreadCount = alerts.length;
        this.slaNotifications = alerts.map((a: any) => ({
          id: a.id,
          nc_id: a.nc_id,
          type: a.type,
          message: a.type === 'BREACHED'
            ? `NC ${a.nc_id} — SLA breached (>5 days)`
            : `NC ${a.nc_id} — Due within 24h`,
          time: this.timeAgo(new Date(a.created_at)),
          color: a.type === 'BREACHED' ? 'nfc-red' : 'nfc-orange',
          status: 'msg-unread'
        }));
      },
      error: (err) => {
        console.error('Error loading SLA alerts', err);
        this.slaNotifications = [];
        this.unreadCount = 0;
      }
    });
  }

  private timeAgo(date: Date): string {
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return `${Math.floor(diff / 86400)}d`;
  }

  markAllAsRead() {
    this.slaNotifications = this.slaNotifications.map(n => ({
      ...n,
      status: 'msg-read'
    }));
    this.unreadCount = 0;
  }

  onNotificationClick(ncId: string) {
    this.router.navigate(['/admin/quality/nc-list'], {
      queryParams: { highlight: ncId }
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
}