import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { CallTaskService } from '../../services/call-task.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './navbar.component.html',
})
export class NavbarComponent implements OnInit, OnDestroy {
  unreadCount = 0;
  private intervalId: any;

  constructor(
    public authService: AuthService,
    private callTaskService: CallTaskService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.fetchUnreadCount();
    // Poll unread notification count every 15 seconds
    this.intervalId = setInterval(() => this.fetchUnreadCount(), 15000);
  }

  ngOnDestroy(): void {
    if (this.intervalId) clearInterval(this.intervalId);
  }

  fetchUnreadCount() {
    if (this.authService.isLoggedIn()) {
      this.callTaskService.getUnreadCount().subscribe({
        next: (res) => (this.unreadCount = res.unreadCount || 0),
        error: () => (this.unreadCount = 0),
      });
    }
  }

  get user() {
    return this.authService.currentUser();
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
