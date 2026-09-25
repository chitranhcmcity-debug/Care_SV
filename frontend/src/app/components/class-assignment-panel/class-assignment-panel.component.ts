import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ClassAssignmentService } from '../../services/class-assignment.service';
import { NotificationService } from '../../services/notification.service';
import { AuthService } from '../../services/auth.service';
import { ClassAssignmentOverview, ClassAssignmentRecord, User } from '../../models/types';

type StaffRow = ClassAssignmentOverview['staffs'][number];

/**
 * Trưởng phòng: gives each administrative class to one CSKH staff member. Changes keep a
 * history; open calls follow the class, and classes without anyone feed the manager's queue.
 */
@Component({
  selector: 'app-class-assignment-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './class-assignment-panel.component.html',
})
export class ClassAssignmentPanelComponent implements OnInit {
  private readonly service = inject(ClassAssignmentService);
  private readonly notify = inject(NotificationService);
  private readonly auth = inject(AuthService);
  private readonly cdr = inject(ChangeDetectorRef);

  /** Show the per-staff "AI assessment" button (needs tasks.manage). */
  @Input() canAssessStaff = false;
  @Output() assessStaff = new EventEmitter<User>();

  readonly canEdit = this.auth.can('classes.assign');
  readonly overview = signal<ClassAssignmentOverview | null>(null);
  search = '';
  onlyUnassigned = false;

  // History modal
  readonly history = signal<ClassAssignmentRecord[] | null>(null);
  historyTitle = '';

  // Transfer modal
  showTransfer = false;
  transferFrom = '';
  transferTo = '';
  transferClasses: string[] = [];
  transferring = false;

  ngOnInit() {
    this.reload();
  }

  reload() {
    this.service.getOverview().subscribe({
      next: (o) => this.overview.set(o),
      error: (err) => this.notify.error(err.error?.message || 'Không tải được phân công lớp'),
    });
  }

  get activeStaff(): StaffRow[] {
    return (this.overview()?.staffs ?? []).filter((s) => s.status === 'active');
  }

  get filteredClasses() {
    const term = this.search.trim().toUpperCase();
    return (this.overview()?.classes ?? []).filter(
      (c) => (!term || c.classCode.includes(term)) && (!this.onlyUnassigned || !c.staff),
    );
  }

  get unassignedCount(): number {
    return (this.overview()?.classes ?? []).filter((c) => !c.staff).length;
  }

  async assign(classCode: string, staffId: string, current: string | null) {
    if ((staffId || null) === (current || null)) return;
    const staff = this.activeStaff.find((s) => s._id === staffId);
    const ok = await this.notify.confirm({
      title: staff ? `Giao lớp ${classCode} cho ${staff.fullName}?` : `Thu hồi lớp ${classCode}?`,
      message: staff
        ? 'Các cuộc gọi đang mở của sinh viên lớp này sẽ chuyển sang nhân viên mới. Lịch sử phân công được lưu lại.'
        : 'Các cuộc gọi đang mở của lớp sẽ về hàng chờ của Trưởng phòng.',
      confirmText: staff ? 'Giao lớp' : 'Thu hồi',
      danger: !staff,
    });
    if (!ok) {
      this.reload(); // reset the select
      return;
    }
    this.service.assign(classCode, staffId || null).subscribe({
      next: (res) => {
        this.notify.success(res.message);
        this.reload();
      },
      error: (err) => {
        this.notify.error(err.error?.message || 'Không phân công được');
        this.reload();
      },
    });
  }

  openHistory(filter: { classCode?: string; staff?: StaffRow }) {
    this.historyTitle = filter.classCode
      ? `Lịch sử phân công lớp ${filter.classCode}`
      : `Lịch sử phụ trách của ${filter.staff?.fullName}`;
    this.history.set([]);
    this.service.getHistory({ classCode: filter.classCode, staffId: filter.staff?._id }).subscribe({
      next: (list) => this.history.set(list),
      error: (err) => {
        this.history.set(null);
        this.notify.error(err.error?.message || 'Không tải được lịch sử');
      },
    });
  }

  openTransfer(from?: StaffRow) {
    this.transferFrom = from?._id ?? '';
    this.transferTo = '';
    this.transferClasses = from ? [...from.managedClasses] : [];
    this.showTransfer = true;
  }

  get transferSource(): StaffRow | undefined {
    return this.overview()?.staffs.find((s) => s._id === this.transferFrom);
  }

  onTransferFromChange() {
    this.transferClasses = [...(this.transferSource?.managedClasses ?? [])];
  }

  toggleTransferClass(code: string) {
    this.transferClasses = this.transferClasses.includes(code)
      ? this.transferClasses.filter((c) => c !== code)
      : [...this.transferClasses, code];
  }

  executeTransfer() {
    if (!this.transferFrom || !this.transferTo || !this.transferClasses.length) return;
    this.transferring = true;
    this.service
      .transfer({
        fromStaffId: this.transferFrom,
        toStaffId: this.transferTo,
        classCodes: this.transferClasses,
      })
      .subscribe({
        next: (res) => {
          this.transferring = false;
          this.showTransfer = false;
          this.cdr.markForCheck();
          this.notify.success(res.message);
          this.reload();
        },
        error: (err) => {
          this.transferring = false;
          this.cdr.markForCheck();
          this.notify.error(err.error?.message || 'Không bàn giao được');
        },
      });
  }

  assess(staff: StaffRow) {
    this.assessStaff.emit({
      _id: staff._id,
      fullName: staff.fullName,
      email: staff.email,
      role: 'staff',
      status: staff.status,
    });
  }
}
