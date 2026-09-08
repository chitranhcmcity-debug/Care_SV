import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
})
export class LoginComponent {
  email = '';
  password = '';
  loading = false;
  errorMessage = '';

  constructor(
    private authService: AuthService,
    private router: Router,
  ) {
    if (this.authService.isLoggedIn()) {
      this.redirectByUserRole();
    }
  }

  fillCredentials(e: string, p: string) {
    this.email = e;
    this.password = p;
  }

  onLogin() {
    if (!this.email || !this.password) {
      this.errorMessage = 'Vui lòng điền đầy đủ Email và Mật khẩu!';
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    this.authService.login({ email: this.email, password: this.password }).subscribe({
      next: () => {
        this.loading = false;
        this.redirectByUserRole();
      },
      error: (err) => {
        this.loading = false;
        this.errorMessage =
          err.error?.message || 'Đăng nhập thất bại. Vui lòng kiểm tra lại thông tin!';
      },
    });
  }

  private redirectByUserRole() {
    if (this.authService.isAdmin()) {
      this.router.navigate(['/admin']);
    } else if (this.authService.isTeacher()) {
      this.router.navigate(['/attendance']);
    } else if (this.authService.isStaff()) {
      this.router.navigate(['/call-tasks']);
    } else {
      this.router.navigate(['/attendance']);
    }
  }
}
