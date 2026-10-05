import { inject, Injectable, signal } from '@angular/core';
import { Branding, SettingsService } from './settings.service';

const DEFAULT_COLOR = '#673ab7';
const DEFAULT_LOGO = 'logo_truong.png';
// Sắc Tailwind → tỷ lệ pha: dương = về phía trắng, âm = về phía đen.
const SHADES: [number, number][] = [
  [50, 0.9],
  [100, 0.78],
  [200, 0.6],
  [300, 0.4],
  [400, 0.2],
  [500, 0],
  [600, -0.08],
  [700, -0.16],
  [800, -0.26],
  [900, -0.4],
  [950, -0.55],
];

/**
 * Giao diện web do admin cấu hình: tên hệ thống, logo và màu chính. Bảng màu Tailwind
 * `violet` (màu nhấn của ứng dụng) đọc biến CSS, nên đổi màu sẽ
 * đổi chủ đề toàn ứng dụng mà không cần build lại (xem index.html và styles.css).
 */
@Injectable({ providedIn: 'root' })
export class BrandingService {
  private readonly settings = inject(SettingsService);

  readonly title = signal('ITC CARE');
  readonly schoolName = signal('Trường Cao Đẳng Công Nghệ Thông Tin TP.HCM (ITC)');
  readonly departmentName = signal('Phòng Đào Tạo & Chăm Sóc Sinh Viên');
  readonly supportHotline = signal('028 3965 1114');
  readonly supportEmail = signal('cskh@itc.edu.vn');
  readonly logo = signal(DEFAULT_LOGO);

  /** Nạp thương hiệu công khai một lần lúc khởi động (chạy được trước khi đăng nhập). */
  load(): void {
    this.settings.getBranding().subscribe({
      next: (b) => this.apply(b),
      error: () => {}, // giữ mặc định
    });
  }

  apply(b: Partial<Branding>): void {
    if (b.systemTitle) {
      this.title.set(b.systemTitle);
      document.title = b.systemTitle;
    }
    if (b.schoolName !== undefined) this.schoolName.set(b.schoolName);
    if (b.departmentName !== undefined) this.departmentName.set(b.departmentName);
    if (b.supportHotline !== undefined) this.supportHotline.set(b.supportHotline);
    if (b.supportEmail !== undefined) this.supportEmail.set(b.supportEmail);
    this.logo.set(b.logoDataUrl || DEFAULT_LOGO);
    this.applyColor(b.primaryColor || DEFAULT_COLOR);
  }

  private applyColor(hex: string): void {
    const root = document.documentElement.style;
    if (!/^#[0-9a-f]{6}$/i.test(hex) || hex.toLowerCase() === DEFAULT_COLOR) {
      // Bảng màu mặc định chỉnh tay trong styles.css.
      for (const [shade] of SHADES) root.removeProperty(`--brand-${shade}`);
      return;
    }
    const base = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    for (const [shade, ratio] of SHADES) {
      const target = ratio >= 0 ? 255 : 0;
      const weight = Math.abs(ratio);
      const rgb = base.map((c) => Math.round(c + (target - c) * weight));
      root.setProperty(`--brand-${shade}`, rgb.join(' '));
    }
  }
}
