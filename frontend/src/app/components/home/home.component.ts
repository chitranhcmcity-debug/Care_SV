import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './home.component.html',
})
export class HomeComponent {
  constructor(
    public authService: AuthService,
    private router: Router,
  ) {}

  enterSystem() {
    if (!this.authService.isLoggedIn()) {
      this.router.navigate(['/login']);
      return;
    }
    const home: Record<string, string> = {
      admin: '/admin',
      teacher: '/attendance',
      staff: '/call-tasks',
    };
    const role = this.authService.currentUser()?.role || 'staff';
    this.router.navigate([home[role] || '/login']);
  }
}
