import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { App } from './app';
import { AuthService } from './services/auth.service';

@Component({ standalone: true, template: '<p class="route-content">Page content</p>' })
class TestPage {}

describe('App shell', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([
          { path: '', component: TestPage },
          { path: 'admin', component: TestPage },
          { path: 'login', component: TestPage },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
  });
  it('keeps public pages outside the dashboard while preserving the signed-in session', async () => {
    const auth = TestBed.inject(AuthService);
    auth.currentUser.set({
      id: 'admin',
      fullName: 'Admin',
      email: 'admin',
      role: 'admin',
      status: 'active',
    });
    auth.token.set(`e30.${btoa(JSON.stringify({ exp: Date.now() / 1000 + 3600 }))}.signature`);
    const router = TestBed.inject(Router);
    const fixture = TestBed.createComponent(App);
    await router.navigateByUrl('/admin');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('app-navbar')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('main router-outlet')).toBeTruthy();
    const homeLink = fixture.nativeElement.querySelector('a[aria-label="Về trang chủ website"]');
    expect(homeLink).toBeTruthy();
    homeLink.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(router.url).toBe('/');
    expect(fixture.nativeElement.querySelector('app-navbar')).toBeNull();
    expect(fixture.nativeElement.querySelector('.route-content')).toBeTruthy();
    expect(auth.isLoggedIn()).toBe(true);
    await router.navigateByUrl('/admin');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('app-navbar')).toBeTruthy();
    await router.navigateByUrl('/?from=dashboard#features');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('app-navbar')).toBeNull();
    fixture.destroy();
  });
});
