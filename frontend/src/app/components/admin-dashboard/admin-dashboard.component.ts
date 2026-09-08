import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription, finalize } from 'rxjs';
import { CrawlerService } from '../../services/crawler.service';
import { ExcelService, ImportByCourseResult } from '../../services/excel.service';
import { StaffService } from '../../services/staff.service';
import { AnalyticsService, AnalyticsSummary } from '../../services/analytics.service';
import { SettingsService } from '../../services/settings.service';
import { CourseGroupService } from '../../services/course-group.service';
import { User, CrawlerProgress, Student, SystemSettings, CourseGroup } from '../../models/types';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-dashboard.component.html',
})
export class AdminDashboardComponent implements OnInit, OnDestroy {
  activeTab: 'crawler' | 'excel' | 'staff' | 'analytics' | 'courses' | 'settings' = 'courses';

  // Global Floating Toast Notification State
  toast = {
    show: false,
    type: 'success' as 'success' | 'error' | 'info',
    title: '',
    message: '',
  };

  triggerToast(type: 'success' | 'error' | 'info', title: string, message: string) {
    this.toast = { show: true, type, title, message };
    setTimeout(() => {
      this.toast.show = false;
    }, 4500);
  }

  // Course Group Management State
  courseGroupList: CourseGroup[] = [];
  filterShift = '';
  searchCourseTerm = '';
  showCourseModal = false;
  editingCourseId = '';
  isSavingCourse = false;
  courseAlertMsg = '';
  modalErrorMsg = '';
  availableDays = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ Nhật'];
  courseForm = {
    groupCode: '',
    courseName: '',
    shift: 'Sáng' as 'Sáng' | 'Chiều' | 'Tối',
    scheduleDays: ['Thứ 2', 'Thứ 4', 'Thứ 6'],
    room: 'A.101',
    startDate: '',
    endDate: '',
    teacherId: '',
    teacherName: '',
  };

  // Enrolled Student Modal State
  showEnrollModal = false;
  activeGroupForEnroll: CourseGroup | null = null;
  classToEnroll = '';
  mssvToEnroll = '';
  enrollAlertMsg = '';

  // System Settings State
  sysSettings: SystemSettings = {
    systemTitle: 'ITC Student Care System',
    schoolName: 'Trường Cao Đẳng Công Nghệ Thông Tin TP.HCM (ITC)',
    departmentName: 'Phòng Đào Tạo & Chăm Sóc Sinh Viên',
    supportHotline: '028 3965 1114',
    supportEmail: 'cskh@itc.edu.vn',
    examBanThreshold: 3,
    parentWarningThreshold: 2,
    taskAssignmentRule: 'round-robin',
    defaultMajorPrefixes: ['501', '602', '502', '601', '401', '402', '701'],
    crawlerMajorPrefixes: ['501', '602', '502', '601', '401', '402', '701'],
    defaultConcurrency: 6,
    defaultYearFilter: '25,26',
    absenceReasons: ['Bệnh/Sức khỏe', 'Việc gia đình', 'Bận đi làm', 'Lý do cá nhân', 'Khác'],
    tags: ['#KhóKhănHọcPhí', '#HọcBổng', '#ĐiLàmĐêm', '#CảnhBáoVắng', '#CầnHỗTrợĐặcBiệt'],
  };
  isSavingSettings = false;
  settingsSaveAlert = '';
  newReasonInput = '';

  // Crawler Config State
  majorPrefixes: string[] = ['501', '602', '502', '601', '401', '402', '701'];
  newPrefixInput = '';
  selectedYears = '25,26';
  startSeq = 1;
  endSeq = 50;
  concurrency = 6;

  isScanning = false;
  crawlerProgress: CrawlerProgress | null = null;
  liveFoundStudents: Student[] = [];
  private scanSub?: Subscription;

  // Excel State (legacy)
  isDownloadingExcel = false;
  isUploadingExcel = false;
  selectedFile: File | null = null;
  excelAlert = '';

  // Excel by Course State (new)
  isDownloadingCourseExcel = false;
  isUploadingCourseExcel = false;
  selectedCourseFile: File | null = null;
  importCourseResult: ImportByCourseResult | null = null;

  // Staff State
  newStaffName = '';
  newStaffEmail = '';
  newStaffPass = '';
  newStaffRole: 'staff' | 'teacher' = 'staff';
  isCreatingStaff = false;
  staffCreatedMsg = '';
  staffGeneratedPass = '';
  staffList: User[] = [];

  showEditStaffModal = false;
  editingStaffId = '';
  editStaffName = '';
  editStaffEmail = '';
  editStaffPass = '';
  editStaffRole: 'staff' | 'teacher' = 'staff';
  isUpdatingStaff = false;

  // SystemConfig Tag & Prefix Inputs
  newTagInput = '';
  newPrefixInputConfig = '';

  // Class & Exception Student Assignment & Handover State
  availableHomeClasses: string[] = [];
  showAssignClassModal = false;
  selectedStaffForClassAssign: User | null = null;
  selectedHomeClassesForAssign: string[] = [];

  allAvailableStudents: any[] = [];
  showAssignStudentModal = false;
  selectedStaffForStudentAssign: User | null = null;
  selectedStudentsForAssign: string[] = [];
  studentSearchQuery = '';

  showHandoverModal = false;
  handoverFromStaffId = '';
  handoverToStaffId = '';
  handoverClassesToTransfer: string[] = [];
  isExecutingHandover = false;

  // Analytics State
  analyticsData: AnalyticsSummary | null = null;
  isExportingCareReport = false;
  isRefreshingAnalytics = false;
  lastAnalyticsUpdate: Date | null = null;
  private analyticsInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private crawlerService: CrawlerService,
    private excelService: ExcelService,
    private staffService: StaffService,
    private analyticsService: AnalyticsService,
    private settingsService: SettingsService,
    private courseGroupService: CourseGroupService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadStaffList();
    this.loadAnalytics();
    this.loadSettings();
    this.loadCourseGroups();
  }

  ngOnDestroy(): void {
    this.stopCrawler();
    if (this.analyticsInterval) clearInterval(this.analyticsInterval);
  }

  switchTab(tab: 'crawler' | 'excel' | 'staff' | 'analytics' | 'courses' | 'settings') {
    this.activeTab = tab;
    // Dừng auto-refresh cũ khi đổi tab
    if (this.analyticsInterval) {
      clearInterval(this.analyticsInterval);
      this.analyticsInterval = null;
    }
    if (tab === 'analytics') {
      this.loadAnalytics();
      // Auto-refresh mỗi 60 giây khi đang ở tab analytics
      this.analyticsInterval = setInterval(() => this.loadAnalytics(), 60000);
    } else if (tab === 'settings') {
      this.loadSettings();
    } else if (tab === 'courses' || tab === 'excel') {
      this.loadCourseGroups();
    }
  }

  // Course Group Management Methods
  loadCourseGroups() {
    this.courseGroupService.getCourseGroups(this.filterShift, this.searchCourseTerm).subscribe({
      next: (list) => {
        this.courseGroupList = list;
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Load course groups error:', err),
    });
  }

  getPrimaryDayFromDate(dateStr: string): string {
    if (!dateStr) return '';
    const dt = new Date(dateStr);
    if (isNaN(dt.getTime())) return '';
    const dayNames = ['Chủ Nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
    return dayNames[dt.getDay()];
  }

  onStartDateChange() {
    const fixedDay = this.getPrimaryDayFromDate(this.courseForm.startDate);
    if (fixedDay) {
      if (!this.courseForm.scheduleDays.includes(fixedDay)) {
        this.courseForm.scheduleDays.push(fixedDay);
      }
    }
    this.cdr.detectChanges();
  }

  openCourseModal(group?: CourseGroup) {
    this.modalErrorMsg = '';
    this.isSavingCourse = false;
    if (group) {
      this.editingCourseId = group._id || group._id || '';
      let tId = '';
      if (group.teacherId) {
        tId =
          typeof group.teacherId === 'string'
            ? group.teacherId
            : group.teacherId._id || group.teacherId.id || '';
      }
      const formatDateStr = (d?: string | Date) => {
        if (!d) return '';
        const dt = new Date(d);
        return isNaN(dt.getTime()) ? '' : dt.toISOString().split('T')[0];
      };

      this.courseForm = {
        groupCode: group.groupCode,
        courseName: group.courseName || '',
        shift: group.shift || 'Sáng',
        scheduleDays: group.scheduleDays ? [...group.scheduleDays] : ['Thứ 2', 'Thứ 4', 'Thứ 6'],
        room: group.room || 'A.101',
        startDate: formatDateStr(group.startDate),
        endDate: formatDateStr(group.endDate),
        teacherId: tId,
        teacherName: group.teacherName || '',
      };
    } else {
      this.editingCourseId = '';
      const todayStr = new Date().toISOString().split('T')[0];
      const endDt = new Date();
      endDt.setMonth(endDt.getMonth() + 3);
      const endStr = endDt.toISOString().split('T')[0];

      this.courseForm = {
        groupCode: '',
        courseName: '',
        shift: 'Sáng',
        scheduleDays: ['Thứ 2', 'Thứ 4', 'Thứ 6'],
        room: 'A.101',
        startDate: todayStr,
        endDate: endStr,
        teacherId: '',
        teacherName: '',
      };
    }
    this.onStartDateChange();
    this.showCourseModal = true;
    this.cdr.detectChanges();
  }

  toggleScheduleDay(day: string) {
    const fixedDay = this.getPrimaryDayFromDate(this.courseForm.startDate);
    if (day === fixedDay) {
      this.triggerToast(
        'info',
        'Thứ Học Cố Định',
        'Ngày ' + day + ' là thứ trùng với Ngày bắt đầu học phần, không thể tắt!',
      );
      return;
    }
    if (this.courseForm.scheduleDays.includes(day)) {
      if (this.courseForm.scheduleDays.length > 1) {
        this.courseForm.scheduleDays = this.courseForm.scheduleDays.filter((d) => d !== day);
      }
    } else {
      this.courseForm.scheduleDays.push(day);
    }
    this.cdr.detectChanges();
  }

  saveCourseGroup() {
    if (this.isSavingCourse) return;
    this.modalErrorMsg = '';
    if (!this.courseForm.groupCode.trim() || !this.courseForm.courseName.trim()) {
      this.modalErrorMsg = '⚠️ Vui lòng nhập đầy đủ Mã Nhóm và Tên Môn Học!';
      this.cdr.detectChanges();
      return;
    }
    this.isSavingCourse = true;
    this.cdr.detectChanges();

    // Safety timeout fallback: reset state after 8 seconds if no response
    const saveTimer = setTimeout(() => {
      if (this.isSavingCourse) {
        this.isSavingCourse = false;
        this.modalErrorMsg =
          '⚠️ Kết nối máy chủ phản hồi chậm hoặc có lỗi xảy ra. Vui lòng thử lại!';
        this.cdr.detectChanges();
      }
    }, 8000);

    if (this.editingCourseId) {
      this.courseGroupService
        .updateCourseGroup(this.editingCourseId, this.courseForm)
        .pipe(
          finalize(() => {
            clearTimeout(saveTimer);
            this.isSavingCourse = false;
            this.cdr.detectChanges();
          }),
        )
        .subscribe({
          next: (res) => {
            this.showCourseModal = false;
            const msg = res.message || 'Cập nhật thông tin học phần thành công!';
            this.courseAlertMsg = msg;
            this.triggerToast('success', 'Thành Công!', msg);
            setTimeout(() => (this.courseAlertMsg = ''), 5000);
            this.loadCourseGroups();
            this.cdr.detectChanges();
          },
          error: (err) => {
            const errMsg = err.error?.message || err.message || 'Lỗi khi cập nhật học phần';
            this.modalErrorMsg = '⚠️ ' + errMsg;
            this.triggerToast('error', 'Lỗi Cập Nhật', errMsg);
            this.cdr.detectChanges();
          },
        });
    } else {
      this.courseGroupService
        .createCourseGroup(this.courseForm)
        .pipe(
          finalize(() => {
            clearTimeout(saveTimer);
            this.isSavingCourse = false;
            this.cdr.detectChanges();
          }),
        )
        .subscribe({
          next: (res) => {
            this.showCourseModal = false;
            const msg =
              'Đã thêm thành công học phần ' +
              (res.group?.courseName || '') +
              ' (' +
              (res.group?.groupCode || '') +
              ')!';
            this.courseAlertMsg = msg;
            this.triggerToast('success', 'Tạo Học Phần Thành Công!', msg);
            setTimeout(() => (this.courseAlertMsg = ''), 5000);
            this.loadCourseGroups();
            this.cdr.detectChanges();
          },
          error: (err) => {
            const errMsg = err.error?.message || err.message || 'Lỗi khi tạo học phần mới';
            this.modalErrorMsg = '⚠️ ' + errMsg;
            this.triggerToast('error', 'Lỗi Tạo Học Phần', errMsg);
            this.cdr.detectChanges();
          },
        });
    }
  }

  deleteCourseGroup(id: string) {
    if (!confirm('Bạn có chắc chắn muốn xóa nhóm học phần này?')) return;
    this.courseGroupService.deleteCourseGroup(id).subscribe({
      next: (res) => {
        this.courseAlertMsg = res.message;
        setTimeout(() => (this.courseAlertMsg = ''), 4000);
        this.loadCourseGroups();
      },
      error: (err) => alert(err.error?.message || 'Lỗi khi xóa học phần'),
    });
  }

  // Enrolled Student Modal Logic
  openEnrollModal(group: CourseGroup) {
    this.activeGroupForEnroll = group;
    this.classToEnroll = '';
    this.mssvToEnroll = '';
    this.enrollAlertMsg = '';
    this.showEnrollModal = true;
  }

  enrollEntireClass() {
    if (!this.activeGroupForEnroll || !this.classToEnroll.trim()) return;
    this.courseGroupService
      .assignClass(this.activeGroupForEnroll._id, this.classToEnroll.trim())
      .subscribe({
        next: (res) => {
          this.activeGroupForEnroll = res.group;
          this.enrollAlertMsg = res.message;
          this.classToEnroll = '';
          this.loadCourseGroups();
        },
        error: (err) => alert(err.error?.message || 'Không thể đăng ký cả lớp vào môn học'),
      });
  }

  enrollSingleStudent() {
    if (!this.activeGroupForEnroll || !this.mssvToEnroll.trim()) return;
    this.courseGroupService
      .assignStudent(this.activeGroupForEnroll._id, { studentCode: this.mssvToEnroll.trim() })
      .subscribe({
        next: (res) => {
          this.activeGroupForEnroll = res.group;
          this.enrollAlertMsg = res.message;
          this.mssvToEnroll = '';
          this.loadCourseGroups();
        },
        error: (err) => alert(err.error?.message || 'Không tìm thấy sinh viên với MSSV này'),
      });
  }

  unenrollStudent(studentId: string) {
    if (!this.activeGroupForEnroll) return;
    this.courseGroupService.removeStudent(this.activeGroupForEnroll._id, studentId).subscribe({
      next: (res) => {
        this.activeGroupForEnroll = res.group;
        this.enrollAlertMsg = res.message;
        this.loadCourseGroups();
      },
      error: (err) => alert(err.error?.message || 'Lỗi khi rút tên sinh viên'),
    });
  }

  // System Settings Logic
  loadSettings() {
    this.settingsService.getSettings().subscribe({
      next: (s) => {
        if (s) {
          this.sysSettings = s;
          if (s.defaultMajorPrefixes && s.defaultMajorPrefixes.length > 0) {
            this.majorPrefixes = [...s.defaultMajorPrefixes];
          }
          if (s.defaultConcurrency) {
            this.concurrency = s.defaultConcurrency;
          }
          if (s.defaultYearFilter) {
            this.selectedYears = s.defaultYearFilter;
          }
        }
      },
      error: (err) => console.error('Load settings error:', err),
    });
  }

  saveSettings() {
    this.isSavingSettings = true;
    this.settingsSaveAlert = '';
    this.sysSettings.defaultMajorPrefixes = [...this.majorPrefixes];
    this.sysSettings.defaultConcurrency = this.concurrency;
    this.sysSettings.defaultYearFilter = this.selectedYears;

    this.settingsService.updateSettings(this.sysSettings).subscribe({
      next: (res) => {
        this.isSavingSettings = false;
        this.settingsSaveAlert = res.message || 'Đã lưu cấu hình thành công!';
        setTimeout(() => (this.settingsSaveAlert = ''), 4000);
      },
      error: (err) => {
        this.isSavingSettings = false;
        alert(err.error?.message || 'Lỗi khi lưu cấu hình');
      },
    });
  }

  addAbsenceReason() {
    const val = this.newReasonInput.trim();
    if (!this.sysSettings.absenceReasons) this.sysSettings.absenceReasons = [];
    if (val && !this.sysSettings.absenceReasons.includes(val)) {
      this.sysSettings.absenceReasons.push(val);
      this.newReasonInput = '';
    }
  }

  removeAbsenceReason(reason: string) {
    if (this.sysSettings.absenceReasons) {
      this.sysSettings.absenceReasons = this.sysSettings.absenceReasons.filter((r) => r !== reason);
    }
  }

  addTag() {
    let val = this.newTagInput.trim();
    if (!val) return;
    if (!val.startsWith('#')) val = '#' + val;
    if (!this.sysSettings.tags) this.sysSettings.tags = [];
    if (!this.sysSettings.tags.includes(val)) {
      this.sysSettings.tags.push(val);
      this.newTagInput = '';
    }
  }

  removeTag(tag: string) {
    if (this.sysSettings.tags) {
      this.sysSettings.tags = this.sysSettings.tags.filter((t) => t !== tag);
    }
  }

  addCrawlerPrefix() {
    const val = this.newPrefixInputConfig.trim();
    if (!this.sysSettings.crawlerMajorPrefixes) this.sysSettings.crawlerMajorPrefixes = [];
    if (val && !this.sysSettings.crawlerMajorPrefixes.includes(val)) {
      this.sysSettings.crawlerMajorPrefixes.push(val);
      this.newPrefixInputConfig = '';
    }
  }

  removeCrawlerPrefix(prefix: string) {
    if (this.sysSettings.crawlerMajorPrefixes) {
      this.sysSettings.crawlerMajorPrefixes = this.sysSettings.crawlerMajorPrefixes.filter(
        (p) => p !== prefix,
      );
    }
  }

  // Major Prefixes Tag Panel (Legacy Crawler tab)
  addMajorPrefix() {
    const val = this.newPrefixInput.trim();
    if (val && val.length === 3 && !this.majorPrefixes.includes(val)) {
      this.majorPrefixes.push(val);
      this.newPrefixInput = '';
    }
  }

  removeMajorPrefix(index: number) {
    if (this.majorPrefixes.length > 1) {
      this.majorPrefixes.splice(index, 1);
    }
  }

  // Class Assignment & Handover Logic
  loadClassAssignments() {
    this.staffService.getClassAssignments().subscribe({
      next: (res) => {
        this.staffList = res.staffs;
        this.availableHomeClasses = res.availableClasses;
        this.allAvailableStudents = res.allStudents || [];
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Load class assignments error:', err),
    });
  }

  openAssignClassModal(staff: User) {
    this.selectedStaffForClassAssign = staff;
    this.selectedHomeClassesForAssign = [...(staff.managedClasses || [])];
    this.showAssignClassModal = true;
    this.cdr.detectChanges();
  }

  toggleClassSelectionForAssign(classCode: string) {
    if (this.selectedHomeClassesForAssign.includes(classCode)) {
      this.selectedHomeClassesForAssign = this.selectedHomeClassesForAssign.filter(
        (c) => c !== classCode,
      );
    } else {
      this.selectedHomeClassesForAssign.push(classCode);
    }
  }

  saveClassAssignment() {
    if (!this.selectedStaffForClassAssign) return;
    const staffId =
      this.selectedStaffForClassAssign._id || this.selectedStaffForClassAssign.id || '';
    this.staffService.assignManagedClasses(staffId, this.selectedHomeClassesForAssign).subscribe({
      next: (res) => {
        this.showAssignClassModal = false;
        this.triggerToast('success', 'Phân Công Lớp Thành Công!', res.message);
        this.loadClassAssignments();
      },
      error: (err) =>
        this.triggerToast('error', 'Lỗi Phân Công Lớp', err.error?.message || 'Lỗi gán lớp'),
    });
  }

  // Student Exception Assignment Methods
  openAssignStudentModal(staff: User) {
    this.selectedStaffForStudentAssign = staff;
    this.selectedStudentsForAssign = (staff.managedStudents || []).map((s: any) =>
      typeof s === 'string' ? s : s._id || s.id,
    );
    this.studentSearchQuery = '';
    this.showAssignStudentModal = true;
    this.cdr.detectChanges();
  }

  toggleStudentSelectionForAssign(studentId: string) {
    if (this.selectedStudentsForAssign.includes(studentId)) {
      this.selectedStudentsForAssign = this.selectedStudentsForAssign.filter(
        (id) => id !== studentId,
      );
    } else {
      this.selectedStudentsForAssign.push(studentId);
    }
  }

  saveStudentAssignment() {
    if (!this.selectedStaffForStudentAssign) return;
    const staffId =
      this.selectedStaffForStudentAssign._id || this.selectedStaffForStudentAssign.id || '';
    this.staffService.assignManagedStudents(staffId, this.selectedStudentsForAssign).subscribe({
      next: (res) => {
        this.showAssignStudentModal = false;
        this.triggerToast('success', 'Phân Công Ngoại Lệ SV Thành Công!', res.message);
        this.loadClassAssignments();
      },
      error: (err) =>
        this.triggerToast(
          'error',
          'Lỗi Phân Công SV Ngoại Lệ',
          err.error?.message || 'Lỗi gán sinh viên',
        ),
    });
  }

  get filteredStudentsForAssign(): any[] {
    if (!this.studentSearchQuery) return this.allAvailableStudents;
    const q = this.studentSearchQuery.toLowerCase().trim();
    return this.allAvailableStudents.filter(
      (st) =>
        (st.studentCode && st.studentCode.toLowerCase().includes(q)) ||
        (st.fullName && st.fullName.toLowerCase().includes(q)) ||
        (st.classCode && st.classCode.toLowerCase().includes(q)),
    );
  }

  getStudentCodeDisplay(st: any): string {
    if (!st) return '';
    return typeof st === 'string' ? st : st.studentCode || st._id;
  }

  getStudentDisplayName(st: any): string {
    if (!st || typeof st === 'string') return '';
    return `${st.studentCode} - ${st.fullName} (${st.classCode})`;
  }

  openHandoverModal(staff?: User) {
    this.handoverFromStaffId = staff ? staff._id || staff.id || '' : '';
    this.handoverToStaffId = '';
    this.onHandoverFromStaffChange();
    this.showHandoverModal = true;
    this.cdr.detectChanges();
  }

  onHandoverFromStaffChange() {
    const fromStaff = this.staffList.find((s) => (s._id || s.id) === this.handoverFromStaffId);
    this.handoverClassesToTransfer = fromStaff ? [...(fromStaff.managedClasses || [])] : [];
  }

  executeHandover() {
    if (!this.handoverFromStaffId || !this.handoverToStaffId) {
      this.triggerToast('error', 'Bàn Giao Lớp', 'Vui lòng chọn nhân viên giao và nhân viên nhận!');
      return;
    }
    if (this.handoverFromStaffId === this.handoverToStaffId) {
      this.triggerToast('error', 'Bàn Giao Lớp', 'Nhân viên bàn giao và tiếp nhận phải khác nhau!');
      return;
    }
    this.isExecutingHandover = true;
    this.staffService
      .transferClasses({
        fromStaffId: this.handoverFromStaffId,
        toStaffId: this.handoverToStaffId,
        classCodes: this.handoverClassesToTransfer,
      })
      .subscribe({
        next: (res) => {
          this.isExecutingHandover = false;
          this.showHandoverModal = false;
          this.triggerToast('success', 'Bàn Giao Thành Công!', res.message);
          this.loadClassAssignments();
        },
        error: (err) => {
          this.isExecutingHandover = false;
          this.triggerToast('error', 'Lỗi Bàn Giao', err.error?.message || 'Bàn giao lớp thất bại');
        },
      });
  }

  // Component 1: Concurrency Crawler & Live Stream Table
  startCrawler() {
    this.isScanning = true;
    this.crawlerProgress = null;
    this.liveFoundStudents = [];

    const prefixesStr = this.majorPrefixes.join(',');

    this.scanSub = this.crawlerService
      .startScan(this.selectedYears, prefixesStr, this.startSeq, this.endSeq, this.concurrency)
      .subscribe({
        next: (event) => {
          this.crawlerProgress = event;

          if (event.batchFound && event.batchFound.length > 0) {
            // Push newly found students to the top of the live stream table
            for (const st of event.batchFound) {
              if (!this.liveFoundStudents.some((s) => s.studentCode === st.studentCode)) {
                this.liveFoundStudents.unshift(st);
              }
            }
          }

          if (event.completed) {
            this.isScanning = false;
          }
        },
        error: (err) => {
          console.error('Crawler SSE error:', err);
          this.isScanning = false;
        },
      });
  }

  // Abort Controller / Stop Scan Action
  stopCrawler() {
    if (this.scanSub) {
      this.scanSub.unsubscribe();
      this.scanSub = undefined;
    }
    this.isScanning = false;
  }

  // Analytics & Care Report logic
  loadAnalytics() {
    this.isRefreshingAnalytics = true;
    this.cdr.detectChanges();
    this.analyticsService.getAnalyticsSummary().subscribe({
      next: (data) => {
        this.analyticsData = data;
        this.lastAnalyticsUpdate = new Date();
        this.isRefreshingAnalytics = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Load analytics error:', err);
        this.isRefreshingAnalytics = false;
        this.cdr.detectChanges();
      },
    });
  }

  get maxAbsenceCount(): number {
    if (!this.analyticsData?.courseAbsenceStats?.length) return 1;
    return Math.max(...this.analyticsData.courseAbsenceStats.map((s) => s.absentCount), 1);
  }

  get maxReasonCount(): number {
    if (!this.analyticsData?.reasonStats?.length) return 1;
    return Math.max(...this.analyticsData.reasonStats.map((s) => s.count), 1);
  }

  calcPercentage(val: number, maxVal: number): number {
    if (!maxVal) return 0;
    return Math.min(Math.round((val / maxVal) * 100), 100);
  }

  downloadCareReport() {
    this.isExportingCareReport = true;
    this.analyticsService.exportCareReport().subscribe({
      next: (blob) => {
        this.isExportingCareReport = false;
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'Bao_Cao_Tong_Hop_Cham_Soc_Sinh_Vien.xlsx';
        a.click();
        window.URL.revokeObjectURL(url);
      },
      error: (err) => {
        this.isExportingCareReport = false;
        alert('Không thể xuất báo cáo chăm sóc Excel');
      },
    });
  }

  // Component 2: Excel logic
  downloadExcelTemplate() {
    this.isDownloadingExcel = true;
    this.excelService.exportTemplate().subscribe({
      next: (blob) => {
        this.isDownloadingExcel = false;
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'Danh_Sach_Sinh_Vien_Theo_Lop.xlsx';
        a.click();
        window.URL.revokeObjectURL(url);
      },
      error: (err) => {
        this.isDownloadingExcel = false;
        alert('Không thể xuất file Excel mẫu');
      },
    });
  }

  /** Download course-based Excel template */
  downloadCourseTemplate() {
    this.isDownloadingCourseExcel = true;
    this.excelService.exportCourseTemplate().subscribe({
      next: (blob) => {
        this.isDownloadingCourseExcel = false;
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Mau_Nhap_SV_Theo_HocPhan_${new Date().toISOString().split('T')[0]}.xlsx`;
        a.click();
        window.URL.revokeObjectURL(url);
      },
      error: (err) => {
        this.isDownloadingCourseExcel = false;
        this.triggerToast(
          'error',
          'Lỗi Xuất File',
          err.error?.message || 'Không thể tạo file mẫu Excel',
        );
      },
    });
  }

  onFileSelected(event: any) {
    if (event.target.files && event.target.files.length > 0) {
      this.selectedFile = event.target.files[0];
    }
  }

  onCourseFileSelected(event: any) {
    if (event.target.files && event.target.files.length > 0) {
      this.selectedCourseFile = event.target.files[0];
      this.importCourseResult = null;
    }
  }

  uploadExcelFile() {
    if (!this.selectedFile) return;
    this.isUploadingExcel = true;
    this.excelAlert = '';

    this.excelService.importData(this.selectedFile).subscribe({
      next: (res) => {
        this.isUploadingExcel = false;
        this.excelAlert = res.message;
        this.selectedFile = null;
        this.loadCourseGroups();
      },
      error: (err) => {
        this.isUploadingExcel = false;
        alert(err.error?.message || 'Lỗi khi đồng bộ file Excel');
      },
    });
  }

  /** Upload file Excel theo học phần (new flow) */
  uploadByCourse() {
    if (!this.selectedCourseFile) return;
    this.isUploadingCourseExcel = true;
    this.importCourseResult = null;

    this.excelService.importByCourse(this.selectedCourseFile).subscribe({
      next: (res) => {
        this.isUploadingCourseExcel = false;
        this.importCourseResult = res;
        this.triggerToast('success', 'Upload Thành Công!', res.message);
        this.loadCourseGroups();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.isUploadingCourseExcel = false;
        const msg = err.error?.message || 'Lỗi khi đồng bộ file Excel theo học phần';
        this.triggerToast('error', 'Lỗi Upload', msg);
        this.cdr.detectChanges();
      },
    });
  }

  // Component 3: Staff Management logic
  loadStaffList() {
    this.staffService.getStaffList().subscribe({
      next: (list) => {
        this.staffList = list;
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Load staff error:', err),
    });
  }

  copyPasswordToClipboard(pass: string) {
    if (!pass) return;
    navigator.clipboard
      .writeText(pass)
      .then(() => {
        this.triggerToast(
          'success',
          'Đã Sao Chép!',
          'Mật khẩu đã được lưu vào khay nhớ tạm (Clipboard).',
        );
      })
      .catch(() => {
        this.triggerToast('info', 'Mật Khẩu', pass);
      });
  }

  createStaffAccount() {
    if (!this.newStaffName.trim() || !this.newStaffEmail.trim()) return;
    this.isCreatingStaff = true;
    this.staffCreatedMsg = '';
    this.staffGeneratedPass = '';
    this.cdr.detectChanges();

    const payload = {
      fullName: this.newStaffName.trim(),
      email: this.newStaffEmail.trim(),
      customPassword: this.newStaffPass.trim() || undefined,
      role: this.newStaffRole,
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
          this.staffCreatedMsg = res.message;
          if (res.generatedPassword) {
            this.staffGeneratedPass = res.generatedPassword;
          }
          this.triggerToast('success', 'Tạo Nhân Viên Thành Công!', res.message);
          this.newStaffName = '';
          this.newStaffEmail = '';
          this.newStaffPass = '';
          this.newStaffRole = 'staff';
          this.loadStaffList();
          this.cdr.detectChanges();
        },
        error: (err) => {
          const errMsg = err.error?.message || err.message || 'Không thể tạo nhân viên';
          this.triggerToast('error', 'Lỗi Tạo Nhân Viên', errMsg);
          alert('⚠️ ' + errMsg);
          this.cdr.detectChanges();
        },
      });
  }

  openEditStaffModal(staff: User) {
    this.editingStaffId = staff.id || (staff as any)._id || '';
    this.editStaffName = staff.fullName;
    this.editStaffEmail = staff.email;
    this.editStaffPass = '';
    this.editStaffRole = staff.role === 'teacher' ? 'teacher' : 'staff';
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
          this.triggerToast('success', 'Thành Công!', msg);
          if (this.editStaffPass.trim()) {
            this.staffCreatedMsg =
              'Đã cập nhật thông tin và mật khẩu mới cho ' + this.editStaffName + '!';
            this.staffGeneratedPass = this.editStaffPass.trim();
          }
          this.loadStaffList();
          this.cdr.detectChanges();
        },
        error: (err) => {
          alert('⚠️ ' + (err.error?.message || 'Lỗi khi cập nhật nhân viên'));
          this.cdr.detectChanges();
        },
      });
  }

  resetStaffPassword(staff: User) {
    const customPass = prompt(
      'Nhập mật khẩu mới cho nhân viên "' +
        staff.fullName +
        '" (để trống nếu muốn tự động sinh ngẫu nhiên):',
      '',
    );
    if (customPass === null) return; // User cancelled

    const targetId = staff.id || (staff as any)._id || '';
    this.staffService.resetStaffPassword(targetId, customPass).subscribe({
      next: (res) => {
        this.staffCreatedMsg = 'Đã đặt lại mật khẩu cho nhân viên ' + staff.fullName + '!';
        this.staffGeneratedPass = res.newPassword;
        this.triggerToast('success', 'Reset Mật Khẩu Thành Công!', res.message);
        this.copyPasswordToClipboard(res.newPassword);
        this.loadStaffList();
        this.cdr.detectChanges();
      },
      error: (err) => {
        const msg =
          err.error?.message || err.statusText || 'Không thể kết nối đến máy chủ API backend';
        alert('⚠️ Lỗi đặt lại mật khẩu: ' + msg);
        this.triggerToast('error', 'Lỗi Reset Mật Khẩu', msg);
        this.cdr.detectChanges();
      },
    });
  }

  toggleStaffStatus(staff: User) {
    const newStatus = staff.status === 'active' ? 'inactive' : 'active';
    this.staffService.toggleStaffStatus(staff.id || (staff as any)._id, newStatus).subscribe({
      next: () => {
        this.loadStaffList();
        this.cdr.detectChanges();
      },
      error: (err) => {
        const msg = err.error?.message || err.statusText || 'Lỗi cập nhật trạng thái';
        alert('⚠️ ' + msg);
        this.cdr.detectChanges();
      },
    });
  }

  deleteStaffAccount(staff: User) {
    if (
      !confirm(
        '⚠️ BẠN CÓ CHẮC CHẮN MUỐN XÓA VĨNH VIỄN TÀI KHOẢN NHÂN VIÊN "' +
          staff.fullName +
          '" (' +
          staff.email +
          ')?',
      )
    )
      return;
    const targetId = staff.id || (staff as any)._id || '';
    this.staffService.deleteStaff(targetId).subscribe({
      next: (res) => {
        this.triggerToast('success', 'Đã Xóa Nhân Viên', res.message);
        this.loadStaffList();
        this.cdr.detectChanges();
      },
      error: (err) => {
        const msg = err.error?.message || err.statusText || 'Không thể xóa tài khoản nhân viên';
        alert('⚠️ Lỗi xóa nhân viên: ' + msg);
        this.triggerToast('error', 'Lỗi Xóa Nhân Viên', msg);
        this.cdr.detectChanges();
      },
    });
  }
}
