import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CallDialogComponent } from './call-dialog.component';
import { AuthService } from '../../services/auth.service';

describe('Call dialog access', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [CallDialogComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
  });

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    localStorage.clear();
  });

  it('loads configuration only when a call dialog is opened', () => {
    const fixture = TestBed.createComponent(CallDialogComponent);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectNone('/api/calls/config');
    fixture.componentInstance.calls.open({
      student: { _id: 'student', fullName: 'Student', phone: '0912345678' },
    });
    fixture.detectChanges();
    http.expectOne('/api/calls/config').flush({ stringee: true, hotline: '02873001234' });
    expect(fixture.componentInstance.stringeeAvailable()).toBe(true);
  });

  it('keeps the switchboard selected when the dialog is opened again', () => {
    const fixture = TestBed.createComponent(CallDialogComponent);
    const dialog = fixture.componentInstance;
    const http = TestBed.inject(HttpTestingController);
    const student = { _id: 'student', fullName: 'Student', phone: '0912345678' };
    dialog.calls.open({ student });
    fixture.detectChanges();
    http.expectOne('/api/calls/config').flush({ stringee: true, hotline: '02873001234' });
    expect(dialog.method()).toBe('stringee');
    dialog.calls.close();
    fixture.detectChanges();
    // Second open: the cached config answers synchronously.
    dialog.calls.open({ student });
    fixture.detectChanges();
    http.expectNone('/api/calls/config');
    expect(dialog.method()).toBe('stringee');
  });

  it('explains admin access and prevents submitting a call', () => {
    const auth = TestBed.inject(AuthService);
    auth.currentUser.set({
      id: 'admin',
      fullName: 'Admin',
      email: 'admin@example.test',
      role: 'admin',
      status: 'active',
    });
    const fixture = TestBed.createComponent(CallDialogComponent);
    const dialog = fixture.componentInstance;
    dialog.calls.open({ student: { _id: 'student', fullName: 'Student', phone: '0912345678' } });
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/calls/config').flush({ stringee: false, hotline: '' });
    expect(fixture.nativeElement.textContent).toContain('Quản trị viên chỉ được xem');
    expect(fixture.nativeElement.querySelector('button[disabled]')).not.toBeNull();
    dialog.start();
    http.expectNone('/api/calls');
    for (const role of ['manager', 'staff', 'teacher'] as const) {
      auth.currentUser.update((user) => ({ ...user!, role }));
      expect(dialog.canStartCall()).toBe(true);
    }
  });
});
