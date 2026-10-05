import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SettingsService } from '../../services/settings.service';
import { BrandingService } from '../../services/branding.service';
import { NotificationService } from '../../services/notification.service';
import { SystemSettings } from '../../models/types';

const MAX_LOGO_BYTES = 300 * 1024;

/** Admin: nhận diện hệ thống và giao diện web (tiêu đề, trường, liên hệ, logo, màu). */
@Component({
  selector: 'app-system-settings-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cai-dat-he-thong.component.html',
})
export class SystemSettingsPanelComponent implements OnInit {
  private readonly settingsService = inject(SettingsService);
  private readonly branding = inject(BrandingService);
  private readonly notify = inject(NotificationService);
  private readonly cdr = inject(ChangeDetectorRef);

  sysSettings: SystemSettings = {
    systemTitle: 'ITC CARE',
    schoolName: 'Trường Cao Đẳng Công Nghệ Thông Tin TP.HCM (ITC)',
    departmentName: 'Phòng Đào Tạo & Chăm Sóc Sinh Viên',
    supportHotline: '028 3965 1114',
    supportEmail: 'cskh@itc.edu.vn',
    logoDataUrl: '',
    primaryColor: '#673ab7',
    warningLevels: [],
    absenceReasons: [],
    tags: [],
  };
  isSavingSettings = false;

  ngOnInit() {
    this.settingsService.getSettings().subscribe({
      next: (s) => {
        if (s) this.sysSettings = s;
        this.cdr.markForCheck();
      },
      error: (err) => console.error('Load settings error:', err),
    });
  }

  saveSettings() {
    this.isSavingSettings = true;
    const {
      systemTitle,
      schoolName,
      departmentName,
      supportHotline,
      supportEmail,
      logoDataUrl,
      primaryColor,
    } = this.sysSettings;
    this.settingsService
      .updateSettings({
        systemTitle,
        schoolName,
        departmentName,
        supportHotline,
        supportEmail,
        logoDataUrl,
        primaryColor,
      })
      .subscribe({
        next: (res) => {
          this.isSavingSettings = false;
          this.notify.success(res.message || 'Đã lưu cấu hình thành công!');
          this.branding.apply(res.settings);
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.isSavingSettings = false;
          this.cdr.markForCheck();
          this.notify.error(err.error?.message || 'Lỗi khi lưu cấu hình');
        },
      });
  }

  /** Đọc logo đã chọn dưới dạng data URL (giữ nhỏ: nó được lưu trong cài đặt). */
  onLogoSelected(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (file.size > MAX_LOGO_BYTES) {
      this.notify.error('Logo tối đa 300 KB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      this.sysSettings.logoDataUrl = String(reader.result);
      this.cdr.detectChanges();
    };
    reader.readAsDataURL(file);
  }
}
