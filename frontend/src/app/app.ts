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

// Pages rendered full-width without the signed-in sidebar shell.
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
    // Admin-configured name, logo and colour, loaded before sign-in for the login page.
    this.branding.load();
  }
}
