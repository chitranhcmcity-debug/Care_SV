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
  template: `
    <div class="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <!-- ELEGANT OFFICE TOAST NOTIFICATION -->
      <div *ngIf="toast.show" class="fixed top-5 right-5 z-[9999] max-w-md w-full transition-all duration-300">
        <div
          class="p-4 rounded-2xl shadow-xl border bg-white border-slate-200 flex items-start justify-between gap-3"
          [ngClass]="{
            'border-l-4 border-l-emerald-600': toast.type === 'success',
            'border-l-4 border-l-rose-600': toast.type === 'error',
            'border-l-4 border-l-blue-600': toast.type === 'info'
          }"
        >
          <div class="flex items-start gap-3">
            <div
              class="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0"
              [ngClass]="{
                'bg-emerald-100 text-emerald-800': toast.type === 'success',
                'bg-rose-100 text-rose-800': toast.type === 'error',
                'bg-blue-100 text-blue-800': toast.type === 'info'
              }"
            >
              <span *ngIf="toast.type === 'success'">✅</span>
              <span *ngIf="toast.type === 'error'">⚠️</span>
              <span *ngIf="toast.type === 'info'">ℹ️</span>
            </div>
            <div>
              <h5 class="font-extrabold text-sm text-slate-900">{{ toast.title }}</h5>
              <p class="text-xs font-semibold text-slate-600 mt-0.5">{{ toast.message }}</p>
            </div>
          </div>
          <button (click)="toast.show = false" class="text-slate-400 hover:text-slate-700 font-bold text-base focus:outline-none">✖</button>
        </div>
      </div>

      <!-- Admin Header Banner -->
      <div class="bg-white border border-slate-200 p-6 md:p-8 rounded-2xl shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div class="space-y-1">
          <div class="inline-flex items-center gap-2 px-3 py-1 rounded bg-blue-50 text-blue-900 text-xs font-bold border border-blue-200">
            🛡️ QUẢN TRỊ VIÊN HỆ THỐNG
          </div>
          <h2 class="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">Quản Lý Hệ Thống & Báo Cáo Chuyên Sâu</h2>
          <p class="text-xs sm:text-sm text-slate-600 font-medium">Nhập sinh viên hàng loạt qua Excel, cấu hình học phần, phân quyền nhân sự CSKH & báo cáo cảnh báo cấm thi.</p>
        </div>

        <button
          *ngIf="activeTab === 'analytics'"
          (click)="downloadCareReport()"
          [disabled]="isExportingCareReport"
          class="px-5 py-3 bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs sm:text-sm rounded-xl shadow-sm transition-all flex items-center gap-2 touch-target"
        >
          <span>{{ isExportingCareReport ? 'Đang xuất báo cáo...' : '📥 XUẤT BÁO CÁO CHĂM SÓC (.XLSX)' }}</span>
        </button>
      </div>

      <!-- Tab Navigation -->
      <div class="flex border-b border-slate-200 overflow-x-auto space-x-1 bg-white p-1 rounded-xl shadow-sm border">
        <button
          (click)="switchTab('courses')"
          [ngClass]="activeTab === 'courses' ? 'border-blue-700 text-blue-900 bg-blue-50 font-extrabold' : 'border-transparent text-slate-600 hover:text-slate-900 font-medium'"
          class="py-3 px-4 border-b-2 text-sm transition-all rounded-lg touch-target flex items-center gap-2 whitespace-nowrap"
        >
          📅 Cấu Hình Học Phần
        </button>
        <button
          (click)="switchTab('excel')"
          [ngClass]="activeTab === 'excel' ? 'border-blue-700 text-blue-900 bg-blue-50 font-extrabold' : 'border-transparent text-slate-600 hover:text-slate-900 font-medium'"
          class="py-3 px-4 border-b-2 text-sm transition-all rounded-lg touch-target flex items-center gap-2 whitespace-nowrap"
        >
          📊 Nhập Sinh Viên (Excel)
        </button>
        <button
          (click)="switchTab('staff')"
          [ngClass]="activeTab === 'staff' ? 'border-blue-700 text-blue-900 bg-blue-50 font-extrabold' : 'border-transparent text-slate-600 hover:text-slate-900 font-medium'"
          class="py-3 px-4 border-b-2 text-sm transition-all rounded-lg touch-target flex items-center gap-2 whitespace-nowrap"
        >
          👥 Nhân Sự CSKH
        </button>
        <button
          (click)="switchTab('analytics')"
          [ngClass]="activeTab === 'analytics' ? 'border-blue-700 text-blue-900 bg-blue-50 font-extrabold' : 'border-transparent text-slate-600 hover:text-slate-900 font-medium'"
          class="py-3 px-4 border-b-2 text-sm transition-all rounded-lg touch-target flex items-center gap-2 whitespace-nowrap"
        >
          📈 Thống Kê & Cấm Thi
        </button>
        <button
          (click)="switchTab('settings')"
          [ngClass]="activeTab === 'settings' ? 'border-blue-700 text-blue-900 bg-blue-50 font-extrabold' : 'border-transparent text-slate-600 hover:text-slate-900 font-medium'"
          class="py-3 px-4 border-b-2 text-sm transition-all rounded-lg touch-target flex items-center gap-2 whitespace-nowrap"
        >
          ⚙️ Cấu Hình
        </button>
        <!-- Crawler hidden but preserved -->
        <button
          (click)="switchTab('crawler')"
          [ngClass]="activeTab === 'crawler' ? 'border-slate-400 text-slate-700 bg-slate-50 font-extrabold' : 'border-transparent text-slate-400 hover:text-slate-600 font-medium'"
          class="py-3 px-3 border-b-2 text-xs transition-all rounded-lg touch-target flex items-center gap-1 whitespace-nowrap opacity-50"
          title="Chức năng Crawler tạm ẩn (dùng Excel import thay thế)"
        >
          🕷️
        </button>
      </div>

      <!-- COMPONENT 1: CRAWLER CONTROL -->
      <div *ngIf="activeTab === 'crawler'" class="bg-white border border-slate-200 p-6 md:p-8 rounded-2xl shadow-sm space-y-6">
        <div class="flex items-center justify-between flex-wrap gap-4 border-b border-slate-200 pb-4">
          <div>
            <h3 class="text-lg md:text-xl font-extrabold text-slate-900">1. Trình Quét Dữ Liệu Sinh Viên ASP.NET WebForms (Đa Luồng Song Song)</h3>
            <p class="text-xs text-slate-500 font-medium">Định dạng MSSV chuẩn 9 số: <code>[Mã Ngành 3][Khóa 2]0[STT 3]</code> (VD: <code>501250003</code>, <code>602250053</code>)</p>
          </div>
          <span class="badge badge-admin">CONCURRENCY BATCHING SSE</span>
        </div>

        <!-- Major Prefixes Dynamic Configuration Panel -->
        <div class="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
          <div class="flex items-center justify-between flex-wrap gap-2">
            <label class="block text-xs font-bold text-slate-700 uppercase">
              Cấu hình Danh mục Mã Ngành (No Hardcode):
            </label>
            <span class="text-xs text-slate-500 font-semibold">Đã chọn {{ majorPrefixes.length }} mã ngành</span>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <span
              *ngFor="let p of majorPrefixes; let idx = index"
              class="px-3 py-1.5 rounded-lg bg-blue-900 text-white font-extrabold text-xs flex items-center gap-2 shadow-sm"
            >
              <span>{{ p }}</span>
              <button
                type="button"
                (click)="removeMajorPrefix(idx)"
                class="hover:text-rose-300 font-bold focus:outline-none"
                title="Xóa mã ngành"
              >
                ✖
              </button>
            </span>

            <!-- Add Prefix Input -->
            <div class="flex items-center space-x-1">
              <input
                type="text"
                [(ngModel)]="newPrefixInput"
                placeholder="VD: 401"
                maxlength="3"
                class="w-20 px-2.5 py-1 rounded-lg border border-slate-300 text-xs font-bold text-slate-900 bg-white"
              />
              <button
                type="button"
                (click)="addMajorPrefix()"
                class="px-3 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-extrabold touch-target min-h-[32px]"
              >
                ➕ Thêm
              </button>
            </div>
          </div>
        </div>

        <!-- Scan Controls & Parameters Grid -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label class="block text-xs font-bold text-slate-700 uppercase mb-2">Danh sách Khóa (Years)</label>
            <select [(ngModel)]="selectedYears" class="w-full px-4 py-3 rounded-xl border border-slate-300 font-semibold text-sm bg-white text-slate-900">
              <option value="25,26">Khóa 25 & 26 (Năm 2026)</option>
              <option value="24,25">Khóa 24 & 25 (Năm 2025)</option>
              <option value="23,24">Khóa 23 & 24 (Năm 2024)</option>
            </select>
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-700 uppercase mb-2">STT Bắt đầu (Start)</label>
            <input
              type="number"
              [(ngModel)]="startSeq"
              min="1"
              max="999"
              class="w-full px-4 py-3 rounded-xl border border-slate-300 font-semibold text-sm bg-white text-slate-900"
            />
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-700 uppercase mb-2">STT Kết thúc (End N)</label>
            <input
              type="number"
              [(ngModel)]="endSeq"
              min="1"
              max="999"
              class="w-full px-4 py-3 rounded-xl border border-slate-300 font-semibold text-sm bg-white text-slate-900"
            />
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-700 uppercase mb-2">Số Luồng Song Song (Concurrency)</label>
            <select [(ngModel)]="concurrency" class="w-full px-4 py-3 rounded-xl border border-slate-300 font-semibold text-sm bg-white text-slate-900">
              <option [ngValue]="4">4 Luồng (An toàn)</option>
              <option [ngValue]="6">6 Luồng (Khuyên dùng)</option>
              <option [ngValue]="10">10 Luồng (Siêu tốc)</option>
            </select>
          </div>
        </div>

        <!-- Action Control Buttons -->
        <div class="flex items-center space-x-3">
          <button
            (click)="startCrawler()"
            [disabled]="isScanning"
            class="px-6 py-3.5 bg-blue-900 hover:bg-blue-950 text-white font-extrabold rounded-xl touch-target text-sm transition-all shadow-sm flex items-center justify-center gap-2"
          >
            <span>{{ isScanning ? '⏳ Đang Quét Đa Luồng...' : '🚀 BẮT ĐẦU QUÉT DỮ LIỆU' }}</span>
          </button>

          <button
            *ngIf="isScanning"
            (click)="stopCrawler()"
            class="px-6 py-3.5 bg-rose-700 hover:bg-rose-800 text-white font-extrabold rounded-xl touch-target text-sm transition-all shadow-sm flex items-center justify-center gap-2 animate-pulse"
          >
            <span>🛑 DỪNG QUÉT</span>
          </button>
        </div>

        <!-- SSE PROGRESS BAR -->
        <div *ngIf="crawlerProgress" class="p-6 rounded-xl bg-slate-100 border border-slate-300 text-slate-900 space-y-4 shadow-inner">
          <div class="flex items-center justify-between text-sm font-bold flex-wrap gap-2">
            <span class="flex items-center gap-2">
              <span class="w-3 h-3 rounded-full bg-blue-600 animate-pulse"></span>
              Đang cào Batch MSSV: <code class="text-blue-900 bg-white px-2 py-0.5 rounded border border-blue-200 font-mono text-xs sm:text-sm">{{ crawlerProgress.currentMssv || '...' }}</code>
            </span>
            <span class="text-blue-900 font-black text-lg">{{ crawlerProgress.percent }}%</span>
          </div>

          <!-- Progress Bar -->
          <div class="w-full bg-slate-200 rounded-full h-4 overflow-hidden border border-slate-300 p-0.5">
            <div
              class="bg-blue-800 h-full rounded-full transition-all duration-300"
              [style.width.%]="crawlerProgress.percent"
            ></div>
          </div>

          <div class="grid grid-cols-2 md:grid-cols-3 gap-4 text-center pt-2">
            <div class="p-3 rounded-lg bg-white border border-slate-300">
              <div class="text-xs text-slate-500 font-bold uppercase">Đã Xử Lý</div>
              <div class="text-lg font-black text-slate-900">{{ crawlerProgress.currentTask }} / {{ crawlerProgress.totalTasks }}</div>
            </div>
            <div class="p-3 rounded-lg bg-white border border-slate-300">
              <div class="text-xs text-slate-500 font-bold uppercase">Tìm Thấy SV Trực Tiếp</div>
              <div class="text-lg font-black text-emerald-700">{{ crawlerProgress.foundCount }}</div>
            </div>
            <div class="p-3 rounded-lg bg-white border border-slate-300 col-span-2 md:col-span-1">
              <div class="text-xs text-slate-500 font-bold uppercase">Trạng Thái</div>
              <div class="text-sm font-extrabold text-blue-900">
                {{ isScanning ? '⚡ Đang chạy ' + concurrency + ' luồng' : '✅ Đã hoàn tất/dừng' }}
              </div>
            </div>
          </div>

          <div *ngIf="crawlerProgress.completed" class="p-3.5 rounded-lg bg-emerald-100 border border-emerald-300 text-emerald-900 text-sm font-bold text-center">
            🎉 {{ crawlerProgress.message || 'Hoàn tất quét toàn bộ dữ liệu sinh viên!' }}
          </div>
        </div>

        <!-- REAL-TIME LIVE STREAM TABLE FOR FOUND STUDENTS -->
        <div *ngIf="liveFoundStudents.length > 0" class="space-y-3 pt-2">
          <div class="flex items-center justify-between">
            <h4 class="font-extrabold text-slate-900 text-sm uppercase flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-full bg-emerald-600 animate-ping"></span>
              Bảng Danh Sách Sinh Viên Tìm Thấy Trực Tiếp (Live Stream: {{ liveFoundStudents.length }} SV)
            </h4>
          </div>

          <div class="max-h-72 overflow-y-auto rounded-xl border border-slate-300 bg-white">
            <table class="w-full text-left border-collapse text-xs">
              <thead class="sticky top-0 bg-slate-100 text-slate-800 uppercase font-extrabold border-b border-slate-300">
                <tr>
                  <th class="p-3">#</th>
                  <th class="p-3">Mã SV (MSSV)</th>
                  <th class="p-3">Họ và Tên</th>
                  <th class="p-3">Lớp Sinh Hoạt</th>
                  <th class="p-3">Ngành Đào Tạo</th>
                  <th class="p-3">Ngày Sinh</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-200">
                <tr *ngFor="let st of liveFoundStudents; let idx = index" class="hover:bg-blue-50/50 font-medium">
                  <td class="p-3 font-bold text-slate-500">{{ liveFoundStudents.length - idx }}</td>
                  <td class="p-3 font-mono font-extrabold text-blue-900 bg-blue-50/60 rounded px-2">{{ st.studentCode }}</td>
                  <td class="p-3 font-bold text-slate-900">{{ st.fullName }}</td>
                  <td class="p-3 font-semibold text-slate-700">{{ st.classCode }}</td>
                  <td class="p-3 text-slate-600">{{ st.major }}</td>
                  <td class="p-3 text-slate-500">{{ st.dob }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- COMPONENT 2: EXCEL IMPORT BY COURSE -->
      <div *ngIf="activeTab === 'excel'" class="space-y-6">
        <!-- Info Banner -->
        <div class="bg-gradient-to-r from-blue-900 to-indigo-900 text-white p-6 rounded-2xl shadow-lg">
          <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div class="space-y-1">
              <div class="text-xs font-bold text-blue-300 uppercase tracking-wider">📊 NHẬP SINH VIÊN HÀO LOẠT THEO HỌC PHẦN</div>
              <h3 class="text-xl font-black">Quy Trình 3 Bước Đơn Giản</h3>
              <p class="text-sm text-blue-200">Cấu hình học phần → Tải mẫu Excel → Nhập SV vào mẫu → Upload</p>
            </div>
            <div class="flex items-center gap-3 text-xs font-bold">
              <div class="flex flex-col items-center gap-1 bg-white/10 rounded-xl p-3 text-center">
                <span class="text-2xl">1️⃣</span>
                <span>Cấu Hình<br/>Học Phần</span>
              </div>
              <span class="text-blue-400 text-lg">→</span>
              <div class="flex flex-col items-center gap-1 bg-white/10 rounded-xl p-3 text-center">
                <span class="text-2xl">2️⃣</span>
                <span>Tải Mẫu<br/>Excel</span>
              </div>
              <span class="text-blue-400 text-lg">→</span>
              <div class="flex flex-col items-center gap-1 bg-white/10 rounded-xl p-3 text-center">
                <span class="text-2xl">3️⃣</span>
                <span>Upload<br/>& Đồng Bộ</span>
              </div>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <!-- Download Course Template Card -->
          <div class="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm space-y-4">
            <div class="flex items-center gap-3">
              <div class="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center text-2xl">📥</div>
              <div>
                <h4 class="font-extrabold text-slate-900">Tải File Mẫu Theo Học Phần</h4>
                <p class="text-xs text-slate-500">Mỗi sheet = 1 mã học phần đã cấu hình</p>
              </div>
            </div>

            <div class="p-4 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-800 font-medium space-y-1">
              <div class="font-black text-blue-900">📋 File mẫu sẽ có cấu trúc:</div>
              <div>• <b>Mỗi sheet</b> = 1 nhóm học phần (tên sheet = mã nhóm)</div>
              <div>• Các cột: <b>MSSV | Họ Tên | SĐT SV | SĐT Phụ Huynh</b></div>
              <div>• SV đã đăng ký sẽ được pre-fill sẵn</div>
            </div>

            <div class="text-xs font-bold text-slate-600">
              📌 Số học phần hiện có: <span class="text-blue-900 font-black">{{ courseGroupList.length }} học phần</span>
            </div>

            <button
              (click)="downloadCourseTemplate()"
              [disabled]="isDownloadingCourseExcel"
              class="w-full py-3.5 bg-blue-900 hover:bg-blue-950 disabled:bg-slate-400 text-white font-extrabold rounded-xl touch-target text-sm transition-all shadow-sm flex items-center justify-center gap-2"
            >
              <svg *ngIf="isDownloadingCourseExcel" class="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>{{ isDownloadingCourseExcel ? '⏳ Đang tạo file mẫu...' : '📥 TẢI MẪU EXCEL THEO HỌC PHẦN' }}</span>
            </button>

            <div class="border-t border-slate-200 pt-4">
              <p class="text-xs text-slate-500 font-medium mb-2">🗂️ Hoặc tải mẫu theo lớp sinh hoạt (legacy):</p>
              <button
                (click)="downloadExcelTemplate()"
                [disabled]="isDownloadingExcel"
                class="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl touch-target text-xs transition-all"
              >
                {{ isDownloadingExcel ? 'Đang tạo...' : '📄 Tải mẫu theo Lớp Sinh Hoạt' }}
              </button>
            </div>
          </div>

          <!-- Upload by Course Card -->
          <div class="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm space-y-4">
            <div class="flex items-center gap-3">
              <div class="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center text-2xl">📤</div>
              <div>
                <h4 class="font-extrabold text-slate-900">Upload Hàng Loạt Theo Học Phần</h4>
                <p class="text-xs text-slate-500">Tên sheet phải khớp với mã nhóm học phần</p>
              </div>
            </div>

            <input
              type="file"
              (change)="onCourseFileSelected($event)"
              accept=".xlsx, .xls"
              #courseFileInput
              class="hidden"
            />

            <div
              (click)="courseFileInput.click()"
              class="border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all touch-target"
              [ngClass]="selectedCourseFile ? 'border-emerald-400 bg-emerald-50' : 'border-slate-300 hover:border-emerald-500 bg-white hover:bg-emerald-50/30'"
            >
              <div class="text-3xl mb-2">{{ selectedCourseFile ? '✅' : '📎' }}</div>
              <div class="text-xs font-bold text-slate-700">
                {{ selectedCourseFile ? selectedCourseFile.name : 'Bấm vào đây để chọn file Excel (.xlsx)' }}
              </div>
              <div *ngIf="selectedCourseFile" class="text-xs text-emerald-600 font-medium mt-1">
                {{ (selectedCourseFile.size / 1024).toFixed(1) }} KB
              </div>
            </div>

            <button
              (click)="uploadByCourse()"
              [disabled]="!selectedCourseFile || isUploadingCourseExcel"
              class="w-full py-3.5 bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-400 text-white font-extrabold rounded-xl touch-target text-sm transition-all shadow-sm flex items-center justify-center gap-2"
            >
              <svg *ngIf="isUploadingCourseExcel" class="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>{{ isUploadingCourseExcel ? '⏳ Đang đồng bộ dữ liệu...' : '🚀 UPLOAD & ĐỒNG BỘ HỌC PHẦN' }}</span>
            </button>
          </div>
        </div>

        <!-- Import Result Display -->
        <div *ngIf="importCourseResult" class="bg-white border border-emerald-200 rounded-2xl p-6 shadow-sm space-y-4 animate-fade-in">
          <div class="flex items-center gap-3 border-b border-slate-200 pb-4">
            <div class="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-xl">🎉</div>
            <div>
              <h4 class="font-extrabold text-emerald-900">Đồng bộ thành công!</h4>
              <p class="text-xs text-slate-600">{{ importCourseResult.message }}</p>
            </div>
          </div>

          <!-- Summary Stats -->
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div class="p-3 rounded-xl bg-slate-50 border border-slate-200 text-center">
              <div class="text-xs font-bold text-slate-500 uppercase">Tổng SV</div>
              <div class="text-2xl font-black text-slate-900">{{ importCourseResult.totalStudents }}</div>
            </div>
            <div class="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-center">
              <div class="text-xs font-bold text-emerald-700 uppercase">SV Mới</div>
              <div class="text-2xl font-black text-emerald-900">{{ importCourseResult.newStudents }}</div>
            </div>
            <div class="p-3 rounded-xl bg-blue-50 border border-blue-200 text-center">
              <div class="text-xs font-bold text-blue-700 uppercase">Cập Nhật</div>
              <div class="text-2xl font-black text-blue-900">{{ importCourseResult.updatedStudents }}</div>
            </div>
            <div class="p-3 rounded-xl bg-amber-50 border border-amber-200 text-center">
              <div class="text-xs font-bold text-amber-700 uppercase">Gán HP</div>
              <div class="text-2xl font-black text-amber-900">{{ importCourseResult.assignedCount }}</div>
            </div>
          </div>

          <!-- Per-sheet results -->
          <div class="space-y-2">
            <div class="text-xs font-black text-slate-700 uppercase">Chi tiết theo học phần:</div>
            <div class="overflow-x-auto rounded-xl border border-slate-200">
              <table class="w-full text-xs border-collapse">
                <thead>
                  <tr class="bg-slate-100 text-slate-700 font-black uppercase">
                    <th class="p-3 text-left">Học Phần (Sheet)</th>
                    <th class="p-3 text-left">Tên Môn</th>
                    <th class="p-3 text-center">Tổng SV</th>
                    <th class="p-3 text-center">Mới Thêm</th>
                    <th class="p-3 text-center">Gán Vào HP</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-200 bg-white">
                  <tr *ngFor="let r of importCourseResult.sheetResults" class="hover:bg-slate-50">
                    <td class="p-3 font-mono font-black text-blue-900">{{ r.sheetName }}</td>
                    <td class="p-3 font-medium text-slate-700">{{ r.courseName }}</td>
                    <td class="p-3 text-center font-bold">{{ r.total }}</td>
                    <td class="p-3 text-center">
                      <span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-black">+{{ r.newStudents }}</span>
                    </td>
                    <td class="p-3 text-center">
                      <span class="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-black">{{ r.assigned }}</span>
                    </td>
                  </tr>
                  <tr *ngIf="!importCourseResult.sheetResults?.length">
                    <td colspan="5" class="p-6 text-center text-slate-400">Không có sheet nào được xử lý thành công.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Errors -->
          <div *ngIf="importCourseResult.errors?.length" class="p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs font-bold space-y-1">
            <div class="font-black">⚠️ Cảnh báo ({{ importCourseResult.errors!.length }} dòng bị bỏ qua):</div>
            <div *ngFor="let e of importCourseResult.errors">• {{ e }}</div>
          </div>

          <button (click)="importCourseResult = null; selectedCourseFile = null" class="text-xs text-slate-500 hover:text-slate-700 font-bold">✖ Đóng kết quả</button>
        </div>

        <!-- Old Excel Alert -->
        <div *ngIf="excelAlert" class="p-4 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-sm font-bold">
          ✅ {{ excelAlert }}
        </div>
      </div>

      <!-- COMPONENT 3: STAFF MANAGEMENT -->
      <div *ngIf="activeTab === 'staff'" class="bg-white border border-slate-200 p-6 md:p-8 rounded-2xl shadow-sm space-y-6">
        <div class="border-b border-slate-200 pb-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h3 class="text-lg md:text-xl font-extrabold text-slate-900">3. Quản Lý Nhân Sự CSKH & Phân Công Lớp Cố Định</h3>
            <p class="text-xs text-slate-500 font-medium">Gán Lớp sinh hoạt cho Nhân viên CSKH và Bàn giao quản lý nhân sự chỉ với 1 click</p>
          </div>
          <button
            type="button"
            (click)="openHandoverModal()"
            class="px-5 py-3 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-extrabold text-xs sm:text-sm rounded-xl shadow-md transition-all flex items-center gap-2 touch-target cursor-pointer"
          >
            <span>🔄 BÀN GIAO LỚP 1-CLICK</span>
          </button>
        </div>

        <!-- Add Staff Form -->
        <form (ngSubmit)="createStaffAccount()" class="p-6 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
          <div>
            <label class="block text-xs font-bold text-slate-700 uppercase mb-2">Họ và Tên <span class="text-rose-600">*</span></label>
            <input
              type="text"
              [(ngModel)]="newStaffName"
              name="newStaffName"
              required
              placeholder="VD: Nguyễn Văn B"
              class="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm font-semibold text-slate-900 bg-white"
            />
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 uppercase mb-2">Địa chỉ Email <span class="text-rose-600">*</span></label>
            <input
              type="email"
              [(ngModel)]="newStaffEmail"
              name="newStaffEmail"
              required
              placeholder="staff@itc.edu.vn"
              class="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm font-semibold text-slate-900 bg-white"
            />
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 uppercase mb-2">Vai Trò Tài Khoản <span class="text-rose-600">*</span></label>
            <select
              [(ngModel)]="newStaffRole"
              name="newStaffRole"
              class="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm font-extrabold text-slate-900 bg-white"
            >
              <option value="staff">🎧 Nhân Viên CSKH</option>
              <option value="teacher">👨‍🏫 Giảng Viên Giảng Dạy</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 uppercase mb-2">Mật Khẩu (Tùy chọn)</label>
            <input
              type="text"
              [(ngModel)]="newStaffPass"
              name="newStaffPass"
              placeholder="Mật khẩu ngẫu nhiên"
              class="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm font-mono font-semibold text-slate-900 bg-white"
            />
          </div>
          <button
            type="submit"
            [disabled]="isCreatingStaff"
            class="py-3.5 px-6 bg-blue-900 hover:bg-blue-950 text-white font-extrabold rounded-xl touch-target text-sm transition-all shadow-sm flex items-center justify-center gap-2"
          >
            <span>{{ isCreatingStaff ? 'Đang tạo...' : '➕ THÊM TÀI KHOẢN' }}</span>
          </button>
        </form>

        <!-- Prominent Persistent Generated Password Display Card with 1-Click Copy -->
        <div *ngIf="staffCreatedMsg || staffGeneratedPass" class="p-5 rounded-2xl bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white shadow-xl space-y-3 animate-fade-in border border-blue-700">
          <div class="flex items-center justify-between">
            <span class="font-extrabold text-sm flex items-center gap-2">🎉 {{ staffCreatedMsg || 'Tạo tài khoản nhân sự thành công!' }}</span>
            <button (click)="staffCreatedMsg = ''; staffGeneratedPass = ''" class="text-white/70 hover:text-white font-bold text-xl p-1">✖</button>
          </div>
          <div *ngIf="staffGeneratedPass" class="bg-white/10 p-4 rounded-xl border border-white/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <span class="text-xs text-blue-200 block font-medium uppercase mb-1">🔑 MẬT KHẨU ĐĂNG NHẬP KHỞI TẠO (HÃY LƯU VÀ SAO CHÉP):</span>
              <span class="font-mono text-xl font-black text-amber-300 tracking-wider bg-black/30 px-3 py-1 rounded border border-amber-400/40 select-all">{{ staffGeneratedPass }}</span>
            </div>
            <button
              type="button"
              (click)="copyPasswordToClipboard(staffGeneratedPass)"
              class="px-5 py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs rounded-xl shadow-md transition-all flex items-center gap-2 touch-target cursor-pointer"
            >
              📋 SAO CHÉP MẬT KHẨU
            </button>
          </div>
        </div>

        <!-- Staff List Table -->
        <div class="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
          <table class="w-full text-left border-collapse text-sm">
            <thead>
              <tr class="bg-slate-100 text-slate-800 uppercase text-xs font-bold border-b border-slate-200">
                <th class="p-3">Họ & Tên</th>
                <th class="p-3">Email</th>
                <th class="p-3">Vai Trò</th>
                <th class="p-3">Phân Công Theo Lớp</th>
                <th class="p-3">Phân Công Ngoại Lệ SV</th>
                <th class="p-3">Trạng Thái</th>
                <th class="p-3 text-right">Thao Tác Quản Lý (Admin)</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-200 bg-white">
              <tr *ngFor="let staff of staffList" class="hover:bg-slate-50 transition-all">
                <td class="p-3 font-bold text-slate-900">{{ staff.fullName }}</td>
                <td class="p-3 text-slate-600 font-medium font-mono text-xs">{{ staff.email }}</td>
                <td class="p-3">
                  <span
                    class="px-2 py-0.5 rounded-md text-xs font-semibold border"
                    [ngClass]="staff.role === 'teacher' ? 'bg-amber-50 text-amber-900 border-amber-200' : 'bg-blue-50 text-blue-900 border-blue-200'"
                  >
                    {{ staff.role === 'teacher' ? '👨‍🏫 GIẢNG VIÊN' : '🎧 NHÂN VIÊN CSKH' }}
                  </span>
                </td>
                <td class="p-3">
                  <div class="flex flex-wrap items-center gap-1.5">
                    <span
                      *ngFor="let cCode of staff.managedClasses"
                      class="px-2 py-0.5 rounded-md bg-slate-100 text-slate-900 font-mono font-bold text-xs border border-slate-300"
                    >
                      🏫 {{ cCode }}
                    </span>
                    <span *ngIf="!staff.managedClasses?.length" class="text-xs text-slate-400 font-medium italic">
                      Chưa gán lớp
                    </span>
                    <button
                      *ngIf="staff.role === 'staff'"
                      type="button"
                      (click)="openAssignClassModal(staff)"
                      class="px-2 py-0.5 rounded-md text-[11px] font-semibold text-slate-700 bg-slate-100 border border-slate-300 hover:bg-slate-200"
                    >
                      ✏️ Gán Lớp
                    </button>
                  </div>
                </td>
                <td class="p-3">
                  <div class="flex flex-wrap items-center gap-1.5">
                    <span
                      *ngFor="let st of staff.managedStudents"
                      class="px-2 py-0.5 rounded-md bg-blue-50 text-blue-900 font-mono text-xs border border-blue-200"
                      [title]="getStudentDisplayName(st)"
                    >
                      👤 {{ getStudentCodeDisplay(st) }}
                    </span>
                    <span *ngIf="!staff.managedStudents?.length" class="text-xs text-slate-400 font-medium italic">
                      Không có
                    </span>
                    <button
                      *ngIf="staff.role === 'staff'"
                      type="button"
                      (click)="openAssignStudentModal(staff)"
                      class="px-2 py-0.5 rounded-md text-[11px] font-semibold text-slate-700 bg-slate-100 border border-slate-300 hover:bg-slate-200"
                    >
                      ✏️ Gán SV Ngoại Lệ
                    </button>
                  </div>
                </td>
                <td class="p-3">
                  <span
                    class="px-2.5 py-0.5 rounded-full text-xs font-semibold"
                    [ngClass]="staff.status === 'active' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-rose-100 text-rose-800 border border-rose-200'"
                  >
                    {{ staff.status === 'active' ? 'Đang hoạt động' : 'Tạm khóa' }}
                  </span>
                </td>
                <td class="p-4 text-right space-x-2">
                  <button
                    type="button"
                    (click)="openHandoverModal(staff)"
                    class="px-3 py-1.5 rounded-lg text-xs font-extrabold border border-amber-400 text-amber-900 bg-amber-50 hover:bg-amber-100 transition-all touch-target"
                    title="Bàn giao các lớp đang phụ trách sang nhân viên khác"
                  >
                    🔄 Bàn Giao
                  </button>
                  <button
                    type="button"
                    (click)="openEditStaffModal(staff)"
                    class="px-3 py-1.5 rounded-lg text-xs font-extrabold border border-blue-300 text-blue-800 bg-blue-50 hover:bg-blue-100 transition-all touch-target"
                  >
                    ✏️ Sửa
                  </button>
                  <button
                    type="button"
                    (click)="resetStaffPassword(staff)"
                    class="px-3 py-1.5 rounded-lg text-xs font-extrabold border border-slate-300 text-slate-800 bg-slate-100 hover:bg-slate-200 transition-all touch-target"
                  >
                    🔑 Reset MK
                  </button>
                  <button
                    type="button"
                    (click)="toggleStaffStatus(staff)"
                    class="px-3 py-1.5 rounded-lg text-xs font-bold border transition-all touch-target"
                    [ngClass]="staff.status === 'active' ? 'border-amber-400 text-amber-900 bg-amber-50 hover:bg-amber-100' : 'border-emerald-400 text-emerald-900 bg-emerald-50 hover:bg-emerald-100'"
                  >
                    {{ staff.status === 'active' ? '🚫 Khóa' : '✅ Mở' }}
                  </button>
                  <button
                    type="button"
                    (click)="deleteStaffAccount(staff)"
                    class="px-3 py-1.5 rounded-lg text-xs font-extrabold border border-rose-300 text-rose-700 bg-rose-50 hover:bg-rose-100 transition-all touch-target"
                  >
                    🗑️ Xóa
                  </button>
                </td>
              </tr>
              <tr *ngIf="staffList.length === 0">
                <td colspan="5" class="p-8 text-center text-slate-400 text-sm font-medium">Chưa có nhân viên nào trong danh sách.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- COMPONENT 4: ANALYTICS & EXAM BAN WARNINGS -->
      <div *ngIf="activeTab === 'analytics'" class="space-y-6">
        <!-- Refresh Bar -->
        <div class="flex items-center justify-between bg-white border border-slate-200 rounded-2xl px-5 py-3 shadow-sm">
          <div class="flex items-center gap-2 text-xs text-slate-500 font-medium">
            <span *ngIf="isRefreshingAnalytics" class="animate-spin">⟳</span>
            <span *ngIf="!isRefreshingAnalytics">🔗</span>
            <span *ngIf="lastAnalyticsUpdate">Cập nhật lúc: <strong class="text-slate-700">{{ lastAnalyticsUpdate | date:'HH:mm:ss dd/MM' }}</strong></span>
            <span *ngIf="!lastAnalyticsUpdate">Đang tải dữ liệu...</span>
            <span class="text-slate-300">•</span>
            <span class="text-slate-400">Tự động làm mới mỗi 60 giây</span>
          </div>
          <button
            (click)="loadAnalytics()"
            [disabled]="isRefreshingAnalytics"
            class="px-4 py-1.5 bg-blue-900 hover:bg-blue-950 disabled:bg-slate-300 text-white text-xs font-extrabold rounded-xl flex items-center gap-1.5 transition-all"
          >
            <span [class.animate-spin]="isRefreshingAnalytics">🔄</span>
            {{ isRefreshingAnalytics ? 'Đang tải...' : 'Làm Mới' }}
          </button>
        </div>

        <!-- Overview Metrics Cards -->
        <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div class="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm text-center">
            <div class="text-xs text-slate-500 font-bold uppercase">Tổng Nhiệm Vụ</div>
            <div class="text-2xl font-black text-slate-900 mt-1">{{ analyticsData?.metrics?.totalTasks || 0 }}</div>
          </div>
          <div class="bg-emerald-50 border border-emerald-200 p-5 rounded-2xl shadow-sm text-center">
            <div class="text-xs text-emerald-800 font-bold uppercase">Đã Liên Hệ</div>
            <div class="text-2xl font-black text-emerald-900 mt-1">{{ analyticsData?.metrics?.completedTasks || 0 }}</div>
          </div>
          <div class="bg-amber-50 border border-amber-200 p-5 rounded-2xl shadow-sm text-center">
            <div class="text-xs text-amber-800 font-bold uppercase">Chưa Gọi</div>
            <div class="text-2xl font-black text-amber-900 mt-1">{{ analyticsData?.metrics?.pendingTasks || 0 }}</div>
          </div>
          <div class="bg-orange-50 border border-orange-200 p-5 rounded-2xl shadow-sm text-center">
            <div class="text-xs text-orange-800 font-bold uppercase">Không Bắt Máy</div>
            <div class="text-2xl font-black text-orange-900 mt-1">{{ analyticsData?.metrics?.retryTasks || 0 }}</div>
          </div>
          <div class="bg-rose-50 border border-rose-300 p-5 rounded-2xl shadow-sm text-center col-span-2 md:col-span-1">
            <div class="text-xs text-rose-800 font-bold uppercase">⚠️ NGUY CƠ CẤM THI</div>
            <div class="text-2xl font-black text-rose-900 mt-1">{{ analyticsData?.metrics?.examBanRiskCount || 0 }}</div>
          </div>
        </div>

        <!-- Charts Section -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <!-- Chart 1: Absence count by course group -->
          <div class="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm space-y-4">
            <h4 class="font-extrabold text-slate-900 text-base border-b pb-3 flex items-center justify-between">
              <span>📊 Tỷ Lệ Vắng Theo Nhóm Học Phần</span>
              <span class="text-xs font-semibold text-slate-500">Buổi vắng</span>
            </h4>
            <div class="space-y-3 pt-2">
              <div *ngFor="let item of analyticsData?.courseAbsenceStats" class="space-y-1">
                <div class="flex justify-between text-xs font-bold text-slate-700">
                  <span>{{ item.courseCode }}</span>
                  <span class="text-blue-900">{{ item.absentCount }} Lượt Vắng</span>
                </div>
                <div class="w-full bg-slate-100 rounded-full h-3.5 border border-slate-200 overflow-hidden">
                  <div
                    class="bg-blue-800 h-full rounded-full transition-all duration-500"
                    [style.width.%]="calcPercentage(item.absentCount, maxAbsenceCount)"
                  ></div>
                </div>
              </div>
              <div *ngIf="!analyticsData?.courseAbsenceStats?.length" class="text-center py-8 text-slate-400 text-xs">
                Chưa có dữ liệu thống kê điểm danh vắng.
              </div>
            </div>
          </div>

          <!-- Chart 2: Most Common Reasons Breakdown -->
          <div class="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm space-y-4">
            <h4 class="font-extrabold text-slate-900 text-base border-b pb-3 flex items-center justify-between">
              <span>💡 Thống Kê Lý Do Vắng Phổ Biến</span>
              <span class="text-xs font-semibold text-slate-500">Trích xuất CallNote</span>
            </h4>
            <div class="space-y-3 pt-2">
              <div *ngFor="let item of analyticsData?.reasonStats" class="space-y-1">
                <div class="flex justify-between text-xs font-bold text-slate-700">
                  <span>{{ item.reason }}</span>
                  <span class="text-emerald-800 font-extrabold">{{ item.count }} Lượt</span>
                </div>
                <div class="w-full bg-slate-100 rounded-full h-3.5 border border-slate-200 overflow-hidden">
                  <div
                    class="bg-emerald-600 h-full rounded-full transition-all duration-500"
                    [style.width.%]="calcPercentage(item.count, maxReasonCount)"
                  ></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- EXAM BAN RISK WARNING TABLE -->
        <div class="bg-white border border-rose-300 p-6 md:p-8 rounded-2xl shadow-sm space-y-6">
          <div class="flex items-center justify-between flex-wrap gap-4 border-b border-rose-200 pb-4">
            <div>
              <h3 class="text-lg md:text-xl font-black text-rose-900 flex items-center gap-2">
                <span>⚠️ CẢNH BÁO NGUY CƠ CẤM THI KHẨN CẤP</span>
              </h3>
              <p class="text-xs text-rose-700 font-medium mt-0.5">
                Danh sách sinh viên vắng <b>từ buổi thứ 2 trở lên</b> trong cùng một nhóm học phần (Cần Phòng Đào Tạo & CSKH can thiệp)
              </p>
            </div>
            <span class="px-3 py-1.5 rounded-full bg-rose-100 text-rose-900 border border-rose-300 text-xs font-black">
              {{ analyticsData?.examBanRiskList?.length || 0 }} SINH VIÊN BỊ CẢNH BÁO
            </span>
          </div>

          <div class="overflow-x-auto rounded-xl border border-rose-200">
            <table class="w-full text-left border-collapse text-sm">
              <thead>
                <tr class="bg-rose-50 text-rose-900 uppercase text-xs font-black border-b border-rose-200">
                  <th class="p-4">Sinh Viên</th>
                  <th class="p-4">Lớp / Ngành</th>
                  <th class="p-4">Môn Học Vắng</th>
                  <th class="p-4 text-center">Số Buổi Vắng</th>
                  <th class="p-4">Trạng Thái CSKH</th>
                  <th class="p-4">Ghi Chú Phản Hồi</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-rose-100 bg-white">
                <tr *ngFor="let item of analyticsData?.examBanRiskList" class="hover:bg-rose-50/40 transition-all">
                  <td class="p-4">
                    <div class="font-extrabold text-slate-900">{{ item.student?.fullName }}</div>
                    <div class="text-xs text-blue-900 font-mono font-bold">MSSV: {{ item.student?.studentCode }}</div>
                  </td>
                  <td class="p-4">
                    <div class="font-bold text-slate-800">{{ item.student?.classCode }}</div>
                    <div class="text-xs text-slate-500">{{ item.student?.major }}</div>
                  </td>
                  <td class="p-4">
                    <div class="font-extrabold text-slate-900">{{ item.courseCode }}</div>
                    <div class="text-xs text-slate-500">{{ item.courseName }}</div>
                  </td>
                  <td class="p-4 text-center">
                    <span class="px-3 py-1 rounded-full bg-rose-700 text-white font-black text-xs shadow-sm">
                      ❌ VẮNG {{ item.absentCount }} BUỔI
                    </span>
                  </td>
                  <td class="p-4">
                    <span
                      class="px-2.5 py-1 rounded text-xs font-bold border"
                      [ngClass]="{
                        'bg-amber-50 text-amber-900 border-amber-200': item.lastCallStatus === 'Chưa gọi',
                        'bg-orange-50 text-orange-900 border-orange-200': item.lastCallStatus === 'Không bắt máy',
                        'bg-emerald-50 text-emerald-900 border-emerald-200': item.lastCallStatus === 'Đã liên hệ'
                      }"
                    >
                      {{ item.lastCallStatus }}
                    </span>
                    <div class="text-xs text-slate-400 mt-0.5">NV: {{ item.assignedStaff }}</div>
                  </td>
                  <td class="p-4 text-xs text-slate-700 max-w-xs font-medium">
                    {{ item.lastCallNote || 'Chưa có ghi chú phản hồi' }}
                  </td>
                </tr>
                <tr *ngIf="!analyticsData?.examBanRiskList?.length">
                  <td colspan="6" class="p-8 text-center text-slate-400 text-sm font-medium">
                    🎉 Không có sinh viên nào có nguy cơ cấm thi!
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- COMPONENT 6: COURSE & TIMETABLE MANAGEMENT PANEL -->
      <div *ngIf="activeTab === 'courses'" class="bg-white border border-slate-200 p-6 md:p-8 rounded-2xl shadow-sm space-y-6">
        <!-- Header & Action Bar -->
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h3 class="text-lg md:text-xl font-extrabold text-slate-900 flex items-center gap-2">
              <span>📅 Quản Lý Học Phần & Thời Khóa Biểu</span>
            </h3>
            <p class="text-xs text-slate-500 font-medium">Cấu hình Ca học (Sáng / Chiều / Tối), Lịch học trong tuần, Phòng học & Đăng ký môn cho Sinh viên</p>
          </div>
          <div class="flex items-center gap-2">
            <button
              (click)="switchTab('excel')"
              class="px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center gap-1.5"
              title="Tải file mẫu Excel theo học phần để nhập sinh viên hàng loạt"
            >
              📥 Mẫu Excel
            </button>
            <button
              (click)="openCourseModal()"
              class="px-5 py-2.5 bg-blue-900 hover:bg-blue-950 text-white font-extrabold text-xs sm:text-sm rounded-xl shadow-sm transition-all flex items-center gap-2 touch-target"
            >
              <span>➕ TẠO HỌC PHẦN MỚI</span>
            </button>
          </div>
        </div>

        <!-- Visual Shift Filter Tabs for Office Workers -->
        <div class="flex flex-wrap items-center justify-between gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
          <div class="flex items-center space-x-2 overflow-x-auto">
            <button
              (click)="filterShift = ''; loadCourseGroups()"
              [ngClass]="filterShift === '' ? 'bg-blue-900 text-white font-extrabold shadow-sm' : 'bg-white text-slate-700 hover:bg-slate-100 font-bold border border-slate-200'"
              class="px-4 py-2 text-xs rounded-xl transition-all touch-target"
            >
              🌐 Tất cả Ca học ({{ courseGroupList.length }})
            </button>
            <button
              (click)="filterShift = 'Sáng'; loadCourseGroups()"
              [ngClass]="filterShift === 'Sáng' ? 'bg-amber-500 text-white font-extrabold shadow-sm' : 'bg-white text-slate-700 hover:bg-slate-100 font-bold border border-slate-200'"
              class="px-4 py-2 text-xs rounded-xl transition-all touch-target flex items-center gap-1.5"
            >
              <span>☀️ Ca Sáng</span>
            </button>
            <button
              (click)="filterShift = 'Chiều'; loadCourseGroups()"
              [ngClass]="filterShift === 'Chiều' ? 'bg-blue-600 text-white font-extrabold shadow-sm' : 'bg-white text-slate-700 hover:bg-slate-100 font-bold border border-slate-200'"
              class="px-4 py-2 text-xs rounded-xl transition-all touch-target flex items-center gap-1.5"
            >
              <span>🌤️ Ca Chiều</span>
            </button>
            <button
              (click)="filterShift = 'Tối'; loadCourseGroups()"
              [ngClass]="filterShift === 'Tối' ? 'bg-purple-900 text-white font-extrabold shadow-sm' : 'bg-white text-slate-700 hover:bg-slate-100 font-bold border border-slate-200'"
              class="px-4 py-2 text-xs rounded-xl transition-all touch-target flex items-center gap-1.5"
            >
              <span>🌙 Ca Tối</span>
            </button>
          </div>

          <input
            type="text"
            [(ngModel)]="searchCourseTerm"
            (input)="loadCourseGroups()"
            placeholder="🔍 Tìm mã môn, tên môn..."
            class="px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 bg-white min-w-[200px]"
          />
        </div>

        <!-- Alert Message -->
        <div *ngIf="courseAlertMsg" class="p-4 rounded-xl bg-emerald-100 border border-emerald-300 text-emerald-900 text-sm font-bold animate-bounce">
          🎉 {{ courseAlertMsg }}
        </div>

        <!-- Course Cards Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div
            *ngFor="let g of courseGroupList"
            class="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4"
          >
            <div class="space-y-3">
              <!-- Top Badge Header -->
              <div class="flex items-center justify-between gap-2">
                <span
                  class="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider flex items-center gap-1 border"
                  [ngClass]="{
                    'bg-amber-50 text-amber-900 border-amber-300': g.shift === 'Sáng',
                    'bg-blue-50 text-blue-900 border-blue-300': g.shift === 'Chiều',
                    'bg-purple-50 text-purple-900 border-purple-300': g.shift === 'Tối'
                  }"
                >
                  <span *ngIf="g.shift === 'Sáng'">☀️ Ca Sáng</span>
                  <span *ngIf="g.shift === 'Chiều'">🌤️ Ca Chiều</span>
                  <span *ngIf="g.shift === 'Tối'">🌙 Ca Tối</span>
                </span>
                <span class="text-xs font-mono font-bold text-slate-400">ID: {{ g.groupCode }}</span>
              </div>

              <!-- Title & Course Name -->
              <div>
                <h4 class="font-black text-slate-900 text-base leading-snug">{{ g.courseName }}</h4>
                <div class="text-xs text-blue-900 font-mono font-bold mt-0.5">Mã Nhóm: {{ g.groupCode }}</div>
              </div>

              <!-- Schedule Details Card -->
              <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-2 text-slate-700">
                <div class="flex items-center justify-between">
                  <span class="font-bold text-slate-500 uppercase">Lịch học:</span>
                  <div class="flex flex-wrap gap-1">
                    <span
                      *ngFor="let day of g.scheduleDays"
                      class="px-2 py-0.5 rounded bg-blue-100 text-blue-900 font-black text-[11px]"
                    >
                      {{ day }}
                    </span>
                  </div>
                </div>
                <div class="flex items-center justify-between">
                  <span class="font-bold text-slate-500 uppercase">Phòng học:</span>
                  <span class="font-black text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                    📍 {{ g.room || 'Chưa xếp' }}
                  </span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="font-bold text-slate-500 uppercase">Giảng viên:</span>
                  <span class="font-extrabold text-slate-800">👨‍🏫 {{ g.teacherName || 'Chưa phân công' }}</span>
                </div>
                <div *ngIf="g.startDate || g.endDate" class="flex items-center justify-between pt-1 border-t border-slate-200/60">
                  <span class="font-bold text-slate-500 uppercase">Thời gian học:</span>
                  <span class="font-bold text-blue-900 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 text-[11px]">
                    📅 {{ g.startDate ? (g.startDate | date:'dd/MM/yyyy') : '...' }} ➔ {{ g.endDate ? (g.endDate | date:'dd/MM/yyyy') : '...' }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Footer & Student Count -->
            <div class="pt-3 border-t border-slate-100 space-y-3">
              <div class="flex items-center justify-between text-xs font-bold">
                <span class="text-slate-500">Sĩ số sinh viên đăng ký:</span>
                <span class="px-3 py-1 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300 font-black">
                  🎓 {{ g.students?.length || 0 }} SV
                </span>
              </div>

              <!-- Action Buttons -->
              <div class="grid grid-cols-2 gap-2">
                <button
                  (click)="openEnrollModal(g)"
                  class="col-span-2 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs rounded-xl touch-target transition-all flex items-center justify-center gap-1.5"
                >
                  <span>👥 Quản Lý Sinh Viên Đăng Ký ({{ g.students?.length || 0 }})</span>
                </button>
                <button
                  (click)="openCourseModal(g)"
                  class="py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-lg transition-all touch-target"
                >
                  ✏️ Sửa
                </button>
                <button
                  (click)="deleteCourseGroup(g._id)"
                  class="py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-lg transition-all touch-target border border-rose-200"
                >
                  🗑️ Xóa
                </button>
              </div>
            </div>
          </div>

          <div *ngIf="courseGroupList.length === 0" class="col-span-full p-12 text-center bg-slate-50 border border-slate-200 rounded-2xl text-slate-500 font-medium">
            Chưa có nhóm học phần nào phù hợp với bộ lọc. Bấm <b>➕ Tạo Học Phần Mới</b> để bắt đầu.
          </div>
        </div>
      </div>

      <!-- MODAL 1: CREATE / EDIT COURSE GROUP FORM -->
      <div *ngIf="showCourseModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div class="bg-white border border-slate-200 rounded-2xl max-w-xl w-full p-6 space-y-6 shadow-2xl animate-fade-in max-h-[90vh] overflow-y-auto">
          <div class="flex items-center justify-between border-b border-slate-200 pb-4">
            <h3 class="text-lg font-black text-slate-900 flex items-center gap-2">
              <span>{{ editingCourseId ? '✏️ Chỉnh Sửa Học Phần' : '➕ Tạo Mới Nhóm Học Phần' }}</span>
            </h3>
            <button (click)="showCourseModal = false" class="text-slate-400 hover:text-slate-600 font-bold text-xl">✖</button>
          </div>

          <!-- Inline Modal Error Alert Banner -->
          <div *ngIf="modalErrorMsg" class="p-3.5 rounded-xl bg-rose-50 border border-rose-300 text-rose-900 text-xs font-black flex items-center justify-between animate-pulse">
            <span>{{ modalErrorMsg }}</span>
            <button type="button" (click)="modalErrorMsg = ''" class="text-rose-700 font-bold">✖</button>
          </div>

          <form (ngSubmit)="saveCourseGroup()" class="space-y-4 text-xs font-bold text-slate-700">
            <div>
              <label class="block uppercase mb-1">Mã Nhóm Học Phần (Duy nhất) <span class="text-rose-600">*</span></label>
              <input
                type="text"
                [(ngModel)]="courseForm.groupCode"
                name="groupCode"
                required
                [disabled]="!!editingCourseId"
                placeholder="VD: 501_MMT_HK1_26.27_CD25LM"
                class="w-full px-4 py-3 rounded-xl border border-slate-300 font-bold text-sm bg-white text-slate-900"
              />
            </div>

            <div>
              <label class="block uppercase mb-1">Tên Môn Học / Học Phần</label>
              <input
                type="text"
                [(ngModel)]="courseForm.courseName"
                name="courseName"
                required
                placeholder="VD: Mạng Máy Tính Cơ Bản"
                class="w-full px-4 py-3 rounded-xl border border-slate-300 font-bold text-sm bg-white text-slate-900"
              />
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block uppercase mb-1">Ca Học Trong Ngày</label>
                <select
                  [(ngModel)]="courseForm.shift"
                  name="shift"
                  class="w-full px-4 py-3 rounded-xl border border-slate-300 font-extrabold text-sm bg-white text-slate-900"
                >
                  <option value="Sáng">☀️ Ca Sáng</option>
                  <option value="Chiều">🌤️ Ca Chiều</option>
                  <option value="Tối">🌙 Ca Tối</option>
                </select>
              </div>

              <div>
                <label class="block uppercase mb-1">Phòng Học</label>
                <input
                  type="text"
                  [(ngModel)]="courseForm.room"
                  name="room"
                  placeholder="VD: A.201 hoặc Lab 03"
                  class="w-full px-4 py-3 rounded-xl border border-slate-300 font-bold text-sm bg-white text-slate-900"
                />
              </div>
            </div>

            <!-- Start Date & End Date Range Picker -->
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block uppercase mb-1">📅 Ngày Bắt Đầu Học</label>
                <input
                  type="date"
                  [(ngModel)]="courseForm.startDate"
                  (change)="onStartDateChange()"
                  name="startDate"
                  class="w-full px-4 py-3 rounded-xl border border-slate-300 font-bold text-sm bg-white text-slate-900"
                />
              </div>
              <div>
                <label class="block uppercase mb-1">🏁 Ngày Kết Thúc Học</label>
                <input
                  type="date"
                  [(ngModel)]="courseForm.endDate"
                  name="endDate"
                  class="w-full px-4 py-3 rounded-xl border border-slate-300 font-bold text-sm bg-white text-slate-900"
                />
              </div>
            </div>

            <!-- Schedule Days Multi-Checkbox Chips -->
            <div>
              <label class="block uppercase mb-2 flex items-center justify-between">
                <span>Các Ngày Học Trong Tuần</span>
                <span *ngIf="getPrimaryDayFromDate(courseForm.startDate)" class="text-[11px] text-blue-900 font-bold bg-blue-50 px-2.5 py-0.5 rounded border border-blue-200">
                  🔒 Thứ cố định: <b>{{ getPrimaryDayFromDate(courseForm.startDate) }}</b> (theo Ngày bắt đầu)
                </span>
              </label>
              <div class="flex flex-wrap gap-2">
                <button
                  type="button"
                  *ngFor="let d of availableDays"
                  (click)="toggleScheduleDay(d)"
                  [ngClass]="{
                    'bg-amber-500 text-white font-black border-amber-600 shadow-sm': d === getPrimaryDayFromDate(courseForm.startDate),
                    'bg-blue-900 text-white font-black border-blue-950': courseForm.scheduleDays.includes(d) && d !== getPrimaryDayFromDate(courseForm.startDate),
                    'bg-slate-100 text-slate-700 hover:bg-slate-200 font-bold border-slate-300': !courseForm.scheduleDays.includes(d)
                  }"
                  class="px-3.5 py-2 rounded-xl text-xs transition-all touch-target border flex items-center gap-1"
                >
                  <span *ngIf="d === getPrimaryDayFromDate(courseForm.startDate)">🔒</span>
                  <span>{{ d }}</span>
                </button>
              </div>
            </div>

            <div>
              <label class="block uppercase mb-1">Giảng Viên / Nhân Viên Phụ Trách Lớp</label>
              <select
                [(ngModel)]="courseForm.teacherId"
                name="teacherId"
                class="w-full px-4 py-3 rounded-xl border border-slate-300 font-bold text-sm bg-white text-slate-900"
              >
                <option value="">-- Chọn Giảng viên / Nhân viên phụ trách --</option>
                <option *ngFor="let staff of staffList" [value]="staff.id || staff._id">
                  👨‍🏫 {{ staff.fullName }} ({{ staff.email }})
                </option>
              </select>
            </div>

            <div class="pt-4 flex items-center justify-end space-x-3 border-t border-slate-200">
              <button
                type="button"
                (click)="showCourseModal = false"
                class="px-5 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold touch-target"
              >
                Hủy
              </button>
              <button
                type="submit"
                [disabled]="isSavingCourse"
                class="px-6 py-3 rounded-xl bg-blue-900 hover:bg-blue-950 disabled:bg-slate-400 text-white font-extrabold text-sm shadow-md transition-all flex items-center gap-2 touch-target cursor-pointer disabled:cursor-not-allowed"
              >
                <svg *ngIf="isSavingCourse" class="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>{{ isSavingCourse ? 'Đang lưu dữ liệu...' : '💾 LƯU HỌC PHẦN' }}</span>
              </button>
            </div>
          </form>
        </div>
      </div>

      <!-- MODAL 2: ENROLLED STUDENTS MANAGEMENT MODAL -->
      <div *ngIf="showEnrollModal && activeGroupForEnroll" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div class="bg-white border border-slate-200 rounded-2xl max-w-3xl w-full p-6 space-y-6 shadow-2xl animate-fade-in max-h-[90vh] overflow-y-auto">
          <!-- Modal Header -->
          <div class="flex items-center justify-between border-b border-slate-200 pb-4">
            <div>
              <span class="px-2.5 py-0.5 rounded bg-blue-50 text-blue-900 font-mono font-bold text-xs border border-blue-200">
                {{ activeGroupForEnroll.groupCode }}
              </span>
              <h3 class="text-lg font-black text-slate-900 mt-1">
                👥 Danh Sách Sinh Viên Đăng Ký Học Phần: {{ activeGroupForEnroll.courseName }}
              </h3>
            </div>
            <button (click)="showEnrollModal = false" class="text-slate-400 hover:text-slate-600 font-bold text-xl">✖</button>
          </div>

          <!-- Quick Enroll Options Box -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
            <!-- Option 1: Enroll Entire Class -->
            <div class="space-y-2">
              <label class="block text-xs font-black text-slate-700 uppercase">⚡ Option 1: Đăng ký Nguyên Cả Lớp</label>
              <div class="flex items-center space-x-2">
                <input
                  type="text"
                  [(ngModel)]="classToEnroll"
                  placeholder="VD: CD25CT1"
                  class="px-3 py-2 rounded-lg border border-slate-300 text-xs font-bold text-slate-900 bg-white flex-1"
                />
                <button
                  type="button"
                  (click)="enrollEntireClass()"
                  class="px-3.5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs touch-target"
                >
                  ➕ Thêm Cả Lớp
                </button>
              </div>
            </div>

            <!-- Option 2: Enroll Individual Student by MSSV -->
            <div class="space-y-2">
              <label class="block text-xs font-black text-slate-700 uppercase">➕ Option 2: Thêm SV Lẻ Theo MSSV</label>
              <div class="flex items-center space-x-2">
                <input
                  type="text"
                  [(ngModel)]="mssvToEnroll"
                  placeholder="VD: 501250001"
                  class="px-3 py-2 rounded-lg border border-slate-300 text-xs font-bold text-slate-900 bg-white flex-1"
                />
                <button
                  type="button"
                  (click)="enrollSingleStudent()"
                  class="px-3.5 py-2 rounded-lg bg-blue-900 hover:bg-blue-950 text-white font-extrabold text-xs touch-target"
                >
                  ➕ Thêm SV
                </button>
              </div>
            </div>
          </div>

          <!-- Alert -->
          <div *ngIf="enrollAlertMsg" class="p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-xs font-bold">
            ℹ️ {{ enrollAlertMsg }}
          </div>

          <!-- Currently Enrolled Students Table -->
          <div class="space-y-3">
            <div class="flex items-center justify-between text-xs font-extrabold text-slate-800 uppercase">
              <span>Danh Sách {{ activeGroupForEnroll.students?.length || 0 }} Sinh Viên Đã Đăng Ký:</span>
            </div>

            <div class="max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white">
              <table class="w-full text-left border-collapse text-xs">
                <thead class="sticky top-0 bg-slate-100 text-slate-800 uppercase font-black border-b border-slate-200">
                  <tr>
                    <th class="p-3">#</th>
                    <th class="p-3">MSSV</th>
                    <th class="p-3">Họ và Tên</th>
                    <th class="p-3">Lớp Sinh Hoạt</th>
                    <th class="p-3">SĐT SV</th>
                    <th class="p-3 text-right">Thao Tác</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-200">
                  <tr *ngFor="let st of activeGroupForEnroll.students; let idx = index" class="hover:bg-slate-50 font-medium">
                    <td class="p-3 font-bold text-slate-400">{{ idx + 1 }}</td>
                    <td class="p-3 font-mono font-black text-blue-900 bg-blue-50/60 rounded px-2">{{ st.studentCode }}</td>
                    <td class="p-3 font-extrabold text-slate-900">{{ st.fullName }}</td>
                    <td class="p-3 font-bold text-slate-700">{{ st.classCode }}</td>
                    <td class="p-3 text-slate-600">{{ st.phone || 'Chưa có' }}</td>
                    <td class="p-3 text-right">
                      <button
                        (click)="unenrollStudent(st._id)"
                        class="px-2.5 py-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold border border-rose-200 text-xs touch-target min-h-[30px]"
                      >
                        ❌ Rút tên
                      </button>
                    </td>
                  </tr>
                  <tr *ngIf="!activeGroupForEnroll.students?.length">
                    <td colspan="6" class="p-8 text-center text-slate-400 text-xs font-medium">
                      Chưa có sinh viên nào đăng ký môn học này. Hãy thêm từ các tùy chọn ở trên.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <!-- MODAL 3: EDIT STAFF ACCOUNT MODAL -->
      <div *ngIf="showEditStaffModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div class="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 space-y-6 shadow-2xl animate-fade-in">
          <div class="flex items-center justify-between border-b border-slate-200 pb-4">
            <h3 class="text-lg font-black text-slate-900 flex items-center gap-2">
              <span>✏️ Chỉnh Sửa Tài Khoản Nhân Viên</span>
            </h3>
            <button (click)="showEditStaffModal = false" class="text-slate-400 hover:text-slate-600 font-bold text-xl">✖</button>
          </div>

          <form (ngSubmit)="saveEditStaff()" class="space-y-4 text-xs font-bold text-slate-700">
            <div>
              <label class="block uppercase mb-1">Họ và Tên Nhân Viên <span class="text-rose-600">*</span></label>
              <input
                type="text"
                [(ngModel)]="editStaffName"
                name="editStaffName"
                required
                class="w-full px-4 py-3 rounded-xl border border-slate-300 font-bold text-sm bg-white text-slate-900"
              />
            </div>

            <div>
              <label class="block uppercase mb-1">Địa chỉ Email <span class="text-rose-600">*</span></label>
              <input
                type="email"
                [(ngModel)]="editStaffEmail"
                name="editStaffEmail"
                required
                class="w-full px-4 py-3 rounded-xl border border-slate-300 font-bold text-sm bg-white text-slate-900 font-mono"
              />
            </div>

            <div>
              <label class="block uppercase mb-1">Vai Trò Tài Khoản</label>
              <select
                [(ngModel)]="editStaffRole"
                name="editStaffRole"
                class="w-full px-4 py-3 rounded-xl border border-slate-300 font-extrabold text-sm bg-white text-slate-900"
              >
                <option value="staff">🎧 Nhân Viên CSKH (Chăm sóc sinh viên)</option>
                <option value="teacher">👨‍🏫 Giảng Viên Giảng Dạy (Điểm danh môn)</option>
              </select>
            </div>

            <div>
              <label class="block uppercase mb-1">Đặt Mật Khẩu Mới (Để trống nếu giữ nguyên)</label>
              <input
                type="text"
                [(ngModel)]="editStaffPass"
                name="editStaffPass"
                placeholder="Nhập mật khẩu mới tại đây..."
                class="w-full px-4 py-3 rounded-xl border border-slate-300 font-bold text-sm bg-white text-slate-900 font-mono"
              />
            </div>

            <div class="pt-4 flex items-center justify-end space-x-3 border-t border-slate-200">
              <button
                type="button"
                (click)="showEditStaffModal = false"
                class="px-5 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold touch-target"
              >
                Hủy
              </button>
              <button
                type="submit"
                [disabled]="isUpdatingStaff"
                class="px-6 py-3 rounded-xl bg-blue-900 hover:bg-blue-950 disabled:bg-slate-400 text-white font-extrabold text-sm shadow-md transition-all flex items-center gap-2 touch-target cursor-pointer"
              >
                <span>{{ isUpdatingStaff ? 'Đang lưu...' : '💾 LƯU THAY ĐỔI' }}</span>
              </button>
            </div>
          </form>
        </div>
      </div>

      <!-- COMPONENT 5: SYSTEM CONFIG MASTER -->
      <div *ngIf="activeTab === 'settings'" class="bg-white border border-slate-200 p-6 md:p-8 rounded-2xl shadow-sm space-y-6">
        <div class="border-b border-slate-200 pb-4 flex items-center justify-between flex-wrap gap-4">
          <div>
            <h3 class="text-lg md:text-xl font-extrabold text-slate-900 flex items-center gap-2">
              <span>⚙️ Cấu Hình Hệ Thống Động (System Config Master)</span>
            </h3>
            <p class="text-xs text-slate-500 font-medium mt-0.5">
              Tùy chỉnh ngưỡng cấm thi, cảnh báo phụ huynh, danh mục lý do vắng, bảng thẻ nhãn và dải mã ngành crawler trực tiếp không cần sửa code.
            </p>
          </div>
          <button
            (click)="saveSettings()"
            [disabled]="isSavingSettings"
            class="px-6 py-3 bg-blue-900 hover:bg-blue-950 text-white font-extrabold text-xs sm:text-sm rounded-xl shadow-md transition-all flex items-center gap-2 touch-target cursor-pointer"
          >
            <span>{{ isSavingSettings ? 'Đang lưu...' : '💾 LƯU CẤU HÌNH HỆ THỐNG' }}</span>
          </button>
        </div>

        <!-- 1. Threshold Config Section -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div class="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
            <label class="block text-xs font-black text-slate-800 uppercase">
              🚫 Ngưỡng Khóa / Cấm Thi (Mặc định: 3):
            </label>
            <div class="flex items-center gap-3">
              <input
                type="number"
                min="1"
                max="10"
                [(ngModel)]="sysSettings.examBanThreshold"
                class="w-full px-4 py-3 rounded-xl border border-slate-300 font-black text-lg text-rose-900 bg-white"
              />
              <span class="text-xs text-slate-500 font-bold">buổi vắng</span>
            </div>
            <p class="text-[11px] text-slate-500 font-medium">Sinh viên vắng từ số buổi này trở lên sẽ bị gắn cờ nguy cơ cấm thi.</p>
          </div>

          <div class="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
            <label class="block text-xs font-black text-slate-800 uppercase">
              👨‍👩‍👦 Ngưỡng Cảnh Báo Phụ Huynh (Mặc định: 2):
            </label>
            <div class="flex items-center gap-3">
              <input
                type="number"
                min="1"
                max="10"
                [(ngModel)]="sysSettings.parentWarningThreshold"
                class="w-full px-4 py-3 rounded-xl border border-slate-300 font-black text-lg text-amber-900 bg-white"
              />
              <span class="text-xs text-slate-500 font-bold">buổi vắng</span>
            </div>
            <p class="text-[11px] text-slate-500 font-medium">Gửi cảnh báo và yêu cầu CSKH gọi điện báo cho Phụ huynh.</p>
          </div>

          <div class="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
            <label class="block text-xs font-black text-slate-800 uppercase">
              🔄 Quy Tắc Phân Công Cuộc Gọi Mặc Định:
            </label>
            <select
              [(ngModel)]="sysSettings.taskAssignmentRule"
              class="w-full px-4 py-3 rounded-xl border border-slate-300 font-extrabold text-sm text-slate-900 bg-white"
            >
              <option value="round-robin">🔄 Xoay Vòng Round-Robin</option>
              <option value="least-tasks">📊 Ít Việc Nhất (Least-Tasks)</option>
              <option value="admin-only">🛡️ Quản Trị Viên (Admin Only)</option>
            </select>
            <p class="text-[11px] text-slate-500 font-medium">Quy tắc fallback khi Lớp sinh hoạt chưa được gán nhân viên phụ trách.</p>
          </div>
        </div>

        <!-- 2. Absence Reasons Category List Manager -->
        <div class="p-6 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
          <div class="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h4 class="font-extrabold text-slate-900 text-sm uppercase">📋 Danh Mục Lý Do Vắng Chuẩn</h4>
              <p class="text-xs text-slate-500 font-medium">CSKH sẽ chọn các lý do chuẩn này khi gọi điện xác minh vắng học.</p>
            </div>
            <span class="text-xs font-bold text-blue-900 bg-blue-50 px-2.5 py-1 rounded border border-blue-200">
              {{ sysSettings.absenceReasons?.length || 0 }} lý do chuẩn
            </span>
          </div>

          <div class="flex flex-wrap gap-2">
            <span
              *ngFor="let reason of sysSettings.absenceReasons"
              class="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-slate-300 text-slate-800 text-xs font-bold shadow-sm"
            >
              <span>📌 {{ reason }}</span>
              <button (click)="removeAbsenceReason(reason)" class="text-rose-500 hover:text-rose-700 font-black">✖</button>
            </span>
          </div>

          <div class="flex items-center gap-3 pt-2">
            <input
              type="text"
              [(ngModel)]="newReasonInput"
              (keyup.enter)="addAbsenceReason()"
              placeholder="Nhập lý do vắng mới (VD: Bận thi lại, Tai nạn giao thông...)"
              class="px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-900 bg-white flex-1"
            />
            <button
              (click)="addAbsenceReason()"
              class="px-4 py-2.5 bg-blue-900 hover:bg-blue-950 text-white font-bold text-xs rounded-xl touch-target"
            >
              ➕ Thêm Lý Do
            </button>
          </div>
        </div>

        <!-- 3. Student Tags Manager -->
        <div class="p-6 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
          <div class="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h4 class="font-extrabold text-slate-900 text-sm uppercase">🏷️ Bảng Thẻ Nhãn Phân Loại Sinh Viên (Tags)</h4>
              <p class="text-xs text-slate-500 font-medium">Gắn nhãn đặc biệt trên hồ sơ sinh viên để theo dõi và ưu tiên chăm sóc.</p>
            </div>
            <span class="text-xs font-bold text-purple-900 bg-purple-50 px-2.5 py-1 rounded border border-purple-200">
              {{ sysSettings.tags?.length || 0 }} Thẻ nhãn
            </span>
          </div>

          <div class="flex flex-wrap gap-2">
            <span
              *ngFor="let tag of sysSettings.tags"
              class="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-purple-100 border border-purple-300 text-purple-950 text-xs font-black shadow-sm"
            >
              <span>{{ tag }}</span>
              <button (click)="removeTag(tag)" class="text-purple-600 hover:text-rose-700 font-black">✖</button>
            </span>
          </div>

          <div class="flex items-center gap-3 pt-2">
            <input
              type="text"
              [(ngModel)]="newTagInput"
              (keyup.enter)="addTag()"
              placeholder="Nhập thẻ nhãn mới (VD: #HọcBổng, #CầnHỗTrợTâmLý...)"
              class="px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-900 bg-white flex-1"
            />
            <button
              (click)="addTag()"
              class="px-4 py-2.5 bg-purple-900 hover:bg-purple-950 text-white font-bold text-xs rounded-xl touch-target"
            >
              ➕ Thêm Thẻ Nhãn
            </button>
          </div>
        </div>

        <!-- 4. Crawler Major Prefixes Manager -->
        <div class="p-6 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
          <div class="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h4 class="font-extrabold text-slate-900 text-sm uppercase">🕷️ Dải Mã Ngành Quét Crawler</h4>
              <p class="text-xs text-slate-500 font-medium">Cấu hình các tiền tố MSSV mã ngành hệ thống tự động quét.</p>
            </div>
            <span class="text-xs font-bold text-emerald-900 bg-emerald-50 px-2.5 py-1 rounded border border-emerald-200">
              {{ sysSettings.crawlerMajorPrefixes?.length || 0 }} Mã ngành
            </span>
          </div>

          <div class="flex flex-wrap gap-2">
            <span
              *ngFor="let prefix of sysSettings.crawlerMajorPrefixes"
              class="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-100 border border-emerald-300 text-emerald-950 text-xs font-black shadow-sm"
            >
              <span>Code: {{ prefix }}</span>
              <button (click)="removeCrawlerPrefix(prefix)" class="text-emerald-700 hover:text-rose-700 font-black">✖</button>
            </span>
          </div>

          <div class="flex items-center gap-3 pt-2">
            <input
              type="text"
              [(ngModel)]="newPrefixInputConfig"
              (keyup.enter)="addCrawlerPrefix()"
              placeholder="Nhập mã ngành mới (VD: 801, 902...)"
              class="px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-900 bg-white flex-1"
            />
            <button
              (click)="addCrawlerPrefix()"
              class="px-4 py-2.5 bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs rounded-xl touch-target"
            >
              ➕ Thêm Mã Ngành
            </button>
          </div>
        </div>
      </div>

      <!-- MODAL: ASSIGN FIXED HOME CLASSES TO STAFF -->
      <div *ngIf="showAssignClassModal" class="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
        <div class="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-fade-in border border-slate-200">
          <div class="flex items-center justify-between border-b border-slate-200 pb-3">
            <div>
              <h3 class="text-lg font-black text-slate-900">🏫 Phân Công Lớp Sinh Hoạt Cố Định</h3>
              <p class="text-xs text-slate-500 font-medium">Nhân viên: <strong class="text-blue-900">{{ selectedStaffForClassAssign?.fullName }}</strong></p>
            </div>
            <button (click)="showAssignClassModal = false" class="text-slate-400 hover:text-slate-600 font-bold text-xl">✖</button>
          </div>

          <div class="space-y-3">
            <label class="block text-xs font-bold text-slate-700 uppercase">
              Chọn Các Lớp Sinh Hoạt Phụ Trách:
            </label>
            <div class="flex flex-wrap gap-2 max-h-60 overflow-y-auto p-2 border rounded-xl bg-slate-50">
              <button
                type="button"
                *ngFor="let cCode of availableHomeClasses"
                (click)="toggleClassSelectionForAssign(cCode)"
                [ngClass]="selectedHomeClassesForAssign.includes(cCode) ? 'bg-blue-900 text-white font-extrabold border-blue-950' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'"
                class="px-3.5 py-2 rounded-xl text-xs border font-mono transition-all flex items-center gap-1.5"
              >
                <span>{{ selectedHomeClassesForAssign.includes(cCode) ? '✅' : '🏫' }}</span>
                <span>{{ cCode }}</span>
              </button>
              <div *ngIf="!availableHomeClasses.length" class="text-xs text-slate-400 italic p-4 text-center w-full">
                Chưa có danh sách lớp từ sinh viên. Hãy import sinh viên bằng Excel trước.
              </div>
            </div>
          </div>

          <div class="pt-4 flex items-center justify-end space-x-3 border-t border-slate-200">
            <button (click)="showAssignClassModal = false" class="px-5 py-2.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs">Hủy</button>
            <button (click)="saveClassAssignment()" class="px-6 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-extrabold text-xs rounded-md shadow-md">💾 LƯU PHÂN CÔNG LỚP</button>
          </div>
        </div>
      </div>

      <!-- MODAL: ASSIGN INDIVIDUAL EXCEPTION STUDENTS TO STAFF -->
      <div *ngIf="showAssignStudentModal" class="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
        <div class="bg-white rounded-md max-w-xl w-full p-6 shadow-xl space-y-4 border border-slate-200 animate-fade-in">
          <div class="flex items-center justify-between border-b border-slate-200 pb-3">
            <div>
              <h3 class="text-base font-bold text-slate-900">👤 Phân Công Sinh Viên Ngoại Lệ Cá Nhân</h3>
              <p class="text-xs text-slate-600">Nhân viên: <strong class="text-slate-900">{{ selectedStaffForStudentAssign?.fullName }}</strong></p>
            </div>
            <button (click)="showAssignStudentModal = false" class="text-slate-400 hover:text-slate-600 font-bold text-lg">✖</button>
          </div>

          <!-- Search box -->
          <div>
            <input
              type="text"
              [(ngModel)]="studentSearchQuery"
              placeholder="Tìm kiếm sinh viên theo MSSV, Họ tên hoặc Lớp..."
              class="w-full px-3 py-2 border border-slate-300 rounded-md text-xs bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-800"
            />
          </div>

          <div class="space-y-2">
            <label class="block text-xs font-semibold text-slate-700 uppercase">
              Chọn sinh viên ngoại lệ gán riêng cho Nhân viên này:
            </label>
            <div class="max-h-64 overflow-y-auto border rounded-md border-slate-200 divide-y divide-slate-100 bg-slate-50">
              <div
                *ngFor="let st of filteredStudentsForAssign"
                (click)="toggleStudentSelectionForAssign(st._id)"
                class="p-2.5 flex items-center justify-between cursor-pointer hover:bg-slate-100 text-xs transition-all"
                [ngClass]="{'bg-blue-50 text-blue-950 font-bold': selectedStudentsForAssign.includes(st._id)}"
              >
                <div class="flex items-center space-x-2">
                  <span>{{ selectedStudentsForAssign.includes(st._id) ? '✅' : '⚪' }}</span>
                  <span class="font-mono text-slate-900 font-bold">{{ st.studentCode }}</span>
                  <span class="text-slate-800">{{ st.fullName }}</span>
                  <span class="text-slate-500 text-[11px]">({{ st.classCode }})</span>
                </div>
                <span *ngIf="selectedStudentsForAssign.includes(st._id)" class="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-semibold">Đã chọn</span>
              </div>
              <div *ngIf="filteredStudentsForAssign.length === 0" class="text-xs text-slate-400 italic p-4 text-center">
                Không tìm thấy sinh viên phù hợp.
              </div>
            </div>
            <p class="text-[11px] text-slate-500 font-medium">Đã chọn {{ selectedStudentsForAssign.length }} sinh viên ngoại lệ.</p>
          </div>

          <div class="pt-3 flex items-center justify-end space-x-2 border-t border-slate-200">
            <button (click)="showAssignStudentModal = false" class="px-4 py-2 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs">Hủy</button>
            <button (click)="saveStudentAssignment()" class="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-md shadow-sm">💾 LƯU PHÂN CÔNG NGOẠI LỆ</button>
          </div>
        </div>
      </div>

      <!-- MODAL: HANDOVER / TRANSFER CLASSES 1-CLICK -->
      <div *ngIf="showHandoverModal" class="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
        <div class="bg-white rounded-2xl max-w-xl w-full p-6 md:p-8 shadow-2xl space-y-6 animate-fade-in border border-slate-200">
          <div class="flex items-center justify-between border-b border-slate-200 pb-3">
            <div>
              <h3 class="text-lg md:text-xl font-black text-slate-900 flex items-center gap-2">
                <span>🔄 Bàn Giao Lớp Sinh Hoạt & Công Việc (1-Click)</span>
              </h3>
              <p class="text-xs text-slate-500 font-medium">Chuyển quyền phụ trách các lớp và tự động chuyển toàn bộ cuộc gọi chưa xong</p>
            </div>
            <button (click)="showHandoverModal = false" class="text-slate-400 hover:text-slate-600 font-bold text-xl">✖</button>
          </div>

          <div class="space-y-4">
            <div>
              <label class="block text-xs font-black text-slate-700 uppercase mb-1">1. Nhân Viên Chuyển Giao (Bên Giao) <span class="text-rose-600">*</span></label>
              <select
                [(ngModel)]="handoverFromStaffId"
                (change)="onHandoverFromStaffChange()"
                class="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm font-extrabold text-slate-900 bg-white"
              >
                <option value="">-- Chọn nhân viên bàn giao --</option>
                <option *ngFor="let s of staffList" [value]="s._id || s.id">
                  👨‍💼 {{ s.fullName }} (Đang giữ {{ s.managedClasses?.length || 0 }} lớp)
                </option>
              </select>
            </div>

            <div>
              <label class="block text-xs font-black text-slate-700 uppercase mb-1">2. Nhân Viên Tiếp Nhận (Bên Nhận) <span class="text-rose-600">*</span></label>
              <select
                [(ngModel)]="handoverToStaffId"
                class="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm font-extrabold text-slate-900 bg-white"
              >
                <option value="">-- Chọn nhân viên tiếp nhận --</option>
                <option *ngFor="let s of staffList" [value]="s._id || s.id">
                  👨‍💼 {{ s.fullName }} (Hiện có {{ s.managedClasses?.length || 0 }} lớp)
                </option>
              </select>
            </div>

            <div *ngIf="handoverFromStaffId" class="p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-2">
              <span class="text-xs font-black text-amber-900 uppercase">Danh sách {{ handoverClassesToTransfer.length }} Lớp sẽ chuyển giao:</span>
              <div class="flex flex-wrap gap-1.5">
                <span *ngFor="let cCode of handoverClassesToTransfer" class="px-2.5 py-1 rounded bg-amber-200 text-amber-950 font-mono font-bold text-xs border border-amber-300">
                  🏫 {{ cCode }}
                </span>
                <span *ngIf="!handoverClassesToTransfer.length" class="text-xs text-amber-800 italic">Nhân viên này chưa có lớp nào để bàn giao.</span>
              </div>
            </div>
          </div>

          <div class="pt-4 flex items-center justify-end space-x-3 border-t border-slate-200">
            <button (click)="showHandoverModal = false" class="px-5 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs">Hủy</button>
            <button
              (click)="executeHandover()"
              [disabled]="isExecutingHandover || !handoverFromStaffId || !handoverToStaffId"
              class="px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-extrabold text-xs sm:text-sm rounded-xl shadow-md transition-all touch-target cursor-pointer disabled:opacity-50"
            >
              <span>{{ isExecutingHandover ? 'Đang chuyển giao...' : '⚡ XÁC NHẬN BÀN GIAO 1-CLICK' }}</span>
            </button>
          </div>
        </div>
      </div>

    </div>
  `,
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
  private analyticsInterval: any = null;

  constructor(
    private crawlerService: CrawlerService,
    private excelService: ExcelService,
    private staffService: StaffService,
    private analyticsService: AnalyticsService,
    private settingsService: SettingsService,
    private courseGroupService: CourseGroupService,
    private cdr: ChangeDetectorRef
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
      this.editingCourseId = group._id || (group as any).id || '';
      let tId = '';
      if (group.teacherId) {
        tId = typeof group.teacherId === 'string' ? group.teacherId : (group.teacherId as any)._id || group.teacherId.id || '';
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
      this.triggerToast('info', 'Thứ Học Cố Định', 'Ngày ' + day + ' là thứ trùng với Ngày bắt đầu học phần, không thể tắt!');
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
        this.modalErrorMsg = '⚠️ Kết nối máy chủ phản hồi chậm hoặc có lỗi xảy ra. Vui lòng thử lại!';
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
          })
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
          })
        )
        .subscribe({
          next: (res) => {
            this.showCourseModal = false;
            const msg = 'Đã thêm thành công học phần ' + (res.group?.courseName || '') + ' (' + (res.group?.groupCode || '') + ')!';
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
    this.courseGroupService.assignClass(this.activeGroupForEnroll._id, this.classToEnroll.trim()).subscribe({
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
      this.sysSettings.absenceReasons = this.sysSettings.absenceReasons.filter(r => r !== reason);
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
      this.sysSettings.tags = this.sysSettings.tags.filter(t => t !== tag);
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
      this.sysSettings.crawlerMajorPrefixes = this.sysSettings.crawlerMajorPrefixes.filter(p => p !== prefix);
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
      this.selectedHomeClassesForAssign = this.selectedHomeClassesForAssign.filter(c => c !== classCode);
    } else {
      this.selectedHomeClassesForAssign.push(classCode);
    }
  }

  saveClassAssignment() {
    if (!this.selectedStaffForClassAssign) return;
    const staffId = this.selectedStaffForClassAssign._id || this.selectedStaffForClassAssign.id || '';
    this.staffService.assignManagedClasses(staffId, this.selectedHomeClassesForAssign).subscribe({
      next: (res) => {
        this.showAssignClassModal = false;
        this.triggerToast('success', 'Phân Công Lớp Thành Công!', res.message);
        this.loadClassAssignments();
      },
      error: (err) => this.triggerToast('error', 'Lỗi Phân Công Lớp', err.error?.message || 'Lỗi gán lớp')
    });
  }

  // Student Exception Assignment Methods
  openAssignStudentModal(staff: User) {
    this.selectedStaffForStudentAssign = staff;
    this.selectedStudentsForAssign = (staff.managedStudents || []).map((s: any) => typeof s === 'string' ? s : (s._id || s.id));
    this.studentSearchQuery = '';
    this.showAssignStudentModal = true;
    this.cdr.detectChanges();
  }

  toggleStudentSelectionForAssign(studentId: string) {
    if (this.selectedStudentsForAssign.includes(studentId)) {
      this.selectedStudentsForAssign = this.selectedStudentsForAssign.filter(id => id !== studentId);
    } else {
      this.selectedStudentsForAssign.push(studentId);
    }
  }

  saveStudentAssignment() {
    if (!this.selectedStaffForStudentAssign) return;
    const staffId = this.selectedStaffForStudentAssign._id || this.selectedStaffForStudentAssign.id || '';
    this.staffService.assignManagedStudents(staffId, this.selectedStudentsForAssign).subscribe({
      next: (res) => {
        this.showAssignStudentModal = false;
        this.triggerToast('success', 'Phân Công Ngoại Lệ SV Thành Công!', res.message);
        this.loadClassAssignments();
      },
      error: (err) => this.triggerToast('error', 'Lỗi Phân Công SV Ngoại Lệ', err.error?.message || 'Lỗi gán sinh viên')
    });
  }

  get filteredStudentsForAssign(): any[] {
    if (!this.studentSearchQuery) return this.allAvailableStudents;
    const q = this.studentSearchQuery.toLowerCase().trim();
    return this.allAvailableStudents.filter(
      st => (st.studentCode && st.studentCode.toLowerCase().includes(q)) ||
            (st.fullName && st.fullName.toLowerCase().includes(q)) ||
            (st.classCode && st.classCode.toLowerCase().includes(q))
    );
  }

  getStudentCodeDisplay(st: any): string {
    if (!st) return '';
    return typeof st === 'string' ? st : (st.studentCode || st._id);
  }

  getStudentDisplayName(st: any): string {
    if (!st || typeof st === 'string') return '';
    return `${st.studentCode} - ${st.fullName} (${st.classCode})`;
  }

  openHandoverModal(staff?: User) {
    this.handoverFromStaffId = staff ? (staff._id || staff.id || '') : '';
    this.handoverToStaffId = '';
    this.onHandoverFromStaffChange();
    this.showHandoverModal = true;
    this.cdr.detectChanges();
  }

  onHandoverFromStaffChange() {
    const fromStaff = this.staffList.find(s => (s._id || s.id) === this.handoverFromStaffId);
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
    this.staffService.transferClasses({
      fromStaffId: this.handoverFromStaffId,
      toStaffId: this.handoverToStaffId,
      classCodes: this.handoverClassesToTransfer
    }).subscribe({
      next: (res) => {
        this.isExecutingHandover = false;
        this.showHandoverModal = false;
        this.triggerToast('success', 'Bàn Giao Thành Công!', res.message);
        this.loadClassAssignments();
      },
      error: (err) => {
        this.isExecutingHandover = false;
        this.triggerToast('error', 'Lỗi Bàn Giao', err.error?.message || 'Bàn giao lớp thất bại');
      }
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
        this.triggerToast('error', 'Lỗi Xuất File', err.error?.message || 'Không thể tạo file mẫu Excel');
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
    navigator.clipboard.writeText(pass).then(() => {
      this.triggerToast('success', 'Đã Sao Chép!', 'Mật khẩu đã được lưu vào khay nhớ tạm (Clipboard).');
    }).catch(() => {
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
        })
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
    this.editStaffRole = (staff.role === 'teacher' ? 'teacher' : 'staff');
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
        })
      )
      .subscribe({
        next: (res) => {
          this.showEditStaffModal = false;
          const msg = res.message || 'Cập nhật tài khoản nhân viên thành công!';
          this.triggerToast('success', 'Thành Công!', msg);
          if (this.editStaffPass.trim()) {
            this.staffCreatedMsg = 'Đã cập nhật thông tin và mật khẩu mới cho ' + this.editStaffName + '!';
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
    const customPass = prompt('Nhập mật khẩu mới cho nhân viên "' + staff.fullName + '" (để trống nếu muốn tự động sinh ngẫu nhiên):', '');
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
        const msg = err.error?.message || err.statusText || 'Không thể kết nối đến máy chủ API backend';
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
    if (!confirm('⚠️ BẠN CÓ CHẮC CHẮN MUỐN XÓA VĨNH VIỄN TÀI KHOẢN NHÂN VIÊN "' + staff.fullName + '" (' + staff.email + ')?')) return;
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
