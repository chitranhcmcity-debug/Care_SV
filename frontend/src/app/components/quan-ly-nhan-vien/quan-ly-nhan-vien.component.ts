import { ChangeDetectorRef, Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { StaffService } from '../../services/staff.service';
import { NotificationService, ToastType } from '../../services/notification.service';
import { User } from '../../models/types';

type AccountRole = 'staff' | 'teacher' | 'manager';

/** Admin: tạo, sửa, đặt lại, khóa và xóa tài khoản nhân viên / giảng viên / quản lý. */
@Component({
  selector: 'app-staff-management',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './quan-ly-nhan-vien.component.html',
  styleUrl: './quan-ly-nhan-vien.component.css',
  host: { class: 'block' },
})
export class StaffManagementComponent {
  private readonly staffService = inject(StaffService);
  private readonly notify = inject(NotificationService);
  private readonly cdr = inject(ChangeDetectorRef);

  @Input() staffList: User[] = [];
  @Input() canAssessStaff = false;
  /** Yêu cầu component cha nạp lại danh sách nhân viên dùng chung sau mọi thay đổi. */
  @Output() reload = new EventEmitter<void>();
  @Output() assessStaff = new EventEmitter<User>();

  newStaffName = '';
  newStaffEmail = '';
  newStaffPass = '';
  newStaffPhone = '';
  newStaffRole: AccountRole = 'staff';
  /** Nhân viên / giảng viên vào đơn vị của Trưởng phòng / PHT này. */
  newStaffManagerId = '';
  isCreatingStaff = false;
  staffCreatedMsg = '';
  staffGeneratedPass = '';

  showEditStaffModal = false;
  editingStaffId = '';
  editStaffName = '';
  editStaffEmail = '';
  editStaffPass = '';
  editStaffPhone = '';
  editStaffRole: AccountRole = 'staff';
  isUpdatingStaff = false;

  /** Các tài khoản Trưởng phòng / PHT đang hoạt động: mỗi người sở hữu một đơn vị mà nhân viên và giảng viên có thể vào. */
  get activeManagers(): User[] {
    return this.staffList.filter((s) => s.role === 'manager' && s.status === 'active');
  }

  /** Nhãn "Đơn vị của …" cho danh sách tài khoản của admin. */
  unitLabel(user: User): string {
    const unit = user.unitId;
    if (!unit || typeof unit === 'string') return '';
    return user.role === 'manager' ? 'Chủ đơn vị' : `Đơn vị: ${unit.fullName}`;
  }

  copyPasswordToClipboard(pass: string) {
    if (!pass) return;
    navigator.clipboard
      .writeText(pass)
      .then(() => {
        this.notify.show(
          'success',
          'Mật khẩu đã được lưu vào khay nhớ tạm (Clipboard).',
          'Đã Sao Chép!',
        );
      })
      .catch(() => {
        this.notify.show('info', pass, 'Mật Khẩu');
      });
  }

  createStaffAccount() {
    if (!this.newStaffName.trim() || !this.newStaffEmail.trim()) return;
    if (this.newStaffRole !== 'manager' && !this.newStaffManagerId) {
      this.toast(
        'error',
        'Chưa chọn đơn vị',
        'Hãy chọn Trưởng phòng / Phó hiệu trưởng quản lý tài khoản này.',
      );
      return;
    }
    this.isCreatingStaff = true;
    this.staffCreatedMsg = '';
    this.staffGeneratedPass = '';
    this.cdr.detectChanges();

    const payload = {
      fullName: this.newStaffName.trim(),
      email: this.newStaffEmail.trim(),
      customPassword: this.newStaffPass.trim() || undefined,
      phone: this.newStaffPhone.trim(),
      role: this.newStaffRole,
      ...(this.newStaffRole === 'manager' ? {} : { managerId: this.newStaffManagerId }),
    };

    this.staffService
      .createStaff(payload)
      .pipe(
        finalize(() => {
          this.isCreatingStaff = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: (res) => {
          this.staffCreatedMsg = res.message + ' ' + this.emailStatusText(res.emailSent);
          if (res.generatedPassword) {
            this.staffGeneratedPass = res.generatedPassword;
          }
          this.toast(
            res.emailSent ? 'success' : 'warning',
            'Tạo Nhân Viên Thành Công!',
            this.emailStatusText(res.emailSent),
          );
          this.newStaffName = '';
          this.newStaffEmail = '';
          this.newStaffPass = '';
          this.newStaffPhone = '';
          this.newStaffRole = 'staff';
          this.newStaffManagerId = '';
          this.reload.emit();
          this.cdr.detectChanges();
        },
        error: (err) => {
          const errMsg = err.error?.message || err.message || 'Không thể tạo nhân viên';
          this.toast('error', 'Lỗi Tạo Nhân Viên', errMsg);
          this.cdr.detectChanges();
        },
      });
  }

  /** "Trần Thị Mai" → "TM", cho avatar trong danh sách nhân viên. */
  staffInitials(name = ''): string {
    const words = name.trim().split(/\s+/).filter(Boolean);
    if (!words.length) return '?';
    return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase();
  }

  openEditStaffModal(staff: User) {
    this.editingStaffId = staff.id || (staff as any)._id || '';
    this.editStaffName = staff.fullName;
    this.editStaffEmail = staff.email;
    this.editStaffPhone = staff.phone || '';
    this.editStaffPass = '';
    this.editStaffRole =
      staff.role === 'teacher' || staff.role === 'manager' ? staff.role : 'staff';
    this.showEditStaffModal = true;
    this.cdr.detectChanges();
  }

  saveEditStaff() {
    if (!this.editingStaffId || !this.editStaffName.trim() || !this.editStaffEmail.trim()) return;
    this.isUpdatingStaff = true;
    this.cdr.detectChanges();

    const payload: any = {
      fullName: this.editStaffName.trim(),
      email: this.editStaffEmail.trim(),
      phone: this.editStaffPhone.trim(),
      role: this.editStaffRole,
    };
    if (this.editStaffPass.trim()) {
      payload.password = this.editStaffPass.trim();
    }

    this.staffService
      .updateStaff(this.editingStaffId, payload)
      .pipe(
        finalize(() => {
          this.isUpdatingStaff = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: (res) => {
          this.showEditStaffModal = false;
          const msg = res.message || 'Cập nhật tài khoản nhân viên thành công!';
          this.toast('success', 'Thành Công!', msg);
          if (this.editStaffPass.trim()) {
            this.staffCreatedMsg =
              'Đã cập nhật thông tin và mật khẩu mới cho ' + this.editStaffName + '!';
            this.staffGeneratedPass = this.editStaffPass.trim();
          }
          this.reload.emit();
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.notify.error(err.error?.message || 'Lỗi khi cập nhật nhân viên');
          this.cdr.detectChanges();
        },
      });
  }

  private emailStatusText(emailSent: boolean): string {
    return emailSent
      ? 'Đã gửi mật khẩu tới email của nhân viên.'
      : 'Không gửi được email — hãy tự chuyển mật khẩu bên dưới cho nhân viên.';
  }

  async resetStaffPassword(staff: User) {
    const customPass = await this.notify.prompt({
      title: 'Đặt lại mật khẩu',
      message: `Nhập mật khẩu mới cho "${staff.fullName}". Để trống để hệ thống tự sinh mật khẩu ngẫu nhiên.`,
      placeholder: 'Mật khẩu mới (không bắt buộc)',
      confirmText: 'Đặt lại',
    });
    if (customPass === null) return; // Người dùng đã hủy

    const targetId = staff.id || (staff as any)._id || '';
    this.staffService.resetStaffPassword(targetId, customPass).subscribe({
      next: (res) => {
        this.staffCreatedMsg =
          'Đã đặt lại mật khẩu cho nhân viên ' +
          staff.fullName +
          '! ' +
          this.emailStatusText(res.emailSent);
        this.staffGeneratedPass = res.newPassword;
        this.toast(
          res.emailSent ? 'success' : 'warning',
          'Reset Mật Khẩu Thành Công!',
          this.emailStatusText(res.emailSent),
        );
        this.copyPasswordToClipboard(res.newPassword);
        this.reload.emit();
        this.cdr.detectChanges();
      },
      error: (err) => {
        const msg =
          err.error?.message || err.statusText || 'Không thể kết nối đến máy chủ API backend';
        this.toast('error', 'Lỗi Reset Mật Khẩu', msg);
        this.cdr.detectChanges();
      },
    });
  }

  toggleStaffStatus(staff: User) {
    const newStatus = staff.status === 'active' ? 'inactive' : 'active';
    this.staffService.toggleStaffStatus(staff.id || (staff as any)._id, newStatus).subscribe({
      next: () => {
        this.reload.emit();
        this.cdr.detectChanges();
      },
      error: (err) => {
        const msg = err.error?.message || err.statusText || 'Lỗi cập nhật trạng thái';
        this.notify.error(msg);
        this.cdr.detectChanges();
      },
    });
  }

  async deleteStaffAccount(staff: User) {
    const ok = await this.notify.confirm({
      title: 'Xóa vĩnh viễn tài khoản?',
      message: `${staff.fullName} (${staff.email}) sẽ bị xóa khỏi hệ thống. Không thể hoàn tác.`,
      confirmText: 'Xóa tài khoản',
      danger: true,
    });
    if (!ok) return;
    const targetId = staff.id || (staff as any)._id || '';
    this.staffService.deleteStaff(targetId).subscribe({
      next: (res) => {
        this.toast('success', 'Đã Xóa Nhân Viên', res.message);
        this.reload.emit();
        this.cdr.detectChanges();
      },
      error: (err) => {
        const msg = err.error?.message || err.statusText || 'Không thể xóa tài khoản nhân viên';
        this.toast('error', 'Lỗi Xóa Nhân Viên', msg);
        this.cdr.detectChanges();
      },
    });
  }

  private toast(type: ToastType, title: string, message: string) {
    this.notify.show(type, message, title);
  }
}
