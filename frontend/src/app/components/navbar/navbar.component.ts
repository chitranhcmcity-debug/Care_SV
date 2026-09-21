import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { CallTaskService } from '../../services/call-task.service';
import { TaskService } from '../../services/task.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './navbar.component.html',
})
export class NavbarComponent implements OnInit, OnDestroy {
  unreadCount = 0;
  pendingTaskCount = 0;
  sidebarOpen = false;
  private intervalId: any;

  constructor(
    public authService: AuthService,
    private callTaskService: CallTaskService,
    private taskService: TaskService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.fetchUnreadCount();
    this.fetchPendingTaskCount();
    // Poll unread notification count every 15 seconds
    this.intervalId = setInterval(() => {
      this.fetchUnreadCount();
      this.fetchPendingTaskCount();
    }, 15000);
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

  fetchPendingTaskCount() {
    if (this.authService.isLoggedIn() && this.authService.isStaff()) {
      this.taskService.getPendingCount().subscribe({
        next: (res) => (this.pendingTaskCount = res.pendingCount || 0),
        error: () => (this.pendingTaskCount = 0),
      });
    }
  }

  get user() {
    return this.authService.currentUser();
  }

  toggleSidebar() {
    this.sidebarOpen = !this.sidebarOpen;
  }

  closeSidebar() {
    this.sidebarOpen = false;
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
