import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CallTaskService } from '../../services/call-task.service';
import { AuthService } from '../../services/auth.service';
import { SettingsService } from '../../services/settings.service';
import { CallTask, Student360Profile, SystemSettings } from '../../models/types';

@Component({
  selector: 'app-call-task',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="max-w-6xl mx-auto px-4 py-6 space-y-5 bg-slate-50">
      <!-- Title Header -->
      <div class="bg-white border border-slate-200 p-5 rounded-md shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div class="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-900 text-xs font-bold border border-slate-300 uppercase">
            📞 EDUCATION CRM - HỆ THỐNG CSKH VĂN PHÒNG 360°
          </div>
          <h2 class="text-xl md:text-2xl font-bold text-slate-900 mt-1 uppercase tracking-tight">Danh Sách Nhiệm Vụ Được Phân Công</h2>
          <p class="text-xs text-slate-600">Thứ tự ưu tiên xử lý: Đến Hạn Gọi Lại ➔ Chưa Gọi ➔ Không Bắt Máy ➔ Đã Liên Hệ</p>
        </div>
        <button
          (click)="loadTasks()"
          class="px-3.5 py-2 rounded-md bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold shadow-sm transition-all"
        >
          🔄 Cập nhật danh sách
        </button>
      </div>

      <!-- Overview Metric Cards -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div class="bg-white border border-slate-200 p-4 rounded-md text-center space-y-1 shadow-sm">
          <div class="text-[11px] text-slate-500 font-bold uppercase">Tổng Nhiệm Vụ</div>
          <div class="text-xl font-bold text-slate-900">{{ tasks.length }}</div>
        </div>
        <div class="bg-amber-50 border border-amber-200 p-4 rounded-md text-center space-y-1 shadow-sm">
          <div class="text-[11px] text-amber-800 font-bold uppercase">Chưa Gọi</div>
          <div class="text-xl font-bold text-amber-900">{{ pendingCount }}</div>
        </div>
        <div class="bg-red-50 border border-red-200 p-4 rounded-md text-center space-y-1 shadow-sm">
          <div class="text-[11px] text-red-800 font-bold uppercase">📅 Hạn Gọi Lại Hôm Nay</div>
          <div class="text-xl font-bold text-red-900">{{ callbackDueCount }}</div>
        </div>
        <div class="bg-emerald-50 border border-emerald-200 p-4 rounded-md text-center space-y-1 shadow-sm">
          <div class="text-[11px] text-emerald-800 font-bold uppercase">Đã Liên Hệ</div>
          <div class="text-xl font-bold text-emerald-900">{{ doneCount }}</div>
        </div>
      </div>

      <!-- ADVANCED FILTER BAR -->
      <div class="bg-white border border-slate-200 p-4 rounded-md shadow-sm space-y-3">
        <div class="text-xs font-bold text-slate-700 uppercase">Bộ Lọc Tác Vụ Gọi Nâng Cao:</div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input
            type="text"
            [(ngModel)]="filterClassCode"
            (input)="applyFilters()"
            placeholder="🔍 Lọc theo Lớp (VD: CD25CT1)..."
            class="px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 bg-slate-50 focus:bg-white focus:outline-none"
          />
          <input
            type="text"
            [(ngModel)]="filterGroupCode"
            (input)="applyFilters()"
            placeholder="📚 Lọc theo Môn/Nhóm học phần..."
            class="px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 bg-slate-50 focus:bg-white focus:outline-none"
          />
          <select
            [(ngModel)]="filterStatus"
            (change)="applyFilters()"
            class="px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 bg-slate-50 focus:bg-white focus:outline-none"
          >
            <option value="">Tất cả Trạng thái</option>
            <option value="Chưa gọi">⏳ Chưa gọi</option>
            <option value="Không bắt máy">⚠️ Không bắt máy</option>
            <option value="Đã liên hệ">✅ Đã liên hệ</option>
          </select>
        </div>
      </div>

      <!-- Task Cards List -->
      <div class="space-y-4">
        <div
          *ngFor="let task of tasks; let i = index"
          class="bg-white p-6 rounded-2xl border space-y-5 transition-all shadow-sm relative overflow-hidden"
          [ngClass]="{
            'ring-2 ring-rose-500 border-rose-400 bg-rose-50/20': task.isCallbackDue,
            'border-amber-300 bg-amber-50/20': !task.isCallbackDue && task.callStatus === 'Chưa gọi',
            'border-orange-300 bg-orange-50/20': !task.isCallbackDue && task.callStatus === 'Không bắt máy',
            'border-emerald-300 bg-emerald-50/20': !task.isCallbackDue && task.callStatus === 'Đã liên hệ'
          }"
        >
          <!-- Priority Status Header Tag -->
          <div class="flex items-center justify-between flex-wrap gap-3 border-b border-slate-200 pb-3">
            <div class="flex items-center space-x-2 flex-wrap gap-2">
              <span class="text-xs font-bold px-2.5 py-1 rounded bg-slate-900 text-white">#{{ i + 1 }}</span>

              <!-- Callback Due Priority Badge -->
              <span *ngIf="task.isCallbackDue" class="px-3 py-1 rounded-full text-xs font-black bg-rose-600 text-white animate-pulse shadow-sm flex items-center gap-1">
                📅 ĐẾN HẠN GỌI LẠI ({{ task.callbackDate | date: 'dd/MM/yyyy' }})
              </span>

              <span
                class="badge"
                [ngClass]="{
                  'badge-pending': task.callStatus === 'Chưa gọi',
                  'badge-retry': task.callStatus === 'Không bắt máy',
                  'badge-done': task.callStatus === 'Đã liên hệ'
                }"
              >
                {{ task.callStatus === 'Chưa gọi' ? '⏳ CHƯA GỌI' : task.callStatus === 'Không bắt máy' ? '⚠️ KHÔNG BẮT MÁY' : '✅ ĐÃ LIÊN HỆ' }}
              </span>
            </div>

            <div class="flex items-center gap-3">
              <button
                (click)="openStudent360(task.student?._id)"
                class="px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 text-xs font-black transition-all flex items-center gap-1.5 touch-target cursor-pointer"
              >
                <span>🔍 Hồ Sơ Sinh Viên 360°</span>
              </button>

              <div class="text-xs text-slate-600 font-semibold flex items-center gap-3">
                <span>📅 Ngày vắng: <b class="text-slate-900">{{ task.absenceDate | date: 'dd/MM/yyyy' }}</b></span>
                <span>🔄 Số lần gọi: <b class="text-slate-900 px-2 py-0.5 rounded bg-slate-100 border border-slate-200">{{ task.callAttempts || 0 }}</b></span>
              </div>
            </div>
          </div>

          <!-- Student & Course Details -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div class="space-y-2">
              <div class="text-xs text-slate-500 font-bold uppercase">Thông Tin Sinh Viên</div>
              <div class="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                <span>{{ task.student?.fullName || 'Sinh viên' }}</span>
              </div>
              <div class="text-xs text-slate-700 font-semibold">
                MSSV: <code class="text-blue-900 font-bold bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">{{ task.student?.studentCode }}</code> | Lớp: <b>{{ task.student?.classCode }}</b>
              </div>
              <div class="text-xs text-slate-600 font-medium">Ngành: {{ task.student?.major }}</div>

              <!-- Student Tags Display & Toggle Section -->
              <div class="pt-1 space-y-1.5">
                <div class="text-[11px] text-slate-500 font-bold uppercase">Thẻ Nhãn CRM (#Tags):</div>
                <div class="flex flex-wrap items-center gap-1.5">
                  <span
                    *ngFor="let tag of task.student?.tags"
                    class="px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-900 font-bold text-xs border border-purple-200 flex items-center gap-1"
                  >
                    <span>{{ tag }}</span>
                    <button (click)="removeTagFromStudent(task, tag)" class="text-purple-600 hover:text-rose-600 font-black text-[10px]">✖</button>
                  </span>

                  <!-- Quick Add Tag Select -->
                  <select
                    (change)="addTagToStudent(task, $event)"
                    class="text-[11px] font-bold text-purple-900 bg-purple-50 border border-purple-200 rounded px-2 py-0.5 focus:outline-none"
                  >
                    <option value="">+ Gắn Thẻ Nhãn</option>
                    <option *ngFor="let sysTag of sysSettings?.tags" [value]="sysTag">
                      {{ sysTag }}
                    </option>
                  </select>
                </div>
              </div>
            </div>

            <div class="space-y-1">
              <div class="text-xs text-slate-500 font-bold uppercase">Môn Học Bị Vắng</div>
              <div class="text-base font-extrabold text-slate-900">{{ task.courseGroup?.groupCode }}</div>
              <div class="text-xs text-slate-600 font-medium">{{ task.courseGroup?.courseName || 'Nhóm học phần' }}</div>
            </div>

            <!-- Quick Action Tel: Links (Minimum 48x48px Touch Target) -->
            <div class="flex flex-col sm:flex-row md:flex-col gap-2 justify-center">
              <a
                *ngIf="task.student?.phone"
                [href]="'tel:' + task.student?.phone"
                class="px-4 py-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-sm touch-target min-h-[48px]"
              >
                📞 Gọi SV: {{ task.student?.phone }}
              </a>

              <a
                *ngIf="task.student?.parentPhone"
                [href]="'tel:' + task.student?.parentPhone"
                class="px-4 py-3 rounded-xl bg-blue-800 hover:bg-blue-900 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-sm touch-target min-h-[48px]"
              >
                👨‍👩‍👦 Gọi Phụ Huynh: {{ task.student?.parentPhone }}
              </a>

              <span *ngIf="!task.student?.phone && !task.student?.parentPhone" class="text-xs text-rose-700 italic font-semibold">
                ⚠️ Chưa có SĐT trong file Excel import
              </span>
            </div>
          </div>

          <!-- Call Outcome Selection, Reason Dropdown, Callback Date & Note Input -->
          <div class="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-4">
            <div class="flex items-center justify-between flex-wrap gap-2">
              <label class="block text-xs font-bold text-slate-700 uppercase">
                Kết quả Cuộc gọi & Đề xuất Hỗ trợ:
              </label>
              <!-- Status Quick Toggle Buttons -->
              <div class="flex space-x-2">
                <button
                  type="button"
                  (click)="task.callStatus = 'Đã liên hệ'"
                  class="px-3 py-1.5 rounded-lg text-xs font-bold border transition-all touch-target"
                  [ngClass]="task.callStatus === 'Đã liên hệ' ? 'bg-emerald-700 text-white border-emerald-800' : 'bg-white text-slate-700 border-slate-300'"
                >
                  ✅ Đã Bắt Máy
                </button>
                <button
                  type="button"
                  (click)="task.callStatus = 'Không bắt máy'"
                  class="px-3 py-1.5 rounded-lg text-xs font-bold border transition-all touch-target"
                  [ngClass]="task.callStatus === 'Không bắt máy' ? 'bg-orange-600 text-white border-orange-700' : 'bg-white text-slate-700 border-slate-300'"
                >
                  ⚠️ Không Bắt Máy
                </button>
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <!-- Standard Absence Reason Dropdown -->
              <div>
                <label class="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  Nhóm Lý Do Vắng Chuẩn:
                </label>
                <select
                  [(ngModel)]="task.absenceReasonCategory"
                  class="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 bg-white"
                >
                  <option value="">-- Chọn nhóm lý do vắng --</option>
                  <option *ngFor="let reason of sysSettings?.absenceReasons" [value]="reason">
                    📌 {{ reason }}
                  </option>
                </select>
              </div>

              <!-- Callback Date Picker -->
              <div>
                <label class="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  📅 Hẹn Ngày Gọi Lại (Nhắc Việc):
                </label>
                <input
                  type="date"
                  [ngModel]="task.callbackDate | date:'yyyy-MM-dd'"
                  (ngModelChange)="onCallbackDateChange(task, $event)"
                  class="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 bg-white"
                />
              </div>
            </div>

            <!-- Multiline Call Note Textarea -->
            <div>
              <label class="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                Ghi Chú Chi Tiết Phản Hồi Từ Sinh Viên / Phụ Huynh:
              </label>
              <textarea
                [(ngModel)]="task.callNote"
                rows="2"
                placeholder="Nhập chi tiết ý kiến sinh viên, lý do cụ thể hoặc cam kết đi học lại..."
                class="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white"
              ></textarea>
            </div>

            <div class="flex justify-end">
              <button
                (click)="saveTaskUpdate(task)"
                class="px-6 py-2.5 bg-blue-900 hover:bg-blue-950 text-white font-extrabold rounded-xl touch-target text-xs transition-all shadow-sm flex items-center gap-2"
              >
                💾 LƯU KẾT QUẢ & CẬP NHẬT CRM
              </button>
            </div>
          </div>
        </div>

        <div *ngIf="tasks.length === 0" class="p-12 text-center bg-white border border-slate-200 rounded-2xl space-y-3 shadow-sm">
          <div class="text-4xl">🎉</div>
          <h3 class="text-lg font-bold text-slate-900">Không Có Nhiệm Vụ Cuộc Gọi Nào!</h3>
          <p class="text-xs text-slate-500 font-medium">Tất cả nhiệm vụ đã được xử lý hoặc không có kết quả phù hợp bộ lọc.</p>
        </div>
      </div>

      <!-- MODAL: HỒ SƠ SINH VIÊN 360° TIMELINE -->
      <div *ngIf="show360Modal" class="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
        <div class="bg-white rounded-2xl max-w-3xl w-full p-6 md:p-8 shadow-2xl space-y-6 animate-fade-in border border-slate-200 max-h-[90vh] overflow-y-auto">
          <!-- Modal Header -->
          <div class="flex items-start justify-between border-b border-slate-200 pb-4">
            <div class="space-y-1">
              <div class="inline-flex items-center gap-2 px-2.5 py-0.5 rounded bg-indigo-100 text-indigo-900 text-[11px] font-black uppercase">
                🎓 HỒ SƠ SINH VIÊN 360° (EDUCATION CRM)
              </div>
              <h3 class="text-xl md:text-2xl font-black text-slate-900">{{ student360Data?.student?.fullName }}</h3>
              <p class="text-xs text-slate-600 font-bold">
                MSSV: <code class="text-blue-900 bg-slate-100 px-1.5 py-0.5 rounded">{{ student360Data?.student?.studentCode }}</code> | Lớp: <b>{{ student360Data?.student?.classCode }}</b> | Ngành: {{ student360Data?.student?.major }}
              </p>
            </div>
            <button (click)="show360Modal = false" class="text-slate-400 hover:text-slate-700 font-bold text-2xl">✖</button>
          </div>

          <!-- Student Quick Contact & Tags Bar -->
          <div class="p-4 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <span class="text-[11px] text-slate-500 font-bold block uppercase">📱 SĐT Sinh viên:</span>
              <strong class="text-sm text-slate-900 font-mono">{{ student360Data?.student?.phone || 'Chưa cập nhật' }}</strong>
            </div>
            <div>
              <span class="text-[11px] text-slate-500 font-bold block uppercase">👨‍👩‍👦 SĐT Phụ huynh:</span>
              <strong class="text-sm text-blue-900 font-mono">{{ student360Data?.student?.parentPhone || 'Chưa cập nhật' }}</strong>
            </div>
            <div>
              <span class="text-[11px] text-slate-500 font-bold block uppercase">📊 Thống kê vắng / gọi:</span>
              <span class="text-xs font-black text-rose-800">Vắng: {{ student360Data?.totalAbsences || 0 }} buổi</span> |
              <span class="text-xs font-black text-emerald-800">Cuộc gọi: {{ student360Data?.totalCalls || 0 }}</span>
            </div>
          </div>

          <!-- Tags List -->
          <div class="space-y-1.5">
            <span class="text-xs font-bold text-slate-700 uppercase">Thẻ Nhãn Đã Gắn (#Tags):</span>
            <div class="flex flex-wrap gap-2">
              <span
                *ngFor="let tag of student360Data?.student?.tags"
                class="px-3 py-1 rounded-full bg-purple-100 text-purple-900 text-xs font-extrabold border border-purple-300"
              >
                {{ tag }}
              </span>
              <span *ngIf="!student360Data?.student?.tags?.length" class="text-xs text-slate-400 italic">Chưa có thẻ nhãn.</span>
            </div>
          </div>

          <!-- Timeline History Visual Feed -->
          <div class="space-y-4">
            <h4 class="font-extrabold text-slate-900 text-sm uppercase border-b pb-2">
              📜 Timeline Lịch Sử Điểm Danh & Cuộc Gọi Chăm Sóc:
            </h4>

            <div class="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
              <div
                *ngFor="let item of student360Data?.timeline"
                class="relative space-y-1 bg-slate-50 p-4 rounded-xl border border-slate-200"
              >
                <!-- Dot icon -->
                <div
                  class="absolute -left-6 top-4 w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold shadow-xs"
                  [ngClass]="item.type === 'attendance' ? 'bg-rose-500' : 'bg-blue-600'"
                >
                  {{ item.type === 'attendance' ? '❌' : '📞' }}
                </div>

                <div class="flex items-center justify-between flex-wrap gap-2">
                  <span class="font-extrabold text-sm text-slate-900">{{ item.title }}</span>
                  <span class="text-xs text-slate-500 font-semibold">{{ item.date | date:'HH:mm - dd/MM/yyyy' }}</span>
                </div>

                <div class="text-xs text-slate-700 font-semibold">
                  Môn học: <strong class="text-blue-900">{{ item.courseGroup?.groupCode }} - {{ item.courseGroup?.courseName }}</strong>
                </div>

                <div *ngIf="item.absenceReasonCategory" class="text-xs text-indigo-900 font-bold">
                  📌 Lý do vắng chuẩn: {{ item.absenceReasonCategory }}
                </div>

                <div *ngIf="item.note" class="text-xs text-slate-700 bg-white p-2.5 rounded-lg border border-slate-200 font-medium">
                  💬 Ghi chú: {{ item.note }}
                </div>

                <div *ngIf="item.callbackDate" class="text-xs text-rose-700 font-extrabold">
                  📅 Hẹn ngày gọi lại: {{ item.callbackDate | date:'dd/MM/yyyy' }}
                </div>

                <div *ngIf="item.staff" class="text-[11px] text-slate-400 font-semibold pt-1">
                  Người thực hiện: {{ item.staff?.fullName }}
                </div>
              </div>

              <div *ngIf="!student360Data?.timeline?.length" class="text-center py-6 text-slate-400 text-xs italic">
                Chưa có lịch sử điểm danh hoặc cuộc gọi nào cho sinh viên này.
              </div>
            </div>
          </div>

          <div class="pt-4 flex justify-end border-t border-slate-200">
            <button (click)="show360Modal = false" class="px-6 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-extrabold text-xs rounded-xl">Đóng Hồ Sơ 360°</button>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class CallTaskComponent implements OnInit {
  tasks: CallTask[] = [];
  sysSettings: SystemSettings | null = null;

  // Filter States
  filterClassCode = '';
  filterGroupCode = '';
  filterStatus = '';

  // 360 Profile Modal State
  show360Modal = false;
  student360Data: Student360Profile | null = null;

  constructor(
    private callTaskService: CallTaskService,
    private settingsService: SettingsService,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.loadTasks();
    this.loadSystemSettings();
  }

  loadSystemSettings() {
    this.settingsService.getSettings().subscribe({
      next: (s) => (this.sysSettings = s),
      error: (err) => console.error('Load settings error:', err),
    });
  }

  loadTasks() {
    this.callTaskService
      .getMyTasks({
        classCode: this.filterClassCode,
        groupCode: this.filterGroupCode,
        status: this.filterStatus,
      })
      .subscribe({
        next: (list) => (this.tasks = list),
        error: (err) => console.error('Load call tasks error:', err),
      });
  }

  applyFilters() {
    this.loadTasks();
  }

  get pendingCount() {
    return this.tasks.filter((t) => t.callStatus === 'Chưa gọi').length;
  }

  get callbackDueCount() {
    return this.tasks.filter((t) => t.isCallbackDue).length;
  }

  get doneCount() {
    return this.tasks.filter((t) => t.callStatus === 'Đã liên hệ').length;
  }

  onCallbackDateChange(task: CallTask, dateValue: string) {
    task.callbackDate = dateValue || null;
  }

  saveTaskUpdate(task: CallTask) {
    this.callTaskService
      .updateTaskStatus(task._id, {
        status: task.callStatus,
        callNote: task.callNote,
        absenceReasonCategory: task.absenceReasonCategory,
        callbackDate: task.callbackDate,
        tags: task.student?.tags,
      })
      .subscribe({
        next: (res) => {
          task.callAttempts = res.task.callAttempts;
          // Reload tasks to re-sort by callback & status priority queue
          this.loadTasks();
        },
        error: (err) => alert(err.error?.message || 'Không thể lưu kết quả cuộc gọi'),
      });
  }

  addTagToStudent(task: CallTask, event: any) {
    const selectedTag = event.target.value;
    if (!selectedTag || !task.student) return;
    if (!task.student.tags) task.student.tags = [];
    if (!task.student.tags.includes(selectedTag)) {
      task.student.tags.push(selectedTag);
      this.callTaskService.updateStudentTags(task.student._id, task.student.tags).subscribe();
    }
    event.target.value = '';
  }

  removeTagFromStudent(task: CallTask, tagToRemove: string) {
    if (!task.student || !task.student.tags) return;
    task.student.tags = task.student.tags.filter((t) => t !== tagToRemove);
    this.callTaskService.updateStudentTags(task.student._id, task.student.tags).subscribe();
  }

  openStudent360(studentId?: string) {
    if (!studentId) return;
    this.callTaskService.getStudent360Profile(studentId).subscribe({
      next: (profile) => {
        this.student360Data = profile;
        this.show360Modal = true;
      },
      error: (err) => alert(err.error?.message || 'Không thể lấy hồ sơ 360° sinh viên'),
    });
  }
}
