import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { NavbarComponent } from './components/navbar/navbar.component';
import { NotificationsComponent } from './components/notifications/notifications.component';
import { CallDialogComponent } from './components/call-dialog/call-dialog.component';
import { AuthService } from './services/auth.service';

// Pages rendered full-width without the signed-in sidebar shell.
const PUBLIC_PATHS = [
  '/',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
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

  constructor(public authService: AuthService) {}
}
