import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { CareComponent } from './care.component';
import { CareCase, CareCaseService } from '../../services/care-case.service';
import { AuthService } from '../../services/auth.service';
import { AiService } from '../../services/ai.service';
import { CallService } from '../../services/call.service';
import { NotificationService } from '../../services/notification.service';
import { StudentService } from '../../services/student.service';

describe('Care detail interactions', () => {
  function setup(work = true) {
    const c: CareCase = {
      _id: 'case-1',
      studentId: {
        _id: 'student-1',
        fullName: 'Sinh viên kiểm thử',
        studentCode: 'SV001',
        classCode: 'CT1',
      },
      source: 'de_xuat',
      reason: 'Cần hỗ trợ',
      status: 'dang_cham_soc',
      assignedStaffId: null,
      proposedBy: null,
      directedBy: null,
      directedAt: null,
      directive: '',
      dueDate: null,
      createdAt: '2026-09-30',
      updatedAt: '2026-09-30',
      cause: '',
      solution: '',
      notes: [],
      calls: [],
      permissions: { manage: false, work },
      steps: [
        {
          _id: 'step-1',
          title: 'Liên hệ sinh viên / phụ huynh',
          source: 'mac_dinh',
          done: false,
          doneAt: null,
          note: '',
        },
      ],
      closing: {
        result: '',
        summary: '',
        early: false,
        proposedBy: null,
        proposedAt: null,
        approvedBy: null,
        closedAt: null,
      },
    };
    const service = {
      get: vi.fn(() => of(c)),
      list: vi.fn(() => of({ items: [] })),
      summary: vi.fn(() => of({ counts: {}, open: 0 })),
      aiSteps: vi.fn(() => of({ steps: ['Liên hệ phụ huynh'] })),
      addStep: vi.fn(() => of(c)),
      requestClose: vi.fn(() => of(c)),
    };
    TestBed.configureTestingModule({
      imports: [CareComponent],
      providers: [
        { provide: CareCaseService, useValue: service },
        {
          provide: AuthService,
          useValue: { can: (p: string) => p === 'care.work' && work, isAdmin: () => false },
        },
        { provide: CallService, useValue: { savedVersion: signal(0), open: vi.fn() } },
        { provide: AiService, useValue: {} },
        { provide: StudentService, useValue: {} },
        { provide: NotificationService, useValue: { success: vi.fn(), error: vi.fn() } },
        { provide: Router, useValue: { navigate: vi.fn() } },
        {
          provide: ActivatedRoute,
          useValue: { queryParamMap: of(convertToParamMap({ case: c._id })) },
        },
      ],
    });
    const fixture = TestBed.createComponent(CareComponent);
    fixture.detectChanges();
    const button = (label: string) =>
      Array.from(
        fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
      ).find((b) => b.textContent?.trim() === label)!;
    return { fixture, service, button };
  }

  it('adds an AI proposal only after explicit confirmation, and allows cancellation', async () => {
    const { fixture, service, button } = setup();
    button('Tạo đề xuất').click();
    fixture.detectChanges();
    button('Áp dụng đề xuất').click();
    fixture.detectChanges();
    expect(service.addStep).not.toHaveBeenCalled();
    button('Hủy').click();
    fixture.detectChanges();
    expect(service.addStep).not.toHaveBeenCalled();
    button('Áp dụng đề xuất').click();
    fixture.detectChanges();
    button('Xác nhận thêm bước').click();
    await fixture.whenStable();
    expect(service.addStep).toHaveBeenCalledExactlyOnceWith('case-1', 'Liên hệ phụ huynh', 'ai');
  });

  it('opens the existing closing form without submitting a close request', () => {
    const { fixture, service, button } = setup();
    button('Đề nghị kết thúc').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#care-panel-details').hidden).toBe(false);
    expect(fixture.nativeElement.querySelector('#care-panel-process').hidden).toBe(true);
    expect(service.requestClose).not.toHaveBeenCalled();
  });

  it('preserves read-only access across the redesigned panels', () => {
    const { fixture, button } = setup(false);
    expect(fixture.nativeElement.querySelector('.care-check').disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('[aria-label="Chỉnh sửa nguyên nhân"]')).toBeNull();
    expect(button('Tạo đề xuất')).toBeUndefined();
    expect(button('Đề nghị kết thúc')).toBeUndefined();
  });
});
