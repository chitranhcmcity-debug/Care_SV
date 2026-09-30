import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { BrandingService } from '../../../services/branding.service';

/** Native size of the replica; it is scaled down to fit the hero. */
const W = 1080;
const H = 610;
const FLIP_MS = 1250;
const PAGE_MS = 5200;

const I = {
  users:
    'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2M16 3.13a4 4 0 0 1 0 7.75M21 21v-2a4 4 0 0 0-3-3.85',
  attendance:
    'M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM16 3v4M8 3v4M3 11h18M9 16l2 2 4-4',
  care: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10zM9 11h6M12 8v6',
  calendar:
    'M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM16 3v4M8 3v4M3 11h18M8 15h2M14 15h2',
  calls:
    'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2M15 3h6v6M21 3l-6 6',
  home: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 0 0 1 1h3m10-11l2 2m-2-2v10a1 1 0 0 1-1 1h-3m-6 0a1 1 0 0 0 1-1v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1m-6 0h6',
  analytics: 'M3 3v18h18M7 15l4-4 3 3 5-6',
  progress: 'M4 19h16M7 16V10M12 16V5M17 16v-4',
  tasks:
    'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2zM9 14l2 2 4-4',
  api: 'M8 9l-4 3 4 3M16 9l4 3-4 3M14 5l-4 14',
  alert:
    'M12 9v4m0 4h.01M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  phone:
    'M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M12 6v6l4 2',
  check: 'M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5',
  bell: 'M10 5a2 2 0 1 1 4 0 7 7 0 0 1 4 6v3a4 4 0 0 0 2 3H4a4 4 0 0 0 2-3v-3a7 7 0 0 1 4-6M9 17v1a3 3 0 0 0 6 0v-1',
  book: 'M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2zM22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z',
  monitor: 'M3 4h18v12H3zM8 20h8M12 16v4',
  db: 'M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  code: 'M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16',
};

type PageId = 'overview' | 'attendance' | 'timetable' | 'care' | 'analytics';

/**
 * Landing-page hero: a desk calendar whose pages are faithful, static replicas of the real
 * dashboard screens (illustrative data only). Pages peel off diagonally from the bottom-right
 * corner, like a hand turning them.
 */
@Component({
  selector: 'app-demo-calendar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './demo-calendar.component.html',
  styleUrl: './demo-calendar.component.css',
})
export class DemoCalendarComponent implements AfterViewInit, OnDestroy {
  protected readonly branding = inject(BrandingService);
  private readonly frame = viewChild.required<ElementRef<HTMLElement>>('frame');

  readonly W = W;
  readonly H = H;
  readonly i = I;
  readonly scale = signal(0.55);
  readonly rings = Array.from({ length: 16 });

  readonly pages: {
    id: PageId;
    label: string;
    nav: string;
    title: string;
    subtitle: string;
    tone: string;
    icon: string;
    tipTitle: string;
    tipText: string;
  }[] = [
    {
      id: 'overview',
      label: 'Tổng quan',
      nav: 'Tổng quan hệ thống',
      title: 'Tổng quan hệ thống',
      subtitle: 'Tình hình điểm danh, chăm sóc và cảnh báo của toàn trường hôm nay.',
      tone: 'sunset',
      icon: I.home,
      tipTitle: 'Chúc bạn một ngày',
      tipText: 'làm việc hiệu quả!',
    },
    {
      id: 'attendance',
      label: 'Điểm danh',
      nav: 'Điểm danh lớp học',
      title: 'Điểm danh lớp học',
      subtitle: 'Điểm danh từng buổi học và theo dõi chuyên cần của lớp.',
      tone: 'teal',
      icon: I.attendance,
      tipTitle: 'Nhớ điểm danh',
      tipText: 'ngay trong buổi học nhé!',
    },
    {
      id: 'timetable',
      label: 'Thời khóa biểu',
      nav: 'Thời khóa biểu',
      title: 'Thời khóa biểu',
      subtitle: 'Quản lý lịch học theo ngày, theo tuần và lớp học phần.',
      tone: 'violet',
      icon: I.calendar,
      tipTitle: 'Lịch học hôm nay',
      tipText: '4 buổi học',
    },
    {
      id: 'care',
      label: 'Hồ sơ chăm sóc',
      nav: 'Hồ sơ chăm sóc',
      title: 'Hồ sơ chăm sóc',
      subtitle: 'Theo dõi hồ sơ chăm sóc, cuộc gọi và chỉ đạo xử lý sinh viên vắng.',
      tone: 'rose',
      icon: I.care,
      tipTitle: 'Liên hệ sớm',
      tipText: 'giúp sinh viên quay lại lớp.',
    },
    {
      id: 'analytics',
      label: 'Thống kê',
      nav: 'Thống kê & cảnh báo',
      title: 'Thống kê & cảnh báo',
      subtitle: 'Theo dõi hồ sơ chăm sóc, tỷ lệ vắng và sinh viên chạm mức cảnh báo.',
      tone: 'violet',
      icon: I.analytics,
      tipTitle: 'Dữ liệu trực quan',
      tipText: 'tự làm mới mỗi 60 giây.',
    },
  ];

  readonly nav = [
    {
      title: 'Công việc',
      links: [
        { label: 'Sinh viên', icon: I.users },
        { label: 'Điểm danh lớp học', icon: I.attendance },
        { label: 'Hồ sơ chăm sóc', icon: I.care, badge: 3 },
        { label: 'Thời khóa biểu', icon: I.calendar },
        { label: 'Lịch sử cuộc gọi', icon: I.calls },
      ],
    },
    {
      title: 'Quản lý & báo cáo',
      links: [
        { label: 'Tổng quan hệ thống', icon: I.home },
        { label: 'Thống kê & cảnh báo', icon: I.analytics },
        { label: 'Tiến độ nhân viên', icon: I.progress },
      ],
    },
  ];

  // ---------- Illustrative data ----------
  readonly ovStats = [
    { label: 'Sinh viên', value: 1248, sub: 'Đang theo học', tone: 'st-violet', icon: I.users },
    { label: 'Buổi điểm danh', value: 12, sub: 'Hôm nay', tone: 'st-teal', icon: I.attendance },
    { label: 'Hồ sơ chăm sóc', value: 54, sub: '12 đang mở', tone: 'st-pink', icon: I.care },
    { label: 'Cuộc gọi', value: 38, sub: '68% thành công', tone: 'st-amber', icon: I.phone },
  ];
  readonly ovWeek = [
    { d: 'T2', p: 82, a: 10 },
    { d: 'T3', p: 88, a: 7 },
    { d: 'T4', p: 76, a: 14 },
    { d: 'T5', p: 90, a: 5 },
    { d: 'T6', p: 84, a: 9 },
    { d: 'T7', p: 70, a: 12 },
  ];
  readonly ovWarnings = [
    { title: 'Nguy cơ cấm thi', who: 'SV180123 · Nguyễn Văn An', when: '2 giờ', tone: 'bg-rose-100 text-rose-600' },
    { title: 'Vắng 3 buổi liên tiếp', who: 'SV180456 · Trần Thị Mai', when: '4 giờ', tone: 'bg-amber-100 text-amber-600' },
    { title: 'Chưa liên hệ phụ huynh', who: 'SV180789 · Lê Minh Quân', when: '6 giờ', tone: 'bg-sky-100 text-sky-600' },
  ];

  readonly roster = [
    { name: 'Nguyễn Văn An', code: 'SV180123', state: 'present', rate: 96, av: 'from-amber-400 to-orange-500' },
    { name: 'Trần Thị Mai', code: 'SV180456', state: 'absent', rate: 72, av: 'from-pink-400 to-rose-500' },
    { name: 'Lê Minh Quân', code: 'SV180789', state: 'present', rate: 100, av: 'from-sky-400 to-indigo-500' },
    { name: 'Phạm Gia Huy', code: 'SV180812', state: 'present', rate: 91, av: 'from-emerald-400 to-teal-500' },
    { name: 'Võ Ngọc Hân', code: 'SV180844', state: 'excused', rate: 88, av: 'from-violet-400 to-fuchsia-500' },
  ];

  readonly ttDays = [
    { d: 'Thứ 2', date: '28/09', n: 2 },
    { d: 'Thứ 3', date: '29/09', n: 2 },
    { d: 'Thứ 4', date: '30/09', n: 1 },
    { d: 'Thứ 5', date: '01/10', n: 2 },
    { d: 'Thứ 6', date: '02/10', n: 2 },
    { d: 'Thứ 7', date: '03/10', n: 1 },
    { d: 'Chủ nhật', date: '04/10', n: 0 },
  ];
  /** [dayIndex, slotIndex, tone, code, name, icon] */
  readonly ttClasses: { day: number; slot: number; tone: number; code: string; name: string; icon: string }[] = [
    { day: 0, slot: 0, tone: 4, code: 'MKT110_HK1_26.27', name: 'Marketing căn bản', icon: I.book },
    { day: 0, slot: 1, tone: 5, code: 'NET101_HK1_26.27', name: 'Mạng máy tính', icon: I.code },
    { day: 1, slot: 0, tone: 2, code: 'DES130_HK1_26.27', name: 'Thiết kế đồ họa 2D', icon: I.db },
    { day: 1, slot: 1, tone: 1, code: 'DB203_HK1_26.27', name: 'Cơ sở dữ liệu', icon: I.monitor },
    { day: 2, slot: 0, tone: 5, code: 'NET101_HK1_26.27', name: 'Mạng máy tính', icon: I.code },
    { day: 3, slot: 0, tone: 4, code: 'MKT110_HK1_26.27', name: 'Marketing căn bản', icon: I.book },
    { day: 3, slot: 2, tone: 0, code: 'WEB202_HK1_26.27', name: 'Lập trình Web', icon: I.code },
    { day: 4, slot: 1, tone: 4, code: 'ACC120_HK1_26.27', name: 'Nguyên lý kế toán', icon: I.book },
    { day: 4, slot: 2, tone: 1, code: 'DB203_HK1_26.27', name: 'Cơ sở dữ liệu', icon: I.monitor },
    { day: 5, slot: 0, tone: 2, code: 'DES130_HK1_26.27', name: 'Thiết kế đồ họa 2D', icon: I.db },
  ];
  readonly ttSlots = [
    ['07:00', '11:30'],
    ['13:00', '17:30'],
    ['18:00', '21:00'],
  ];

  readonly cases = [
    { name: 'Nguyễn Văn An', code: 'SV180123', note: 'Vắng 3 buổi · NET101', status: 'Đang chăm sóc', tone: 'bg-violet-100 text-violet-700', av: 'from-amber-400 to-orange-500', on: true },
    { name: 'Trần Thị Mai', code: 'SV180456', note: 'Nguy cơ cấm thi · DB203', status: 'Chờ chỉ đạo', tone: 'bg-amber-100 text-amber-700', av: 'from-pink-400 to-rose-500', on: false },
    { name: 'Lê Minh Quân', code: 'SV180789', note: 'Vắng 2 buổi · WEB202', status: 'Chờ duyệt kết thúc', tone: 'bg-sky-100 text-sky-700', av: 'from-sky-400 to-indigo-500', on: false },
    { name: 'Phạm Gia Huy', code: 'SV180812', note: 'Đã đi học lại', status: 'Đã kết thúc', tone: 'bg-emerald-100 text-emerald-700', av: 'from-emerald-400 to-teal-500', on: false },
  ];

  readonly anCards = [
    { label: 'Hồ sơ chăm sóc', value: 54, tone: 'an-violet', icon: I.users },
    { label: 'Chờ chỉ đạo', value: 12, tone: 'an-amber', icon: I.clock },
    { label: 'Đang chăm sóc', value: 21, tone: 'an-sky', icon: I.phone },
    { label: 'Đã kết thúc', value: 37, tone: 'an-green', icon: I.check },
    { label: 'Mức cấm thi', value: 5, tone: 'an-rose', icon: I.alert },
  ];
  readonly anCourses = [
    { code: 'NET101_HK1_26.27_CT', n: 17 },
    { code: 'ACC120_HK1_26.27_KT', n: 13 },
    { code: 'MKT110_HK1_26.27_TM', n: 8 },
    { code: 'DB203_HK1_26.27_CT2', n: 6 },
  ];
  readonly anReasons = [
    { reason: 'Ốm / Sức khỏe', n: 7 },
    { reason: 'Bận việc gia đình', n: 7 },
    { reason: 'Bận đi làm', n: 5 },
    { reason: 'Lý do khác', n: 9 },
  ];
  readonly anWarnings = [
    { name: 'Trần Thị Mai', code: 'SV180456', course: 'DB203_HK1_26.27_CT2', periods: '12 tiết · 30%', level: 'Cấm thi', color: '#e11d48', care: 'Chờ chỉ đạo' },
    { name: 'Nguyễn Văn An', code: 'SV180123', course: 'NET101_HK1_26.27_CT', periods: '9 tiết · 22%', level: 'Báo phụ huynh', color: '#f59e0b', care: 'Đang chăm sóc' },
  ];

  // ---------- Page turning ----------
  readonly page = signal(0);
  /** Page revealed underneath while the current one peels away. */
  readonly next = signal(1);
  /** Index of the page mid-peel, or -1. */
  readonly peeling = signal(-1);
  paused = false;
  private timer?: ReturnType<typeof setInterval>;
  private peelTimer?: ReturnType<typeof setTimeout>;
  private resize?: ResizeObserver;

  go(target: number) {
    if (target === this.page() || this.peeling() >= 0) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.page.set(target);
      return;
    }
    this.next.set(target);
    this.peeling.set(this.page());
    this.peelTimer = setTimeout(() => {
      this.page.set(target);
      this.peeling.set(-1);
    }, FLIP_MS);
  }

  ngAfterViewInit() {
    const el = this.frame().nativeElement;
    this.resize = new ResizeObserver(([entry]) => this.scale.set(entry.contentRect.width / W));
    this.resize.observe(el);
    this.timer = setInterval(() => {
      if (!this.paused && !document.hidden) this.go((this.page() + 1) % this.pages.length);
    }, PAGE_MS);
  }

  ngOnDestroy() {
    this.resize?.disconnect();
    clearInterval(this.timer);
    clearTimeout(this.peelTimer);
  }

  pct(n: number, list: { n: number }[]) {
    return Math.round((n / Math.max(...list.map((x) => x.n))) * 100);
  }

  classAt(day: number, slot: number) {
    return this.ttClasses.find((c) => c.day === day && c.slot === slot);
  }
}
