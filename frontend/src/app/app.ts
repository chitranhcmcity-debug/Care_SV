import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { NavbarComponent } from './components/thanh-dieu-huong/thanh-dieu-huong.component';
import { NotificationsComponent } from './components/thong-bao/thong-bao.component';
import { CallDialogComponent } from './components/hop-thoai-cuoc-goi/hop-thoai-cuoc-goi.component';
import { AiCareComponent } from './components/ai-cham-soc/ai-cham-soc.component';
import { AuthService } from './services/auth.service';
import { BrandingService } from './services/branding.service';
import { LoadingService } from './services/loading.service';

// Các trang hiển thị toàn chiều rộng, không có khung sidebar đã đăng nhập.
const PUBLIC_PATHS = [
  '/',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/renew',
  '/account-payment',
];

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    NavbarComponent,
    NotificationsComponent,
    CallDialogComponent,
    AiCareComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  title = 'ITC CARE';
  private readonly router = inject(Router);
  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  get showDashboard(): boolean {
    const path = this.currentUrl().split(/[?#]/)[0];
    return this.authService.isLoggedIn() && !PUBLIC_PATHS.includes(path);
  }

  readonly branding = inject(BrandingService);
  readonly loading = inject(LoadingService);

  constructor(public authService: AuthService) {
    // Tên, logo và màu do admin cấu hình, nạp trước khi đăng nhập cho trang đăng nhập.
    this.branding.load();
  }
}
