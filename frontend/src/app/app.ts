import { Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationStart,
  Router,
  RouterOutlet,
} from '@angular/router';
import { filter, map } from 'rxjs';
import { NavbarComponent } from './components/navbar/navbar.component';
import { NotificationsComponent } from './components/notifications/notifications.component';
import { CallDialogComponent } from './components/call-dialog/call-dialog.component';
import { AiCareComponent } from './components/ai-care/ai-care.component';
import { AuthService } from './services/auth.service';
import { BrandingService } from './services/branding.service';

// Pages rendered full-width without the signed-in sidebar shell.
const PUBLIC_PATHS = ['/', '/login', '/register', '/forgot-password', '/reset-password', '/renew', '/account-payment'];

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
  /** True while a navigation runs longer than 150ms (lazy page download); drives the logo loader. */
  readonly navigating = signal(false);
  private navTimer?: ReturnType<typeof setTimeout>;

  constructor(public authService: AuthService) {
    // Admin-configured name, logo and colour, loaded before sign-in for the login page.
    this.branding.load();

    this.router.events.subscribe((event) => {
      if (event instanceof NavigationStart) {
        clearTimeout(this.navTimer);
        this.navTimer = setTimeout(() => this.navigating.set(true), 150);
      } else if (
        event instanceof NavigationEnd ||
        event instanceof NavigationCancel ||
        event instanceof NavigationError
      ) {
        clearTimeout(this.navTimer);
        this.navigating.set(false);
      }
    });
  }
}
