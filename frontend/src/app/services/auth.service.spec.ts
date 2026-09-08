import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService } from './auth.service';
import { authInterceptor } from '../interceptors/auth.interceptor';

describe('Authentication', () => {
  let auth: AuthService;
  let http: HttpClient;
  let controller: HttpTestingController;
  const token = (expiry: number) => `e30.${btoa(JSON.stringify({ exp: expiry }))}.signature`;
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
    auth.currentUser.set({
      id: 'test-user',
      fullName: 'Test',
      email: 'test@example.test',
      role: 'staff',
      status: 'active',
    });
  });
  afterEach(() => {
    controller.verify();
    localStorage.clear();
  });
  it('rejects expired and malformed tokens', () => {
    auth.token.set(token(Date.now() / 1000 - 60));
    expect(auth.isLoggedIn()).toBe(false);
    auth.token.set('invalid');
    expect(auth.isLoggedIn()).toBe(false);
    auth.token.set(token(Date.now() / 1000 + 60));
    expect(auth.isLoggedIn()).toBe(true);
  });
  it('attaches credentials only to the configured API', () => {
    auth.token.set('test-token');
    http.get('/api/settings').subscribe();
    const api = controller.expectOne('/api/settings');
    expect(api.request.headers.get('Authorization')).toBe('Bearer test-token');
    api.flush({});
    http.get('https://external.example.test/data').subscribe();
    const external = controller.expectOne('https://external.example.test/data');
    expect(external.request.headers.has('Authorization')).toBe(false);
    external.flush({});
  });
  it('clears the session when the API revokes a token', () => {
    auth.token.set('revoked-token');
    localStorage.setItem('itc_token', 'revoked-token');
    http.get('/api/settings').subscribe({ error: () => {} });
    controller.expectOne('/api/settings').flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(auth.token()).toBeNull();
    expect(auth.currentUser()).toBeNull();
    expect(localStorage.getItem('itc_token')).toBeNull();
  });
});
