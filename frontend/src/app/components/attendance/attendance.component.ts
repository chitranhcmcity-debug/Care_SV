import { Component, OnInit, OnDestroy, ChangeDetectorRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { AttendanceService, AttendanceHistoryItem, AttendanceSummary, StudentSummary, SubmitAttendanceResult, ScheduleSession, ScheduleData } from '../../services/attendance.service';
import { AuthService } from '../../services/auth.service';
import { CallTaskService } from '../../services/call-task.service';
import { StaffService } from '../../services/staff.service';
import { CourseGroup, Student, CallTask } from '../../models/types';

@Component({
  selector: 'app-attendance',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="min-h-screen bg-slate-50 font-sans text-slate-800 pb-20 md:pb-12">
      
      <!-- ========================================================= -->
      <!-- MOBILE ONLY TOP HEADER (HIDDEN ON DESKTOP PC)             -->
      <!-- ========================================================= -->
      <header class="md:hidden sticky top-0 z-40 bg-blue-950 text-white px-4 py-3 shadow-md flex items-center justify-between">
        <div class="flex items-center space-x-3">
          <div class="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center font-black text-sm text-white shadow-sm">
            ITC
          </div>
          <div>
            <h1 class="font-extrabold text-sm leading-tight tracking-tight">
              ITC STUDENT CARE
            </h1>
            <p class="text-[10px] text-blue-200 font-medium">Cổng Giảng Viên Mobile</p>
          </div>
        </div>

        <div class="flex items-center space-x-2">
          <button
            (click)="logout()"
            class="px-2.5 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-400/30 text-xs font-bold transition-all touch-target"
            title="Đăng xuất"
          >
            🚪
          </button>
        </div>
      </header>

      <!-- ========================================================= -->
      <!-- MAIN CONTAINER: ADAPTIVE MOBILE & DESKTOP PC UI           -->
      <!-- ========================================================= -->
      <main class="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-6">

        <!-- DESKTOP PC HEADER BANNER (HIDDEN ON MOBILE) -->
        <div class="hidden md:flex bg-white border border-slate-200 p-6 rounded-3xl shadow-sm items-center justify-between gap-6">
          <div class="space-y-1">
            <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-900 text-xs font-extrabold border border-blue-200">
              📊 BẢNG QUẢN LÝ & ĐIỂM DANH HỌC PHẦN (VĂN PHÒNG)
            </div>
            <h2 class="text-2xl font-black text-slate-900 tracking-tight">
              Xin chào, ThS. {{ currentUser?.fullName }} 👋
            </h2>
            <p class="text-xs text-slate-500 font-medium">
              Giao diện tối giản văn phòng dành cho máy tính. Quản lý lớp học phần, điểm danh và nhiệm vụ gọi điện CSKH.
            </p>
          </div>

          <!-- PC Quick Mode Selector Tabs -->
          <div class="flex items-center space-x-2 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
            <button
              (click)="activeTab = 'home'"
              [ngClass]="activeTab === 'home' ? 'bg-blue-900 text-white font-black shadow-sm' : 'text-slate-700 hover:text-slate-900 font-bold hover:bg-white'"
              class="px-4 py-2 text-xs rounded-xl transition-all cursor-pointer"
            >
              🏠 Tổng Quan
            </button>

            <button
              (click)="activeTab = 'attendance'"
              [ngClass]="activeTab === 'attendance' ? 'bg-blue-900 text-white font-black shadow-sm' : 'text-slate-700 hover:text-slate-900 font-bold hover:bg-white'"
              class="px-4 py-2 text-xs rounded-xl transition-all cursor-pointer"
            >
              📝 Điểm Danh Lớp
            </button>

            <button
              (click)="activeTab = 'calls'"
              [ngClass]="activeTab === 'calls' ? 'bg-blue-900 text-white font-black shadow-sm' : 'text-slate-700 hover:text-slate-900 font-bold hover:bg-white'"
              class="px-4 py-2 text-xs rounded-xl transition-all relative cursor-pointer"
            >
              <span>📞 Nhiệm Vụ Gọi</span>
              <span *ngIf="unreadCallsCount > 0" class="ml-1.5 px-2 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-black animate-pulse">
                {{ unreadCallsCount }}
              </span>
            </button>
          </div>
        </div>

        <!-- ========================================== -->
        <!-- TAB 1: TRANG CHỦ DASHBOARD TỔNG QUAN      -->
        <!-- ========================================== -->
        <div *ngIf="activeTab === 'home'" class="space-y-5 animate-fade-in">
          
          <!-- Welcome Hero Banner (Mobile) -->
          <div class="md:hidden bg-gradient-to-br from-blue-900 via-indigo-900 to-slate-900 text-white p-5 rounded-3xl shadow-xl relative overflow-hidden">
            <div class="relative z-10 space-y-2">
              <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/30 text-blue-200 text-xs font-bold border border-blue-400/30">
                <span>👋 Chào ngày mới</span>
              </div>
              <h2 class="text-xl font-black tracking-tight leading-snug">
                ThS. {{ currentUser?.fullName || 'Giảng Viên' }}
              </h2>
              <p class="text-xs text-blue-200 font-medium">
                Bảng điều khiển điểm danh và quản lý học sinh theo thời khóa biểu.
              </p>
            </div>
          </div>

          <!-- Quick Stats 4 Grid -->
          <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div (click)="activeTab = 'attendance'" class="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-all cursor-pointer space-y-1">
              <div class="text-xs font-extrabold text-slate-400 uppercase tracking-wider">Lớp Hôm Nay</div>
              <div class="text-3xl font-black text-blue-900">{{ todayClasses.length }} <span class="text-xs font-normal text-slate-400">lớp</span></div>
              <div class="text-xs text-blue-600 font-bold">📅 {{ todayName }}</div>
            </div>

            <div (click)="activeTab = 'attendance'" class="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-all cursor-pointer space-y-1">
              <div class="text-xs font-extrabold text-slate-400 uppercase tracking-wider">SV Phụ Trách</div>
              <div class="text-3xl font-black text-emerald-700">{{ totalAssignedStudents }} <span class="text-xs font-normal text-slate-400">SV</span></div>
              <div class="text-xs text-emerald-600 font-bold">🎓 {{ myAssignedGroups.length }} Học Phần</div>
            </div>

            <div (click)="activeTab = 'calls'" class="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-all cursor-pointer space-y-1 relative">
              <div class="text-xs font-extrabold text-slate-400 uppercase tracking-wider">Cuộc Gọi CSKH</div>
              <div class="text-3xl font-black text-amber-600">{{ unreadCallsCount }} <span class="text-xs font-normal text-slate-400">tồn</span></div>
              <div class="text-xs text-amber-600 font-bold">📞 Cần liên hệ</div>
              <span *ngIf="unreadCallsCount > 0" class="absolute top-4 right-4 w-3 h-3 rounded-full bg-rose-500 animate-ping"></span>
            </div>

            <div (click)="activeTab = 'attendance'" class="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-all cursor-pointer space-y-1">
              <div class="text-xs font-extrabold text-slate-400 uppercase tracking-wider">Cảnh Báo Cấm Thi</div>
              <div class="text-3xl font-black text-rose-600">0 <span class="text-xs font-normal text-slate-400">SV</span></div>
              <div class="text-xs text-rose-600 font-bold">⚠️ Vắng 2+ buổi</div>
            </div>
          </div>

          <!-- Today's Timetable Widget (Thời khóa biểu hôm nay) -->
          <div class="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
            <div class="flex items-center justify-between">
              <h3 class="font-extrabold text-slate-900 text-base flex items-center gap-2">
                <span>🗓️</span>
                <span>LỊCH DẠY HÔM NAY ({{ todayName }})</span>
              </h3>
              <span class="text-xs font-bold text-blue-900 bg-blue-50 px-3 py-1 rounded-full border border-blue-200">
                {{ todayDateStr }}
              </span>
            </div>

            <div *ngIf="todayClasses.length > 0" class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div
                *ngFor="let g of todayClasses"
                class="p-5 rounded-2xl border border-slate-200 bg-slate-50/70 hover:border-blue-300 transition-all flex flex-col justify-between space-y-3"
              >
                <div class="space-y-2">
                  <div class="flex items-center justify-between gap-2">
                    <span
                      class="px-2.5 py-0.5 rounded-full text-[11px] font-black border uppercase"
                      [ngClass]="{
                        'bg-amber-100 text-amber-900 border-amber-300': g.shift === 'Sáng',
                        'bg-blue-100 text-blue-900 border-blue-300': g.shift === 'Chiều',
                        'bg-purple-100 text-purple-900 border-purple-300': g.shift === 'Tối'
                      }"
                    >
                      {{ g.shift === 'Chiều' ? '🌤️ Ca Chiều' : g.shift === 'Tối' ? '🌙 Ca Tối' : '☀️ Ca Sáng' }}
                    </span>
                    <span class="text-xs font-bold text-slate-500">📍 Phòng {{ g.room || 'A.101' }}</span>
                  </div>
                  <h4 class="font-extrabold text-slate-900 text-base leading-snug">{{ g.courseName }}</h4>
                  <div class="text-xs text-slate-500 font-mono">Mã lớp: {{ g.groupCode }} | 🎓 {{ g.students?.length || 0 }} SV</div>
                </div>

                <button
                  type="button"
                  (click)="goToAttendanceForGroup(g._id)"
                  class="w-full py-2.5 rounded-xl bg-blue-900 hover:bg-blue-950 text-white font-extrabold text-xs shadow-sm transition-all touch-target cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <span>⚡ Điểm Danh Lớp Này</span>
                </button>
              </div>
            </div>

            <div *ngIf="todayClasses.length === 0" class="p-6 text-center bg-slate-50 rounded-2xl border border-slate-200 text-slate-500 text-xs font-semibold">
              🎉 Hôm nay ({{ todayName }}) thầy/cô không có lịch dạy môn nào. Chúc thầy/cô một ngày làm việc vui vẻ!
            </div>
          </div>

          <!-- Fast Action Shortcuts Grid -->
          <div class="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
            <h3 class="font-extrabold text-slate-900 text-sm uppercase tracking-wider text-slate-500">Lối Tắt Thao Tác Nhanh Văn Phòng</h3>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
              <button (click)="activeTab = 'attendance'" class="p-4 rounded-2xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-950 font-bold text-xs flex flex-col items-center justify-center gap-2 transition-all cursor-pointer">
                <span class="text-3xl">📝</span>
                <span>Điểm Danh Lớp</span>
              </button>
              <button (click)="activeTab = 'calls'" class="p-4 rounded-2xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-950 font-bold text-xs flex flex-col items-center justify-center gap-2 transition-all cursor-pointer">
                <span class="text-3xl">📞</span>
                <span>Hộp Thư Gọi Điện</span>
              </button>
              <button (click)="showLookupModal = true" class="p-4 rounded-2xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-950 font-bold text-xs flex flex-col items-center justify-center gap-2 transition-all cursor-pointer">
                <span class="text-3xl">🔍</span>
                <span>Tra Cứu SV</span>
              </button>
              <button (click)="showPasswordModal = true" class="p-4 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-800 font-bold text-xs flex flex-col items-center justify-center gap-2 transition-all cursor-pointer">
                <span class="text-3xl">🔑</span>
                <span>Đổi Mật Khẩu</span>
              </button>
            </div>
          </div>

        </div>

        <!-- ========================================== -->
        <!-- TAB 2: ĐIỂM DANH LỚP HỌC                   -->
        <!-- ========================================== -->
        <div *ngIf="activeTab === 'attendance'" class="space-y-5 animate-fade-in">
          
          <!-- Mode Switch Tabs (Sổ Điểm Danh Ma Trận / Tóm Tắt Vắng) -->
          <div *ngIf="selectedGroup" class="flex items-center justify-between gap-3 bg-white p-2 rounded-2xl border border-slate-200 shadow-xs flex-wrap">
            <div class="flex items-center space-x-2">
              <button
                (click)="switchAttendanceMode('history')"
                [ngClass]="attendanceMode === 'history' ? 'bg-blue-900 text-white font-black shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 font-extrabold'"
                class="px-4 py-2 text-xs sm:text-sm rounded-xl transition-all cursor-pointer flex items-center gap-2"
              >
                <span>📋</span>
                <span>Sổ Điểm Danh Ma Trận</span>
              </button>

              <button
                (click)="switchAttendanceMode('summary')"
                [ngClass]="attendanceMode === 'summary' ? 'bg-rose-700 text-white font-black shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 font-extrabold'"
                class="px-4 py-2 text-xs sm:text-sm rounded-xl transition-all cursor-pointer flex items-center gap-2"
              >
                <span>📊</span>
                <span>Tóm Tắt Vắng & Nguy Cơ Cấm Thi</span>
              </button>
            </div>

            <div class="text-xs text-slate-500 font-medium px-3 hidden md:flex items-center gap-2">
              <span class="inline-block w-2 h-2 rounded-full bg-blue-500 animate-ping"></span>
              💡 Nhấp vào biểu tượng <b>✓</b> hoặc <b>✕</b> trên bảng ma trận để tích chọn điểm danh.
            </div>
          </div>

          <!-- Course Selector & Grid -->
          <div class="bg-white border border-slate-200 p-6 rounded-3xl space-y-4 shadow-sm">
            <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h3 class="text-base font-extrabold text-slate-900 flex items-center gap-2">
                  <span>📚</span>
                  <span>CHỌN LỚP HỌC PHẦN CẦN ĐIỂM DANH</span>
                </h3>
              </div>
              <div class="flex items-center gap-2">
                <button
                  type="button"
                  (click)="toggleShowAllCourses(false)"
                  [ngClass]="!showAllCourses ? 'bg-blue-900 text-white font-black' : 'bg-slate-100 text-slate-600 font-bold'"
                  class="px-3.5 py-1.5 rounded-xl text-xs transition-all border border-slate-300 cursor-pointer"
                >
                  📌 Lớp của tôi
                </button>
                <button
                  type="button"
                  (click)="toggleShowAllCourses(true)"
                  [ngClass]="showAllCourses ? 'bg-indigo-900 text-white font-black' : 'bg-slate-100 text-slate-600 font-bold'"
                  class="px-3.5 py-1.5 rounded-xl text-xs transition-all border border-slate-300 cursor-pointer"
                >
                  🌐 Tất cả môn
                </button>
              </div>
            </div>

            <!-- Course Grid Cards -->
            <div *ngIf="displayCourseGroups.length > 0" class="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div
                *ngFor="let g of displayCourseGroups"
                (click)="selectCourseGroup(g._id)"
                [ngClass]="{
                  'ring-2 ring-blue-900 border-blue-900 bg-gradient-to-br from-blue-50/90 via-indigo-50/30 to-white shadow-md': selectedGroupId === g._id,
                  'bg-white border-slate-200 hover:border-blue-400 hover:shadow-sm': selectedGroupId !== g._id
                }"
                class="p-5 sm:p-6 rounded-3xl border transition-all cursor-pointer flex flex-col justify-between space-y-4 group relative"
              >
                <div class="space-y-3">
                  <!-- Top Row: Shift Badge & Active Selected Pill -->
                  <div class="flex items-center justify-between gap-2 flex-wrap">
                    <span
                      class="px-3 py-1 rounded-full text-[11px] font-black uppercase border tracking-wider"
                      [ngClass]="{
                        'bg-amber-100 text-amber-950 border-amber-300': g.shift === 'Sáng',
                        'bg-blue-100 text-blue-950 border-blue-300': g.shift === 'Chiều',
                        'bg-purple-100 text-purple-950 border-purple-300': g.shift === 'Tối'
                      }"
                    >
                      {{ g.shift === 'Chiều' ? '🌤️ Ca Chiều' : g.shift === 'Tối' ? '🌙 Ca Tối' : '☀️ Ca Sáng' }}
                    </span>

                    <span *ngIf="selectedGroupId === g._id" class="text-xs font-black text-emerald-950 bg-emerald-100 px-3 py-1 rounded-full border border-emerald-300 flex items-center gap-1">
                      <span>✅</span>
                      <span>Đang chọn</span>
                    </span>
                  </div>

                  <!-- Course Title & Code -->
                  <div>
                    <h4 class="font-black text-slate-900 text-lg sm:text-xl leading-snug group-hover:text-blue-900 transition-colors">
                      {{ g.courseName || 'Học Phần' }}
                    </h4>
                    <div class="mt-1">
                      <span class="text-xs font-mono font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200/80 inline-block">
                        Mã lớp: {{ g.groupCode }}
                      </span>
                    </div>
                  </div>

                  <!-- Key-Value Info Boxes -->
                  <div class="text-xs space-y-2 text-slate-600 pt-1">
                    <div class="flex items-center justify-between gap-3 bg-slate-50/80 px-3.5 py-2 rounded-xl border border-slate-100">
                      <span class="font-medium text-slate-500 flex-shrink-0">👨‍🏫 Giảng viên:</span>
                      <span class="font-bold text-slate-900 text-right truncate">{{ g.teacherName || 'Chưa phân công' }}</span>
                    </div>

                    <div class="flex items-center justify-between gap-3 bg-slate-50/80 px-3.5 py-2 rounded-xl border border-slate-100">
                      <span class="font-medium text-slate-500 flex-shrink-0">📅 Lịch học:</span>
                      <span class="font-extrabold text-blue-950 text-right">{{ (g.scheduleDays || []).join(', ') }}</span>
                    </div>
                  </div>
                </div>

                <!-- Footer Status & Room -->
                <div class="pt-3 border-t border-slate-100 flex items-center justify-between text-xs gap-2 flex-wrap">
                  <span class="px-3 py-1 rounded-xl font-extrabold border" [ngClass]="getScheduleCheck(g).badgeClass">
                    {{ getScheduleCheck(g).badgeText }}
                  </span>
                  <span class="font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">📍 {{ g.room || 'A.101' }}</span>
                </div>
              </div>
            </div>

            <!-- Empty State -->
            <div *ngIf="displayCourseGroups.length === 0" class="p-8 text-center bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
              <div class="text-3xl">📭</div>
              <div class="font-extrabold text-slate-800 text-base">Không tìm thấy nhóm học phần nào!</div>
              <p class="text-xs text-slate-500 font-medium">Bấm "🌐 Tất cả môn" ở trên nếu cần tìm môn dạy thay.</p>
            </div>

            <!-- Selected Group Timetable Card Info -->
            <div *ngIf="selectedGroup" class="p-5 rounded-2xl bg-blue-50/70 border border-blue-200 text-xs space-y-3 text-slate-800">
              <div class="flex items-center justify-between flex-wrap gap-2">
                <div class="font-black text-blue-950 text-sm">
                  📌 ĐANG ĐIỂM DANH: {{ selectedGroup.courseName }} ({{ selectedGroup.groupCode }})
                </div>
                <div class="text-xs font-bold text-slate-600">
                  Phòng: <b class="text-slate-900 font-black">📍 {{ selectedGroup.room || 'A.101' }}</b>
                </div>
              </div>

              <!-- Schedule Status & Lock Toggle -->
              <div class="pt-2 border-t border-blue-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="px-3 py-1 rounded-full text-xs font-black border tracking-wide shadow-sm" [ngClass]="getScheduleCheck(selectedGroup).badgeClass">
                    {{ getScheduleCheck(selectedGroup).badgeText }}
                  </span>
                  <span *ngIf="!getScheduleCheck(selectedGroup).isValid" class="text-xs text-slate-700 font-medium">
                    {{ getScheduleCheck(selectedGroup).reason }}
                  </span>
                </div>

                <button
                  *ngIf="!getScheduleCheck(selectedGroup).isValid"
                  type="button"
                  (click)="allowFlexibleAttendance = !allowFlexibleAttendance"
                  class="px-4 py-2 rounded-xl text-xs font-extrabold shadow-sm transition-all touch-target cursor-pointer"
                  [ngClass]="allowFlexibleAttendance ? 'bg-emerald-700 text-white' : 'bg-amber-600 hover:bg-amber-700 text-white'"
                >
                  {{ allowFlexibleAttendance ? '✅ Đã Bật Điểm Danh Linh Hoạt (Học Bù)' : '🔓 Bật Điểm Danh Linh Hoạt' }}
                </button>
              </div>
            </div>
          </div>

          <!-- BẢNG MA TRẬN ĐIỂM DANH TÍCH CHỌN TRỰC TIẾP (Airtable / Notion Style) -->
          <div *ngIf="attendanceMode === 'history'" class="space-y-4 relative pb-24">
            
            <!-- Success Banner (hiện sau khi bấm Lưu) -->
            <div *ngIf="submitResult" class="bg-gradient-to-r from-emerald-600 to-teal-700 text-white rounded-2xl p-4 flex items-center justify-between gap-3 shadow-xl animate-fade-in">
              <div class="flex items-center gap-3">
                <div class="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center text-xl flex-shrink-0">🎉</div>
                <div>
                  <div class="font-black text-sm sm:text-base">Đã Lưu Điểm Danh Thành Công!</div>
                  <div class="text-xs text-emerald-100 font-semibold mt-0.5">{{ submitResult.message }}</div>
                  <div *ngIf="submitResult.taskAssignments?.length" class="text-xs text-amber-200 font-bold mt-0.5">
                    📞 Đã tự động phân công {{ submitResult.taskAssignments.length }} nhiệm vụ gọi điện CSKH cho nhân viên.
                  </div>
                </div>
              </div>
              <button (click)="submitResult = null" class="text-white/80 hover:text-white font-bold text-lg p-1.5 rounded-lg hover:bg-white/10 transition-all flex-shrink-0">✕</button>
            </div>

            <!-- History Table Card -->
            <div class="bg-white border border-slate-200 rounded-3xl shadow-xl shadow-slate-200/50 overflow-hidden">
              <!-- Card Header -->
              <div class="p-5 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between gap-4 flex-wrap">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 rounded-2xl bg-blue-900 text-white flex items-center justify-center font-black text-lg shadow-md shadow-blue-900/20 flex-shrink-0">
                    📋
                  </div>
                  <div>
                    <div class="flex items-center gap-2 flex-wrap">
                      <h3 class="font-black text-slate-900 text-base sm:text-lg tracking-tight">
                        SỔ ĐIỂM DANH MA TRẬN {{ selectedGroup ? '— ' + selectedGroup.courseName : '' }}
                      </h3>
                      <span *ngIf="selectedGroup" class="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-blue-50 text-blue-900 border border-blue-200">
                        {{ selectedGroup.groupCode }}
                      </span>
                    </div>
                    <div class="flex items-center gap-3 text-xs text-slate-500 font-medium mt-0.5 flex-wrap">
                      <span>👥 <b>{{ selectedGroup?.students?.length || 0 }}</b> Sinh viên</span>
                      <span>•</span>
                      <span>📅 Đã điểm danh <b>{{ recordedSessionsCount }}</b> / <b>{{ allSessions.length }}</b> buổi</span>
                    </div>
                  </div>
                </div>

                <div class="flex items-center gap-2">
                  <button (click)="loadHistory()" class="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 transition-all flex items-center gap-1.5 shadow-2xs active:scale-95 cursor-pointer">
                    🔄 Tải Lại
                  </button>
                </div>
              </div>

              <!-- Ma trận: 2 Cột Sticky Left (Mã SV, Họ Tên) x Buổi x Cột Sticky Right (Tổng Vắng) -->
              <div *ngIf="allSessions.length > 0 && selectedGroup" class="overflow-x-auto custom-scrollbar">
                <table class="w-full text-xs border-collapse min-w-max">
                  <thead>
                    <!-- Hàng Header 1: Sticky Left | Sessions | Sticky Right -->
                    <tr class="bg-slate-900 text-white border-b border-slate-800">
                      
                      <!-- Sticky Left Column 1: Mã SV -->
                      <th class="p-3.5 text-left font-black uppercase tracking-wider sticky left-0 z-30 bg-slate-900 min-w-[110px] border-r border-slate-800 shadow-[2px_0_6px_rgba(0,0,0,0.2)]">
                        Mã SV
                      </th>

                      <!-- Sticky Left Column 2: Họ và Tên -->
                      <th class="p-3.5 text-left font-black uppercase tracking-wider sticky left-[110px] z-30 bg-slate-900 min-w-[190px] border-r border-slate-800 shadow-[4px_0_10px_rgba(0,0,0,0.25)]">
                        Họ và Tên
                      </th>

                      <!-- Cột từng buổi học -->
                      <th
                        *ngFor="let session of allSessions"
                        (click)="setActiveSession(session)"
                        class="p-3 text-center min-w-[105px] border-r border-slate-800 cursor-pointer select-none transition-all relative group"
                        [ngClass]="{
                          'bg-blue-900/95 text-blue-100 border-x-2 border-blue-400': isTodaySession(session),
                          'ring-2 ring-blue-400/80 bg-indigo-950/90': activeSession && getSessionKey(activeSession) === getSessionKey(session) && !isTodaySession(session),
                          'bg-slate-900 hover:bg-slate-800 text-white': (!activeSession || getSessionKey(activeSession) !== getSessionKey(session)) && !isTodaySession(session)
                        }"
                      >
                        <div class="flex flex-col items-center justify-center gap-1">
                          <!-- Today Badge -->
                          <span *ngIf="isTodaySession(session)" class="bg-amber-400 text-slate-950 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider shadow-sm animate-pulse">
                            🔥 Hôm Nay
                          </span>

                          <!-- Scheduled Date -->
                          <div class="font-black text-sm text-white tracking-tight">
                            {{ session.scheduledDate | date:'dd/MM' }}
                          </div>
                          <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            {{ formatVietnameseDay(session.scheduledDate) }}
                          </div>

                          <!-- Status Badge -->
                          <div class="mt-0.5">
                            <span *ngIf="isSessionDirty(session)" class="inline-flex items-center gap-0.5 bg-amber-400 text-slate-950 px-1.5 py-0.5 rounded text-[9px] font-black">
                              ✏️ Đổi
                            </span>
                            <span *ngIf="!isSessionDirty(session) && isSessionLocked(session) && session.status === 'recorded'" class="inline-flex items-center text-emerald-400 text-[10px] font-bold gap-0.5">
                              🔒 Đã chốt
                            </span>
                            <span *ngIf="!isSessionDirty(session) && !isSessionLocked(session) && session.status === 'recorded'" class="inline-flex items-center text-emerald-400 text-[10px] font-bold gap-0.5">
                              🟢 Đã lưu
                            </span>
                            <span *ngIf="!isSessionDirty(session) && session.status === 'missing'" class="inline-flex items-center text-amber-300 text-[10px] font-bold">
                              🟡 Chưa ghi
                            </span>
                            <span *ngIf="!isSessionDirty(session) && isSessionLocked(session) && session.status === 'future'" class="inline-flex items-center text-slate-400 text-[10px] font-bold gap-0.5">
                              🔒 Sắp tới
                            </span>
                          </div>
                        </div>
                      </th>

                      <!-- Sticky Right Column: Tổng Vắng -->
                      <th class="p-3.5 text-center font-black uppercase tracking-wider bg-slate-950 text-slate-200 min-w-[100px] sticky right-0 z-30 border-l border-slate-800 shadow-[-4px_0_10px_rgba(0,0,0,0.25)]">
                        Tổng Vắng
                      </th>
                    </tr>

                    <!-- Hàng Header 2: Tổng SV vắng từng buổi -->
                    <tr class="bg-slate-800/90 text-slate-300 border-b border-slate-700/80">
                      <td class="p-2.5 px-3 font-extrabold text-[11px] sticky left-0 z-30 bg-slate-800 border-r border-slate-700/80 shadow-[2px_0_6px_rgba(0,0,0,0.15)] text-slate-300">
                        Tổng vắng
                      </td>
                      <td class="p-2.5 px-3 font-semibold text-[11px] sticky left-[110px] z-30 bg-slate-800 border-r border-slate-700/80 shadow-[4px_0_10px_rgba(0,0,0,0.2)] text-slate-400">
                        từng buổi học
                      </td>
                      <td
                        *ngFor="let session of allSessions"
                        (click)="setActiveSession(session)"
                        class="p-2 text-center border-r border-slate-700/60 cursor-pointer"
                        [ngClass]="isTodaySession(session) ? 'bg-blue-900/60' : ''"
                      >
                        <span
                          class="px-2 py-0.5 rounded-full text-[10px] font-black inline-flex items-center gap-0.5 border"
                          [ngClass]="getAbsentCountForSession(session) > 0 ? 'bg-rose-500/20 text-rose-300 border-rose-500/30' : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'"
                        >
                          {{ getAbsentCountForSession(session) }} SV
                        </span>
                      </td>
                      <td class="p-2 text-center sticky right-0 z-30 bg-slate-900 border-l border-slate-800"></td>
                    </tr>
                  </thead>

                  <tbody class="divide-y divide-slate-200/80">
                    <tr
                      *ngFor="let student of selectedGroup.students; let i = index"
                      class="even:bg-slate-50/40 hover:bg-blue-50/40 transition-colors group"
                      [ngClass]="getTotalAbsentForStudent(student._id) >= (attendanceSummary?.examBanThreshold || 2) ? 'bg-rose-50/20' : ''"
                    >
                      <!-- Sticky Left Column 1: Mã SV -->
                      <td
                        class="p-2.5 px-3 sticky left-0 z-10 border-r border-slate-200/80 min-w-[110px] font-mono text-[11px] font-bold text-slate-700 transition-colors group-hover:bg-blue-50/80"
                        [ngClass]="getTotalAbsentForStudent(student._id) >= (attendanceSummary?.examBanThreshold || 2) ? 'bg-rose-50/90' : 'bg-white'"
                      >
                        {{ student.studentCode }}
                      </td>

                      <!-- Sticky Left Column 2: Họ và Tên -->
                      <td
                        class="p-2.5 px-3 sticky left-[110px] z-10 border-r border-slate-200/80 min-w-[190px] shadow-[4px_0_10px_-2px_rgba(0,0,0,0.06)] transition-colors group-hover:bg-blue-50/80"
                        [ngClass]="getTotalAbsentForStudent(student._id) >= (attendanceSummary?.examBanThreshold || 2) ? 'bg-rose-50/90' : 'bg-white'"
                      >
                        <div class="flex items-center justify-between gap-2">
                          <div class="flex items-center gap-2 truncate">
                            <span class="w-5 h-5 rounded-md bg-slate-100 text-slate-600 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                              {{ i + 1 }}
                            </span>
                            <span class="font-bold text-slate-900 text-xs truncate group-hover:text-blue-900">
                              {{ student.fullName }}
                            </span>
                          </div>
                          <span
                            *ngIf="getTotalAbsentForStudent(student._id) >= (attendanceSummary?.examBanThreshold || 2)"
                            class="text-[10px] font-black text-rose-600 bg-rose-100 border border-rose-300 px-1 py-0.2 rounded flex-shrink-0"
                            title="Nguy cơ cấm thi"
                          >
                            ⚠️
                          </span>
                        </div>
                      </td>

                      <!-- Ô tích chọn điểm danh (3-State Cell Chips: Lock / ✓ / ✕ / P) -->
                      <td
                        *ngFor="let session of allSessions"
                        class="p-2 text-center border-r border-slate-200/60 select-none transition-colors"
                        [ngClass]="{
                          'bg-slate-100/60 opacity-60': isSessionLocked(session),
                          'bg-blue-50/40': !isSessionLocked(session) && isTodaySession(session) && getStudentStatusInMatrix(student._id, session) === 'present',
                          'bg-rose-50/60': !isSessionLocked(session) && getStudentStatusInMatrix(student._id, session) === 'absent',
                          'bg-amber-50/70': !isSessionLocked(session) && getStudentStatusInMatrix(student._id, session) === 'excused',
                          'bg-blue-50/20': activeSession && getSessionKey(activeSession) === getSessionKey(session) && !isTodaySession(session) && getStudentStatusInMatrix(student._id, session) === 'present'
                        }"
                      >
                        <!-- Cell Chip Button -->
                        <button
                          type="button"
                          (click)="toggleStudentInMatrix(student._id, session, student.fullName)"
                          (contextmenu)="$event.preventDefault(); !isSessionLocked(session) && getStudentStatusInMatrix(student._id, session) === 'excused' ? openExcusedModal(student._id, student.fullName, session) : null"
                          class="w-8 h-8 mx-auto rounded-md font-bold text-xs flex items-center justify-center transition-all duration-150 active:scale-95 hover:scale-105 cursor-pointer relative"
                          [ngClass]="{
                            'bg-slate-100 text-slate-400 border border-slate-200 opacity-50 cursor-not-allowed': isSessionLocked(session),
                            'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300': !isSessionLocked(session) && getStudentStatusInMatrix(student._id, session) === 'present',
                            'text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 font-extrabold': !isSessionLocked(session) && getStudentStatusInMatrix(student._id, session) === 'absent',
                            'bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-bold': !isSessionLocked(session) && getStudentStatusInMatrix(student._id, session) === 'excused'
                          }"
                          [title]="
                            isSessionLocked(session) ? '🔒 Buổi học đã chốt sổ / chưa tới ngày' :
                            getStudentStatusInMatrix(student._id, session) === 'present' ? 'Có mặt (Click để đổi sang Vắng không phép)' :
                            getStudentStatusInMatrix(student._id, session) === 'absent' ? 'Vắng không phép (Click để đổi sang Vắng có phép)' :
                            'Vắng có phép: ' + (getStudentExcusedReason(student._id, session) || 'Có đơn xin phép') + ' (Click để đổi)'
                          "
                        >
                          <span *ngIf="isSessionLocked(session)" class="text-xs">🔒</span>
                          <span *ngIf="!isSessionLocked(session) && getStudentStatusInMatrix(student._id, session) === 'present'" class="text-sm font-bold text-emerald-700">✓</span>
                          <span *ngIf="!isSessionLocked(session) && getStudentStatusInMatrix(student._id, session) === 'absent'" class="text-sm font-extrabold text-red-700">V</span>
                          <span *ngIf="!isSessionLocked(session) && getStudentStatusInMatrix(student._id, session) === 'excused'" class="text-xs font-bold text-amber-800">P</span>
                          <span *ngIf="!isSessionLocked(session) && getStudentStatusInMatrix(student._id, session) === 'excused'" class="absolute -top-0.5 -right-0.5 w-2 h-2 bg-amber-500 rounded-full"></span>
                        </button>
                      </td>

                      <!-- Sticky Right Column: Total Absent -->
                      <td
                        class="p-2.5 text-center sticky right-0 z-10 border-l border-slate-200/80 min-w-[100px] shadow-[-4px_0_10px_-2px_rgba(0,0,0,0.06)] transition-colors group-hover:bg-blue-50/80"
                        [ngClass]="getTotalAbsentForStudent(student._id) >= (attendanceSummary?.examBanThreshold || 2) ? 'bg-rose-50/90' : 'bg-white'"
                      >
                        <div class="flex flex-col items-center justify-center gap-0.5">
                          <span
                            class="px-2.5 py-0.5 rounded-full text-xs font-black"
                            [ngClass]="
                              getTotalAbsentForStudent(student._id) === 0 ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' :
                              getTotalAbsentForStudent(student._id) >= (attendanceSummary?.examBanThreshold || 2) ? 'bg-rose-600 text-white shadow-sm' :
                              'bg-amber-50 text-amber-900 border border-amber-200'
                            "
                            title="Vắng không phép"
                          >
                            {{ getTotalAbsentForStudent(student._id) }} ✕
                          </span>
                          <span
                            *ngIf="getTotalExcusedForStudent(student._id) > 0"
                            class="px-2 py-0.2 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300"
                            title="Vắng có phép"
                          >
                            {{ getTotalExcusedForStudent(student._id) }} P
                          </span>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <!-- Empty state -->
              <div *ngIf="allSessions.length === 0" class="p-12 text-center text-slate-400 text-xs font-medium">
                <div class="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 mx-auto flex items-center justify-center text-2xl mb-3 shadow-inner">📭</div>
                <div class="font-bold text-slate-600 text-sm">{{ selectedGroup ? 'Chưa có buổi điểm danh nào được ghi nhận cho học phần này.' : 'Hãy chọn học phần ở trên để xem sổ điểm danh.' }}</div>
              </div>
              <div *ngIf="historyList.length > 0 && !selectedGroup?.students?.length" class="p-6 text-center text-slate-400 text-xs font-medium">
                Không có sinh viên trong học phần này.
              </div>
            </div>

            <!-- BOTTOM FLOATING ACTION BAR -->
            <div *ngIf="selectedGroup && activeSession" class="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
              <div class="bg-slate-900 text-white px-5 py-2.5 rounded-md shadow-2xl border border-slate-700 flex items-center gap-3 sm:gap-4 flex-wrap justify-center">
                
                <!-- Session Label & Counter -->
                <div class="flex items-center gap-2 pr-3 border-r border-slate-700">
                  <div class="w-7 h-7 rounded-md bg-slate-800 border border-slate-600 text-slate-200 flex items-center justify-center text-xs font-bold">
                    📅
                  </div>
                  <div class="text-xs">
                    <div class="font-bold text-white flex items-center gap-1.5">
                      <span>Buổi {{ activeSession.scheduledDate | date:'dd/MM/yyyy' }}</span>
                      <span *ngIf="isTodaySession(activeSession)" class="bg-blue-600 text-white text-[9px] font-bold px-1.5 py-0.2 rounded-md uppercase">Hôm Nay</span>
                    </div>
                    <div class="text-[11px] text-slate-300 font-medium">
                      <span class="text-red-400 font-bold">{{ getAbsentCountForSession(activeSession) }}</span> Vắng
                      <span *ngIf="getExcusedCountForSession(activeSession) > 0" class="text-amber-300 font-bold"> • {{ getExcusedCountForSession(activeSession) }} Có phép</span>
                      <span *ngIf="isSessionDirty(activeSession)" class="text-amber-400 font-bold ml-1">• Chưa lưu</span>
                    </div>
                  </div>
                </div>

                <!-- Quick Actions -->
                <div class="flex items-center gap-1.5">
                  <button
                    type="button"
                    (click)="markAllPresentInSession(activeSession)"
                    class="px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-700 transition-all cursor-pointer flex items-center gap-1"
                    title="Đánh dấu tất cả CÓ MẶT"
                  >
                    ✓ Tất cả Có mặt
                  </button>
                  <button
                    type="button"
                    (click)="markAllAbsentInSession(activeSession)"
                    class="px-2.5 py-1 rounded-md text-xs font-semibold bg-red-950 hover:bg-red-900 text-red-300 border border-red-800 transition-all cursor-pointer flex items-center gap-1"
                    title="Đánh dấu tất cả VẮNG"
                  >
                    V Tất cả Vắng
                  </button>
                </div>

                <!-- Primary Navy Save Button -->
                <button
                  type="button"
                  (click)="submitMatrixSession(activeSession)"
                  [disabled]="savingSessionKey === getSessionKey(activeSession)"
                  class="px-4 py-1.5 rounded-md text-xs font-bold text-white bg-slate-800 hover:bg-slate-700 border border-slate-600 shadow-md transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  [ngClass]="{'ring-1 ring-emerald-400 bg-emerald-900 hover:bg-emerald-800': isSessionDirty(activeSession)}"
                >
                  <span *ngIf="savingSessionKey === getSessionKey(activeSession)">⏳</span>
                  <span *ngIf="savingSessionKey !== getSessionKey(activeSession)">💾 LƯU ĐIỂM DANH BUỔI NÀY</span>
                </button>

              </div>
            </div>

          </div>

          <!-- Attendance Summary Tab -->
          <div *ngIf="attendanceMode === 'summary'" class="space-y-4">
            <div class="bg-white/95 border border-slate-200/80 rounded-3xl shadow-xl shadow-slate-200/40 overflow-hidden backdrop-blur-sm">
              <div class="p-5 sm:p-6 border-b border-slate-200/80 bg-gradient-to-r from-slate-50 via-white to-slate-50 flex items-center justify-between gap-4 flex-wrap">
                <div class="flex items-center gap-3.5">
                  <div class="w-11 h-11 rounded-2xl bg-gradient-to-tr from-rose-600 to-amber-500 text-white flex items-center justify-center shadow-lg shadow-rose-500/25 flex-shrink-0">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m-9 0h9.5"/>
                    </svg>
                  </div>
                  <div>
                    <h3 class="font-black text-slate-900 text-base sm:text-lg tracking-tight">
                      BẢNG TÓM TẮT VẮNG MỖI SINH VIÊN
                    </h3>
                    <div class="flex items-center gap-3 text-xs text-slate-500 font-semibold mt-1 flex-wrap">
                      <span class="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg border border-slate-200/60">
                        {{ attendanceSummary?.totalSessions || 0 }} Buổi tổng cộng
                      </span>
                      <span class="bg-rose-50 text-rose-700 px-2.5 py-1 rounded-lg border border-rose-200/60 font-bold">
                        Ngưỡng cấm thi: {{ attendanceSummary?.examBanThreshold || 2 }} buổi
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  (click)="loadAttendanceSummary()"
                  [disabled]="isLoadingSummary"
                  class="px-4 py-2 bg-gradient-to-r from-rose-700 to-red-800 hover:from-rose-800 hover:to-red-900 text-white text-xs font-extrabold rounded-xl flex items-center gap-1.5 transition-all shadow-md shadow-rose-700/20 active:scale-95 disabled:opacity-50"
                >
                  <svg class="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"/>
                  </svg>
                  <span>{{ isLoadingSummary ? 'Đang tải...' : 'Làm Mới' }}</span>
                </button>
              </div>

              <div *ngIf="!selectedGroup" class="p-12 text-center text-slate-400 text-xs font-medium">
                <div class="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 mx-auto flex items-center justify-center text-2xl mb-3 shadow-inner">📚</div>
                <div class="font-bold text-slate-600 text-sm">Hãy chọn học phần ở trên để xem bảng tóm tắt vắng.</div>
              </div>

              <div *ngIf="selectedGroup && attendanceSummary" class="overflow-x-auto custom-scrollbar">
                <table class="w-full text-sm border-collapse">
                  <thead>
                    <tr class="bg-slate-900 text-slate-200 uppercase text-xs font-black border-b border-slate-800">
                      <th class="p-4 text-left min-w-[50px]">#</th>
                      <th class="p-4 text-left min-w-[180px]">Sinh Viên</th>
                      <th class="p-4 text-left min-w-[90px]">Lớp</th>
                      <th class="p-4 text-center min-w-[90px]">Có Mặt</th>
                      <th class="p-4 text-center min-w-[90px]">Vắng</th>
                      <th class="p-4 text-center min-w-[160px]">Tỷ Lệ %</th>
                      <th class="p-4 text-left min-w-[130px]">SĐT SV</th>
                      <th class="p-4 text-left min-w-[130px]">SĐT PH</th>
                      <th class="p-4 text-center min-w-[120px]">CSKH</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100">
                    <tr
                      *ngFor="let row of attendanceSummary.summary; let idx = index"
                      class="hover:bg-slate-50/90 transition-colors"
                      [ngClass]="row.isAtRisk ? 'bg-rose-50/40' : ''"
                    >
                      <td class="p-4 font-bold text-slate-400 text-xs">{{ idx + 1 }}</td>
                      <td class="p-4">
                        <div class="font-extrabold text-slate-900 text-xs sm:text-sm">{{ row.student.fullName }}</div>
                        <div class="text-[11px] font-mono font-bold text-indigo-700">{{ row.student.studentCode }}</div>
                      </td>
                      <td class="p-4 text-xs font-bold text-slate-600">{{ row.student.classCode }}</td>
                      <td class="p-4 text-center">
                        <span class="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-black">{{ row.attendCount }}</span>
                      </td>
                      <td class="p-4 text-center">
                        <span
                          class="px-3 py-1 rounded-full text-xs font-black inline-flex items-center gap-1 shadow-2xs"
                          [ngClass]="row.isAtRisk ? 'bg-rose-600 text-white shadow-md shadow-rose-500/30' : (row.absentCount > 0 ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-slate-100 text-slate-600')"
                        >
                          {{ row.isAtRisk ? '⚠️ ' : '' }}{{ row.absentCount }}
                        </span>
                      </td>
                      <td class="p-4 text-center">
                        <div class="flex items-center gap-2.5">
                          <div class="flex-1 bg-slate-100 rounded-full h-2.5 min-w-[60px] overflow-hidden border border-slate-200/60 p-0.5">
                            <div
                              class="h-full rounded-full transition-all duration-500"
                              [ngClass]="row.attendRate >= 80 ? 'bg-emerald-500' : row.attendRate >= 60 ? 'bg-amber-500' : 'bg-rose-500'"
                              [style.width.%]="row.attendRate"
                            ></div>
                          </div>
                          <span class="text-xs font-extrabold text-slate-700 w-11 text-right">{{ row.attendRate }}%</span>
                        </div>
                      </td>
                      <td class="p-4">
                        <a
                          *ngIf="row.student.phone"
                          [href]="'tel:' + row.student.phone"
                          class="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg border border-indigo-200/60 transition-colors"
                        >
                          <svg class="w-3.5 h-3.5 text-indigo-600" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-2.826-1.47-5.114-3.758-6.584-6.584l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z"/>
                          </svg>
                          <span>{{ row.student.phone }}</span>
                        </a>
                        <span *ngIf="!row.student.phone" class="text-xs text-slate-400">—</span>
                      </td>
                      <td class="p-4">
                        <a
                          *ngIf="row.student.parentPhone"
                          [href]="'tel:' + row.student.parentPhone"
                          class="inline-flex items-center gap-1.5 text-xs font-bold text-amber-800 hover:text-amber-950 bg-amber-50 hover:bg-amber-100 px-2.5 py-1 rounded-lg border border-amber-200/60 transition-colors"
                        >
                          <svg class="w-3.5 h-3.5 text-amber-700" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-2.826-1.47-5.114-3.758-6.584-6.584l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z"/>
                          </svg>
                          <span>{{ row.student.parentPhone }}</span>
                        </a>
                        <span *ngIf="!row.student.parentPhone" class="text-xs text-slate-400">—</span>
                      </td>
                      <td class="p-4 text-center">
                        <span
                          *ngIf="row.callStatus"
                          class="px-2.5 py-1 rounded-full text-xs font-extrabold border inline-flex items-center gap-1"
                          [ngClass]="{
                            'bg-rose-50 text-rose-700 border-rose-200': row.callStatus === 'Chưa gọi',
                            'bg-amber-50 text-amber-700 border-amber-200': row.callStatus === 'Không bắt máy',
                            'bg-emerald-50 text-emerald-700 border-emerald-200': row.callStatus === 'Đã liên hệ'
                          }"
                        >
                          <span class="w-1.5 h-1.5 rounded-full"
                            [ngClass]="{
                              'bg-rose-500': row.callStatus === 'Chưa gọi',
                              'bg-amber-500': row.callStatus === 'Không bắt máy',
                              'bg-emerald-500': row.callStatus === 'Đã liên hệ'
                            }"
                          ></span>
                          <span>{{ row.callStatus }}</span>
                        </span>
                        <span *ngIf="!row.callStatus" class="text-xs text-slate-400">—</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div *ngIf="selectedGroup && isLoadingSummary" class="p-10 text-center text-slate-400 text-xs font-medium">
                <div class="w-8 h-8 rounded-full border-2 border-slate-300 border-t-indigo-600 animate-spin mx-auto mb-2"></div>
                <div>Đang tải bảng tóm tắt vắng...</div>
              </div>
            </div>
          </div>

          <!-- Submit Result Toast (enhanced) -->
          <div *ngIf="submitResult" class="fixed top-5 right-5 z-[9999] max-w-md w-full">
            <div class="bg-white border border-emerald-200 rounded-2xl shadow-2xl p-5 space-y-3 animate-fade-in">
              <div class="flex items-start justify-between gap-3">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-xl flex-shrink-0">🎉</div>
                  <div>
                    <h5 class="font-extrabold text-sm text-emerald-900">Lưu Điểm Danh Thành Công!</h5>
                    <p class="text-xs font-medium text-slate-600 mt-0.5">{{ submitResult.message }}</p>
                  </div>
                </div>
                <button (click)="submitResult = null" class="text-slate-400 hover:text-slate-600 font-bold">✖</button>
              </div>
              <div *ngIf="submitResult.taskAssignments?.length" class="bg-slate-50 rounded-xl p-3 space-y-1">
                <div class="text-xs font-black text-slate-700 uppercase">Phân Bổ Nhiệm Vụ CSKH:</div>
                <div *ngFor="let ta of submitResult.taskAssignments.slice(0, 5)" class="text-xs font-medium text-slate-600 flex items-center gap-2">
                  <span class="text-rose-600 font-bold">{{ ta.studentCode }}</span>
                  <span>{{ ta.studentName }}</span>
                  <span class="text-slate-400">→</span>
                  <span class="text-blue-900 font-bold">{{ ta.staffName }}</span>
                </div>
                <div *ngIf="submitResult.taskAssignments.length > 5" class="text-xs text-slate-400 font-medium">
                  ... và {{ submitResult.taskAssignments.length - 5 }} SV khác
                </div>
              </div>
            </div>
          </div>

          <!-- MODAL NHẬP LÝ DO VẮNG CÓ PHÉP -->
          <div *ngIf="showExcusedModal" class="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
            <div class="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
              <div class="flex items-center justify-between border-b border-slate-100 pb-3">
                <div class="flex items-center gap-2.5">
                  <div class="w-10 h-10 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center font-black text-lg border border-amber-300">
                    📝
                  </div>
                  <div>
                    <h4 class="font-black text-slate-900 text-base">Lý Do Vắng Có Phép</h4>
                    <p class="text-xs text-slate-500 font-medium">Sinh viên: <b class="text-slate-900 font-bold">{{ excusedTarget?.studentName }}</b></p>
                  </div>
                </div>
                <button (click)="cancelExcusedReason()" class="text-slate-400 hover:text-slate-600 font-bold text-lg p-1.5 rounded-lg hover:bg-slate-100 transition-colors">✕</button>
              </div>

              <div class="space-y-3">
                <label class="block text-xs font-bold text-slate-700">Chọn nhanh lý do phổ biến:</label>
                <div class="flex flex-wrap gap-1.5">
                  <button
                    *ngFor="let r of quickExcusedReasons"
                    type="button"
                    (click)="selectQuickReason(r)"
                    [ngClass]="excusedReasonInput === r ? 'bg-amber-500 text-white font-bold border-amber-600 shadow-sm' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold border-slate-200'"
                    class="px-3 py-1.5 rounded-xl text-xs border transition-all cursor-pointer"
                  >
                    {{ r }}
                  </button>
                </div>

                <div class="pt-1">
                  <label class="block text-xs font-bold text-slate-700 mb-1">Hoặc nhập chi tiết lý do:</label>
                  <input
                    type="text"
                    [(ngModel)]="excusedReasonInput"
                    placeholder="Ví dụ: Bị sốt siêu vi, có giấy khám bệnh..."
                    class="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none font-medium"
                  />
                </div>
              </div>

              <div class="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  (click)="cancelExcusedReason()"
                  class="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                >
                  Bỏ qua
                </button>
                <button
                  type="button"
                  (click)="saveExcusedReason()"
                  class="px-5 py-2 rounded-xl text-xs font-black bg-amber-500 hover:bg-amber-600 text-white shadow-md shadow-amber-500/20 cursor-pointer flex items-center gap-1"
                >
                  <span>💾</span>
                  <span>Xác Nhận Lý Do</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- ========================================== -->
        <!-- TAB 3: HỘP THƯ NHIỆM VỤ GỌI ĐIỆN CSKH     -->
        <!-- ========================================== -->
        <div *ngIf="activeTab === 'calls'" class="space-y-5 animate-fade-in">
          
          <div class="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
            <div class="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 class="text-base font-extrabold text-slate-900 flex items-center gap-2">
                  <span>📞</span>
                  <span>NHIỆM VỤ GỌI ĐIỆN CSKH ĐƯỢC GÁN</span>
                </h3>
                <p class="text-xs text-slate-500 font-medium">Danh sách các sinh viên vắng học cần liên hệ hỏi thăm lý do</p>
              </div>
              <span class="px-3.5 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300 text-xs font-black">
                {{ unreadCallsCount }} Nhiệm vụ chờ xử lý
              </span>
            </div>

            <!-- Status Filter Pills -->
            <div class="flex items-center gap-2 overflow-x-auto pb-1">
              <button
                type="button"
                (click)="taskFilterStatus = ''"
                [ngClass]="taskFilterStatus === '' ? 'bg-slate-900 text-white font-black' : 'bg-slate-100 text-slate-600 font-bold'"
                class="px-3.5 py-1.5 rounded-xl text-xs transition-all border border-slate-200 whitespace-nowrap cursor-pointer"
              >
                Tất cả cuộc gọi
              </button>
              <button
                type="button"
                (click)="taskFilterStatus = 'Chưa gọi'"
                [ngClass]="taskFilterStatus === 'Chưa gọi' ? 'bg-rose-600 text-white font-black' : 'bg-slate-100 text-slate-600 font-bold'"
                class="px-3.5 py-1.5 rounded-xl text-xs transition-all border border-slate-200 whitespace-nowrap cursor-pointer"
              >
                🔴 Chưa gọi
              </button>
              <button
                type="button"
                (click)="taskFilterStatus = 'Không bắt máy'"
                [ngClass]="taskFilterStatus === 'Không bắt máy' ? 'bg-amber-600 text-white font-black' : 'bg-slate-100 text-slate-600 font-bold'"
                class="px-3.5 py-1.5 rounded-xl text-xs transition-all border border-slate-200 whitespace-nowrap cursor-pointer"
              >
                🟡 Không bắt máy
              </button>
              <button
                type="button"
                (click)="taskFilterStatus = 'Đã liên hệ'"
                [ngClass]="taskFilterStatus === 'Đã liên hệ' ? 'bg-emerald-700 text-white font-black' : 'bg-slate-100 text-slate-600 font-bold'"
                class="px-3.5 py-1.5 rounded-xl text-xs transition-all border border-slate-200 whitespace-nowrap cursor-pointer"
              >
                🟢 Đã liên hệ
              </button>
            </div>
          </div>

          <!-- Task Cards List -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div
              *ngFor="let task of filteredCallTasks"
              class="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-3 flex flex-col justify-between"
            >
              <div class="space-y-3">
                <div class="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
                  <div class="space-y-1">
                    <div class="font-extrabold text-slate-900 text-base flex items-center gap-2">
                      <span>🎓 {{ task.studentId?.fullName || 'Sinh Viên' }}</span>
                      <span class="text-xs font-mono font-bold text-blue-900 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                        {{ task.studentId?.studentCode }}
                      </span>
                    </div>
                    <div class="text-xs text-slate-500 font-medium">
                      Lớp: <b>{{ task.studentId?.classCode }}</b> | Ngành: <b>{{ task.studentId?.major || 'CNTT' }}</b>
                    </div>
                  </div>

                  <span
                    class="px-3 py-1 rounded-full text-xs font-black border"
                    [ngClass]="{
                      'bg-rose-100 text-rose-900 border-rose-300': task.status === 'Chưa gọi',
                      'bg-amber-100 text-amber-900 border-amber-300': task.status === 'Không bắt máy',
                      'bg-emerald-100 text-emerald-900 border-emerald-300': task.status === 'Đã liên hệ'
                    }"
                  >
                    {{ task.status }}
                  </span>
                </div>

                <!-- Phone Numbers & One Touch Call Buttons -->
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <a
                    [href]="'tel:' + (task.studentId?.phone || '')"
                    class="p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 font-bold text-slate-800 flex items-center justify-between touch-target"
                  >
                    <span>📱 SĐT SV: <b>{{ task.studentId?.phone || 'Chưa cập nhật' }}</b></span>
                    <span class="text-blue-900 font-extrabold">📞 Gọi</span>
                  </a>
                  <a
                    [href]="'tel:' + (task.studentId?.parentPhone || '')"
                    class="p-2.5 rounded-xl bg-amber-50/80 hover:bg-amber-100 border border-amber-200 font-bold text-amber-950 flex items-center justify-between touch-target"
                  >
                    <span>👨‍👩‍👧 SĐT PH: <b>{{ task.studentId?.parentPhone || 'Chưa cập nhật' }}</b></span>
                    <span class="text-amber-900 font-extrabold">📞 Gọi PH</span>
                  </a>
                </div>
              </div>

              <!-- Note Input & Status Update Form -->
              <div class="pt-2 space-y-2 border-t border-slate-100">
                <input
                  type="text"
                  [(ngModel)]="task.callNote"
                  placeholder="✍️ Nhập ghi chú kết quả cuộc gọi..."
                  class="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-xs font-bold text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-600"
                />

                <div class="flex items-center justify-end space-x-2">
                  <button
                    type="button"
                    (click)="updateTaskStatus(task._id, 'Không bắt máy', task.callNote)"
                    class="px-3 py-2 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 text-xs font-bold touch-target cursor-pointer"
                  >
                    🟡 Không Bắt Máy
                  </button>
                  <button
                    type="button"
                    (click)="updateTaskStatus(task._id, 'Đã liên hệ', task.callNote)"
                    class="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-extrabold shadow-sm touch-target cursor-pointer"
                  >
                    ✅ Hoàn Thành
                  </button>
                </div>
              </div>
            </div>

            <div *ngIf="filteredCallTasks.length === 0" class="col-span-full p-10 text-center bg-white border border-slate-200 rounded-3xl text-slate-400 text-xs font-medium">
              🎉 Không có nhiệm vụ gọi điện nào trong danh sách này.
            </div>
          </div>

        </div>

      </main>

      <!-- ========================================================= -->
      <!-- TIKTOK-STYLE STICKY BOTTOM TASKBAR (MOBILE ONLY md:hidden) -->
      <!-- ========================================================= -->
      <nav class="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-2xl px-2 py-2">
        <div class="max-w-md mx-auto flex items-center justify-around text-center">
          
          <!-- Tab 1: Trang chủ -->
          <button
            (click)="activeTab = 'home'"
            [ngClass]="activeTab === 'home' ? 'text-blue-900 font-black' : 'text-slate-500 font-semibold'"
            class="flex-1 flex flex-col items-center justify-center py-1 touch-target transition-colors cursor-pointer"
          >
            <div class="text-xl leading-none">🏠</div>
            <div class="text-[10px] mt-1">Trang chủ</div>
          </button>

          <!-- Tab 2: Điểm danh -->
          <button
            (click)="activeTab = 'attendance'"
            [ngClass]="activeTab === 'attendance' ? 'text-blue-900 font-black' : 'text-slate-500 font-semibold'"
            class="flex-1 flex flex-col items-center justify-center py-1 touch-target transition-colors cursor-pointer"
          >
            <div class="text-xl leading-none">📝</div>
            <div class="text-[10px] mt-1">Điểm danh</div>
          </button>

          <!-- Tab 3: Center (+) Quick Action Button -->
          <button
            (click)="showQuickMenu = true"
            class="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-900 via-indigo-800 to-blue-700 text-white font-black text-2xl flex items-center justify-center shadow-xl -mt-5 border-2 border-white transform active:scale-95 transition-all cursor-pointer"
            title="Thao tác nhanh"
          >
            ➕
          </button>

          <!-- Tab 4: Nhiệm vụ gọi điện -->
          <button
            (click)="activeTab = 'calls'"
            [ngClass]="activeTab === 'calls' ? 'text-blue-900 font-black' : 'text-slate-500 font-semibold'"
            class="flex-1 flex flex-col items-center justify-center py-1 touch-target transition-colors relative cursor-pointer"
          >
            <div class="text-xl leading-none">📞</div>
            <div class="text-[10px] mt-1">Hộp thư gọi</div>
            <span
              *ngIf="unreadCallsCount > 0"
              class="absolute top-0 right-3 px-1.5 py-0.5 rounded-full bg-rose-600 text-white text-[9px] font-black animate-pulse shadow-sm"
            >
              {{ unreadCallsCount }}
            </span>
          </button>

          <!-- Tab 5: Hồ sơ -->
          <button
            (click)="showPasswordModal = true"
            class="flex-1 flex flex-col items-center justify-center py-1 touch-target transition-colors cursor-pointer text-slate-500 font-semibold"
          >
            <div class="text-xl leading-none">🔑</div>
            <div class="text-[10px] mt-1">Đổi MK</div>
          </button>

        </div>
      </nav>

      <!-- ========================================================= -->
      <!-- MODAL 1: CENTER QUICK ACTION (+) MENU BOTTOM SHEET         -->
      <!-- ========================================================= -->
      <div *ngIf="showQuickMenu" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
        <div class="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 space-y-4 shadow-2xl animate-slide-up">
          <div class="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 class="font-black text-slate-900 text-base flex items-center gap-2">
              <span>⚡</span>
              <span>THAO TÁC NHANH THẦN TỐC</span>
            </h3>
            <button (click)="showQuickMenu = false" class="text-slate-400 hover:text-slate-700 font-bold text-lg">✖</button>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <button
              (click)="showQuickMenu = false; activeTab = 'attendance'"
              class="p-4 rounded-2xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-950 font-extrabold text-xs flex flex-col items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <span class="text-3xl">⚡</span>
              <span>Điểm Danh Ca Học</span>
            </button>

            <button
              (click)="showQuickMenu = false; activeTab = 'calls'"
              class="p-4 rounded-2xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-950 font-extrabold text-xs flex flex-col items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <span class="text-3xl">📞</span>
              <span>Nhiệm Vụ Gọi Điện</span>
            </button>

            <button
              (click)="showQuickMenu = false; showLookupModal = true"
              class="p-4 rounded-2xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-950 font-extrabold text-xs flex flex-col items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <span class="text-3xl">🔍</span>
              <span>Tra Cứu Sinh Viên</span>
            </button>

            <button
              (click)="showQuickMenu = false; showPasswordModal = true"
              class="p-4 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-800 font-extrabold text-xs flex flex-col items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <span class="text-3xl">🔑</span>
              <span>Đổi Mật Khẩu</span>
            </button>
          </div>

          <button
            (click)="showQuickMenu = false"
            class="w-full py-3 rounded-2xl bg-slate-100 text-slate-700 font-extrabold text-xs touch-target cursor-pointer"
          >
            Đóng Menu
          </button>
        </div>
      </div>

      <!-- ========================================================= -->
      <!-- MODAL 2: INSTANT STUDENT LOOKUP MODAL                     -->
      <!-- ========================================================= -->
      <div *ngIf="showLookupModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div class="bg-white w-full max-w-lg rounded-3xl p-6 space-y-4 shadow-2xl">
          <div class="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 class="font-black text-slate-900 text-base flex items-center gap-2">
              <span>🔍</span>
              <span>TRA CỨU HỒ SƠ SINH VIÊN</span>
            </h3>
            <button (click)="showLookupModal = false" class="text-slate-400 hover:text-slate-700 font-bold">✖</button>
          </div>

          <div class="space-y-3">
            <div class="flex items-center space-x-2">
              <input
                type="text"
                [(ngModel)]="lookupTerm"
                (keyup.enter)="doStudentLookup()"
                placeholder="Nhập MSSV hoặc Họ tên sinh viên..."
                class="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-300 font-bold text-xs text-slate-900"
              />
              <button
                (click)="doStudentLookup()"
                class="px-4 py-3 rounded-2xl bg-blue-900 text-white font-extrabold text-xs whitespace-nowrap touch-target"
              >
                Tìm
              </button>
            </div>

            <!-- Lookup Result Detail Card -->
            <div *ngIf="lookupResult" class="p-4 rounded-2xl bg-blue-50/70 border border-blue-200 text-xs space-y-2 text-slate-800">
              <div class="font-black text-base text-blue-950">{{ lookupResult.fullName }}</div>
              <div class="grid grid-cols-2 gap-2 text-slate-700">
                <div>MSSV: <b class="text-slate-900 font-mono">{{ lookupResult.studentCode }}</b></div>
                <div>Lớp: <b>{{ lookupResult.classCode }}</b></div>
                <div>Ngành: <b>{{ lookupResult.major || 'CNTT' }}</b></div>
                <div>SĐT: <b>{{ lookupResult.phone || 'Chưa có' }}</b></div>
                <div class="col-span-2">SĐT Phụ Huynh: <b class="text-amber-900">{{ lookupResult.parentPhone || 'Chưa có' }}</b></div>
              </div>
            </div>

            <div *ngIf="lookupSearched && !lookupResult" class="p-4 text-center bg-rose-50 border border-rose-200 text-rose-900 font-bold text-xs rounded-2xl">
              ⚠️ Không tìm thấy thông tin sinh viên phù hợp.
            </div>
          </div>
        </div>
      </div>

      <!-- ========================================================= -->
      <!-- MODAL 3: CHANGE PASSWORD MODAL                            -->
      <!-- ========================================================= -->
      <div *ngIf="showPasswordModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div class="bg-white w-full max-w-md rounded-3xl p-6 space-y-4 shadow-2xl">
          <div class="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 class="font-black text-slate-900 text-base flex items-center gap-2">
              <span>🔑</span>
              <span>ĐỔI MẬT KHẨU CÁ NHÂN</span>
            </h3>
            <button (click)="showPasswordModal = false" class="text-slate-400 hover:text-slate-700 font-bold">✖</button>
          </div>

          <div class="space-y-3">
            <div>
              <label class="block text-xs font-bold uppercase text-slate-600 mb-1">Mật Khẩu Mới</label>
              <input
                type="text"
                [(ngModel)]="newPasswordInput"
                placeholder="Nhập mật khẩu mới tại đây..."
                class="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-300 font-bold text-xs text-slate-900"
              />
            </div>

            <div *ngIf="passwordChangedMsg" class="p-3 rounded-xl bg-emerald-100 text-emerald-900 text-xs font-bold">
              {{ passwordChangedMsg }}
            </div>

            <div class="flex items-center justify-end space-x-2 pt-2">
              <button (click)="showPasswordModal = false" class="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs touch-target">
                Hủy
              </button>
              <button (click)="saveMyNewPassword()" class="px-5 py-2.5 rounded-xl bg-blue-900 text-white font-extrabold text-xs shadow-md touch-target">
                💾 Lưu Mật Khẩu
              </button>
            </div>
          </div>
        </div>
      </div>

    </div>
  `,
})
export class AttendanceComponent implements OnInit, OnDestroy {
  activeTab: 'home' | 'attendance' | 'calls' | 'profile' = 'attendance';
  showQuickMenu = false;
  showLookupModal = false;
  lookupTerm = '';
  lookupResult: Student | null = null;
  lookupSearched = false;

  showPasswordModal = false;
  newPasswordInput = '';
  passwordChangedMsg = '';

  courseGroups: CourseGroup[] = [];
  filterShift = '';
  showAllCourses = false;
  selectedGroupId = '';
  selectedGroup: CourseGroup | null = null;
  searchTerm = '';

  // Call Tasks state
  myCallTasks: CallTask[] = [];
  taskFilterStatus = '';
  unreadCallsCount = 0;

  attendanceMode: 'new' | 'history' | 'summary' = 'history';
  activeSession: ScheduleSession | null = null;

  // Absent student map: { [studentId]: boolean }
  absentMap: { [studentId: string]: boolean } = {};
  historyList: AttendanceHistoryItem[] = [];
  scheduleData: ScheduleData | null = null;   // tất cả buổi theo lịch
  attendanceSummary: AttendanceSummary | null = null;
  isLoadingSummary = false;
  submitResult: SubmitAttendanceResult | null = null;

  // ─── Lock state: kiểm tra buổi hôm nay đã điểm danh chưa ───
  todayRecord: AttendanceHistoryItem | null = null;  // bản ghi hôm nay (nếu có)
  isCheckingToday = false;                            // đang check
  isAttendanceLocked = false;                         // true = đã lưu, khóa form

  isSubmitting = false;
  successMsg = '';
  allowFlexibleAttendance = false;

  private pollTimer: any;

  constructor(
    private attendanceService: AttendanceService,
    public authService: AuthService,
    private callTaskService: CallTaskService,
    private staffService: StaffService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadCourseGroups();
    this.loadMyCallTasks();
    this.pollTimer = setInterval(() => this.loadMyCallTasks(), 15000);
  }

  ngOnDestroy(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
  }

  get currentUser() {
    return this.authService.currentUser();
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  get todayName(): string {
    const dayNames = ['Chủ Nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
    return dayNames[new Date().getDay()];
  }

  get todayDateStr(): string {
    return new Date().toLocaleDateString('vi-VN');
  }

  get myAssignedGroups(): CourseGroup[] {
    return this.courseGroups.filter((g) => this.isAssignedTeacher(g));
  }

  get todayClasses(): CourseGroup[] {
    const tName = this.todayName;
    return this.myAssignedGroups.filter((g) => g.scheduleDays && g.scheduleDays.includes(tName));
  }

  get totalAssignedStudents(): number {
    return this.myAssignedGroups.reduce((acc, g) => acc + (g.students?.length || 0), 0);
  }

  get filteredCourseGroups(): CourseGroup[] {
    if (!this.filterShift) return this.courseGroups;
    return this.courseGroups.filter((g) => g.shift === this.filterShift);
  }

  isAssignedTeacher(group: CourseGroup | null): boolean {
    if (!group) return false;
    if (this.currentUser?.role === 'admin') return true;
    const userId = this.currentUser?.id || (this.currentUser as any)?._id || '';
    const userFullName = (this.currentUser?.fullName || '').trim();

    let groupTeacherId = '';
    if (group.teacherId) {
      groupTeacherId = typeof group.teacherId === 'string' ? group.teacherId : (group.teacherId as any)._id || group.teacherId.id || '';
    }

    const groupTeacherName = (group.teacherName || '').trim();

    return (groupTeacherId !== '' && groupTeacherId === userId) || (groupTeacherName !== '' && groupTeacherName === userFullName);
  }

  get displayCourseGroups(): CourseGroup[] {
    let list = this.filteredCourseGroups;
    if (!this.showAllCourses && this.currentUser?.role === 'staff') {
      list = list.filter((g) => this.isAssignedTeacher(g));
    }
    return list;
  }

  loadCourseGroups() {
    this.attendanceService.getCourseGroups(this.showAllCourses).subscribe({
      next: (groups) => {
        this.courseGroups = groups;
        if (groups.length > 0) {
          if (!this.selectedGroupId) {
            this.selectedGroupId = groups[0]._id;
            this.onGroupChange();
          }
        } else {
          this.selectedGroupId = '';
          this.selectedGroup = null;
        }
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Load groups error:', err),
    });
  }

  selectCourseGroup(id: string) {
    this.selectedGroupId = id;
    this.onGroupChange();
  }

  goToAttendanceForGroup(id: string) {
    this.selectedGroupId = id;
    this.activeTab = 'attendance';
    this.attendanceMode = 'history';
    this.onGroupChange();
    this.cdr.detectChanges();
  }

  toggleShowAllCourses(showAll: boolean) {
    this.showAllCourses = showAll;
    this.loadCourseGroups();
  }

  onGroupChange() {
    this.selectedGroup = this.courseGroups.find((g) => g._id === this.selectedGroupId) || null;
    this.absentMap = {};
    this.attendanceSummary = null;
    this.todayRecord = null;
    this.isAttendanceLocked = false;
    this.activeSession = null;

    this.loadHistory();
    if (!this.attendanceSummary) this.loadAttendanceSummary();
  }

  switchAttendanceMode(mode: 'new' | 'history' | 'summary') {
    this.attendanceMode = mode === 'new' ? 'history' : mode;
    if (this.attendanceMode === 'history') {
      this.loadHistory();
      if (!this.attendanceSummary) this.loadAttendanceSummary();
    } else if (this.attendanceMode === 'summary') {
      this.loadAttendanceSummary();
    }
  }

  /** Kiểm tra buổi hôm nay đã điểm danh chưa, nếu rồi đưa vào trạng thái khóa */
  checkTodayAttendance() {
    if (!this.selectedGroupId) return;
    this.isCheckingToday = true;
    this.cdr.detectChanges();
    this.attendanceService.getTodayAttendance(this.selectedGroupId).subscribe({
      next: (record) => {
        this.todayRecord = record;
        if (record) {
          // Đã điểm danh hôm nay → khóa form, điền lại danh sách vắng cũ
          this.isAttendanceLocked = true;
          this.absentMap = {};
          for (const st of (record.absentStudents || [])) {
            this.absentMap[st._id] = true;
          }
        } else {
          // Chưa điểm danh → mở form mới
          this.isAttendanceLocked = false;
          this.absentMap = {};
        }
        this.isCheckingToday = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.isCheckingToday = false;
        this.cdr.detectChanges();
      },
    });
  }

  /** Mở khóa để giảng viên sửa lại danh sách vắng của buổi hôm nay */
  unlockAttendance() {
    this.isAttendanceLocked = false;
    this.cdr.detectChanges();
  }

  loadHistory() {
    if (!this.selectedGroupId) return;
    this.attendanceService.getAttendanceHistory(this.selectedGroupId).subscribe({
      next: (list) => {
        this.historyList = list;
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Load history error:', err),
    });
    // Load full schedule (all sessions per timetable)
    this.loadScheduleSessions();
  }

  loadScheduleSessions() {
    if (!this.selectedGroupId) return;
    this.attendanceService.getScheduleSessions(this.selectedGroupId).subscribe({
      next: (data) => {
        this.scheduleData = data;
        this.autoSelectActiveSession();
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Load schedule error:', err),
    });
  }

  isTodaySession(session: ScheduleSession | null): boolean {
    if (!session?.scheduledDate) return false;
    const d = new Date(session.scheduledDate);
    const today = new Date();
    return (
      d.getFullYear() === today.getFullYear() &&
      d.getMonth() === today.getMonth() &&
      d.getDate() === today.getDate()
    );
  }

  setActiveSession(session: ScheduleSession): void {
    this.activeSession = session;
    this.initSessionDraft(session);
    this.cdr.detectChanges();
  }

  autoSelectActiveSession(): void {
    const sessions = this.allSessions;
    if (!sessions.length) {
      this.activeSession = null;
      return;
    }
    const todaySession = sessions.find((s) => this.isTodaySession(s));
    if (todaySession) {
      this.activeSession = todaySession;
    } else {
      const missingSession = sessions.find((s) => s.status === 'missing');
      this.activeSession = missingSession || sessions[sessions.length - 1];
    }
    if (this.activeSession) {
      this.initSessionDraft(this.activeSession);
    }
  }

  loadAttendanceSummary() {
    if (!this.selectedGroupId) return;
    this.isLoadingSummary = true;
    this.attendanceSummary = null;
    this.attendanceService.getAttendanceSummary(this.selectedGroupId).subscribe({
      next: (data) => {
        this.attendanceSummary = data;
        this.isLoadingSummary = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.isLoadingSummary = false;
        console.error('Load summary error:', err);
        this.cdr.detectChanges();
      },
    });
  }

  deleteHistoryRecord(attendanceId: string) {
    if (!confirm('Xóa bản ghi điểm danh này?')) return;
    this.attendanceService.deleteAttendanceRecord(attendanceId).subscribe({
      next: () => {
        this.historyList = this.historyList.filter(h => h._id !== attendanceId);
        this.cdr.detectChanges();
      },
      error: (err) => alert('Lỗi khi xóa: ' + (err.error?.message || err.message)),
    });
  }

  loadMyCallTasks() {
    this.callTaskService.getMyTasks().subscribe({
      next: (tasks) => {
        this.myCallTasks = tasks;
        this.unreadCallsCount = tasks.filter((t) => t.status === 'Chưa gọi').length;
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Load call tasks error:', err),
    });
  }

  get filteredCallTasks(): CallTask[] {
    if (!this.taskFilterStatus) return this.myCallTasks;
    return this.myCallTasks.filter((t) => t.status === this.taskFilterStatus);
  }

  updateTaskStatus(taskId: string, status: 'Chưa gọi' | 'Không bắt máy' | 'Đã liên hệ', note: string) {
    this.callTaskService.updateTaskStatus(taskId, { status, callNote: note || '' }).subscribe({
      next: (res) => {
        this.loadMyCallTasks();
        this.cdr.detectChanges();
      },
      error: (err) => alert('Lỗi khi cập nhật cuộc gọi: ' + (err.error?.message || err.message)),
    });
  }

  doStudentLookup() {
    this.lookupSearched = true;
    if (!this.lookupTerm.trim()) {
      this.lookupResult = null;
      return;
    }
    const term = this.lookupTerm.toLowerCase().trim();
    let found: Student | null = null;
    for (const g of this.courseGroups) {
      if (g.students) {
        const match = g.students.find(
          (s) => s.studentCode.toLowerCase().includes(term) || s.fullName.toLowerCase().includes(term)
        );
        if (match) {
          found = match;
          break;
        }
      }
    }
    this.lookupResult = found;
    this.cdr.detectChanges();
  }

  saveMyNewPassword() {
    if (!this.newPasswordInput.trim()) {
      alert('Vui lòng nhập mật khẩu mới');
      return;
    }
    const userId = this.currentUser?.id || (this.currentUser as any)?._id || '';
    this.staffService.updateStaff(userId, { password: this.newPasswordInput.trim() }).subscribe({
      next: () => {
        this.passwordChangedMsg = '✅ Đã đổi mật khẩu thành công!';
        setTimeout(() => {
          this.passwordChangedMsg = '';
          this.showPasswordModal = false;
          this.newPasswordInput = '';
        }, 2000);
        this.cdr.detectChanges();
      },
      error: (err) => alert('Lỗi khi đổi mật khẩu: ' + (err.error?.message || err.message)),
    });
  }

  getScheduleCheck(group: CourseGroup | null) {
    if (!group) {
      return { isValid: true, reason: '', badgeText: '', badgeClass: '' };
    }

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    // 1. Check Start & End Date
    if (group.startDate) {
      const startDtStr = new Date(group.startDate).toISOString().split('T')[0];
      if (todayStr < startDtStr) {
        const formattedStart = new Date(group.startDate).toLocaleDateString('vi-VN');
        return {
          isValid: false,
          reason: `⚠️ Chưa đến ngày bắt đầu học phần (Lớp bắt đầu từ ngày ${formattedStart})`,
          badgeText: `🔒 Bắt đầu từ ${formattedStart}`,
          badgeClass: 'bg-amber-100 text-amber-900 border-amber-300',
        };
      }
    }

    if (group.endDate) {
      const endDtStr = new Date(group.endDate).toISOString().split('T')[0];
      if (todayStr > endDtStr) {
        const formattedEnd = new Date(group.endDate).toLocaleDateString('vi-VN');
        return {
          isValid: false,
          reason: `⚠️ Học phần đã kết thúc khóa học (Đã kết thúc vào ngày ${formattedEnd})`,
          badgeText: `🔒 Đã kết thúc ngày ${formattedEnd}`,
          badgeClass: 'bg-slate-100 text-slate-700 border-slate-300',
        };
      }
    }

    // 2. Check Day of Week
    const dayNames = ['Chủ Nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
    const todayName = dayNames[now.getDay()];

    if (group.scheduleDays && group.scheduleDays.length > 0) {
      if (!group.scheduleDays.includes(todayName)) {
        return {
          isValid: false,
          reason: `⚠️ Hôm nay (${todayName}) không có lịch học môn này (${group.scheduleDays.join(', ')})`,
          badgeText: `🔒 Ngoài lịch học (${todayName})`,
          badgeClass: 'bg-blue-100 text-blue-900 border-blue-300',
        };
      }
    }

    // 3. Check Shift Time
    const hour = now.getHours();
    const shift = group.shift || 'Sáng';

    if (shift === 'Sáng' && (hour < 6 || hour >= 12)) {
      return {
        isValid: false,
        reason: `⚠️ Chưa đúng ca học (${shift}). Giờ hiện tại ngoài ca Sáng (06:00 - 12:00)`,
        badgeText: `🔒 Ngoài Ca Sáng`,
        badgeClass: 'bg-amber-100 text-amber-900 border-amber-300',
      };
    } else if (shift === 'Chiều' && (hour < 12 || hour >= 18)) {
      return {
        isValid: false,
        reason: `⚠️ Chưa đúng ca học (${shift}). Giờ hiện tại ngoài ca Chiều (12:00 - 18:00)`,
        badgeText: `🔒 Ngoài Ca Chiều`,
        badgeClass: 'bg-blue-100 text-blue-900 border-blue-300',
      };
    } else if (shift === 'Tối' && (hour < 17 || hour >= 22)) {
      return {
        isValid: false,
        reason: `⚠️ Chưa đúng ca học (${shift}). Giờ hiện tại ngoài ca Tối (17:30 - 22:00)`,
        badgeText: `🔒 Ngoài Ca Tối`,
        badgeClass: 'bg-purple-100 text-purple-900 border-purple-300',
      };
    }

    return {
      isValid: true,
      reason: '🟢 Đang trong ca học & ngày học chuẩn!',
      badgeText: '🟢 Đúng ca & lịch học',
      badgeClass: 'bg-emerald-100 text-emerald-900 border-emerald-300',
    };
  }

  get students(): Student[] {
    return this.selectedGroup?.students || [];
  }

  get filteredStudents(): Student[] {
    if (!this.searchTerm.trim()) return this.students;
    const term = this.searchTerm.toLowerCase().trim();
    return this.students.filter(
      (s) => s.fullName.toLowerCase().includes(term) || s.studentCode.toLowerCase().includes(term)
    );
  }

  get absentCount(): number {
    return Object.values(this.absentMap).filter(Boolean).length;
  }

  get presentCount(): number {
    return this.students.length - this.absentCount;
  }

  toggleAttendance(studentId: string) {
    this.absentMap[studentId] = !this.absentMap[studentId];
  }

  markAllPresent() {
    this.absentMap = {};
  }

  markAllAbsent() {
    for (const st of this.filteredStudents) {
      this.absentMap[st._id] = true;
    }
  }

  submitAttendance() {
    if (!this.selectedGroupId) return;

    const absentStudentIds = Object.keys(this.absentMap).filter((id) => this.absentMap[id]);

    this.isSubmitting = true;
    this.submitResult = null;
    this.cdr.detectChanges();

    this.attendanceService
      .submitAttendance({
        courseGroupId: this.selectedGroupId,
        absentStudentIds,
      })
      .pipe(
        finalize(() => {
          this.isSubmitting = false;
          this.cdr.detectChanges();
        })
      )
      .subscribe({
        next: (res) => {
          this.submitResult = res;
          this.loadMyCallTasks();

          // ✅ Re-check today's record → tự động khóa form sau khi lưu
          this.checkTodayAttendance();

          // Chuyển sang tab Lịch Sử để xác nhận
          this.attendanceMode = 'history';
          this.loadHistory();

          // Auto-hide popup sau 10 giây
          setTimeout(() => {
            this.submitResult = null;
            this.cdr.detectChanges();
          }, 10000);
          this.cdr.detectChanges();
        },
        error: (err) => {
          alert(err.error?.message || 'Không thể lưu điểm danh');
          this.cdr.detectChanges();
        },
      });
  }

  // ─── Helpers cho bảng ma trận điểm danh ───

  // Draft Map cho điểm danh ma trận tích chọn: { [sessionKey]: Set<studentId> }
  matrixDraft: { [sessionKey: string]: { absent: Set<string>; excused: Map<string, string> } } = {};
  dirtySessions = new Set<string>();
  savingSessionKey: string | null = null;

  showExcusedModal = false;
  excusedTarget: { studentId: string; studentName: string; session: ScheduleSession } | null = null;
  excusedReasonInput = '';
  quickExcusedReasons = ['Bệnh / Sốt', 'Việc gia đình', 'Thi học phần khác', 'Có đơn xin phép', 'Đi làm công tác trường'];

  getSessionKey(session: ScheduleSession): string {
    if (!session?.scheduledDate) return '';
    const d = new Date(session.scheduledDate);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  /** Tải trạng thái ban đầu của buổi học vào Draft */
  initSessionDraft(session: ScheduleSession): void {
    const key = this.getSessionKey(session);
    if (!key || this.matrixDraft[key]) return;

    const absentSet = new Set<string>();
    const excusedMap = new Map<string, string>();

    if (session.status === 'recorded' && session.attendance) {
      if (session.attendance.absentStudents) {
        for (const st of session.attendance.absentStudents) {
          const id = typeof st === 'object' ? st._id : st;
          if (id) absentSet.add(id);
        }
      }
      if (session.attendance.excusedStudents) {
        for (const item of session.attendance.excusedStudents) {
          const id = typeof item.studentId === 'object' ? item.studentId._id : item.studentId;
          if (id) excusedMap.set(id, item.reason || 'Có phép');
        }
      }
    }
    this.matrixDraft[key] = { absent: absentSet, excused: excusedMap };
  }

  /** Kiểm tra xem buổi học có bị khóa hay không (ngày chưa tới hoặc ngày đã chốt sổ) */
  isSessionLocked(session: ScheduleSession): boolean {
    if (!session) return false;

    // Nếu công tắc "Điểm danh linh hoạt" được bật -> Mở khóa tất cả các buổi
    if (this.allowFlexibleAttendance) return false;

    // Buổi học chưa tới ngày (status === 'future') -> Bị khóa 🔒
    if (session.status === 'future') return true;

    // Buổi học đã chốt sổ / đã lưu (status === 'recorded') và KHÔNG có thay đổi chưa lưu -> Bị khóa 🔒
    const key = this.getSessionKey(session);
    if (session.status === 'recorded' && !this.dirtySessions.has(key)) {
      return true;
    }

    return false;
  }

  /** Lấy trạng thái của sinh viên trong ma trận: 'present' | 'absent' | 'excused' */
  getStudentStatusInMatrix(studentId: string, session: ScheduleSession): 'present' | 'absent' | 'excused' {
    const key = this.getSessionKey(session);
    if (this.matrixDraft[key]) {
      if (this.matrixDraft[key].absent.has(studentId)) return 'absent';
      if (this.matrixDraft[key].excused.has(studentId)) return 'excused';
      return 'present';
    }
    if (session.attendance) {
      const isAbsent = session.attendance.absentStudents?.some(st => (typeof st === 'object' ? st._id : st) === studentId);
      if (isAbsent) return 'absent';
      const isExcused = session.attendance.excusedStudents?.some(i => (typeof i.studentId === 'object' ? i.studentId._id : i.studentId) === studentId);
      if (isExcused) return 'excused';
    }
    return 'present';
  }

  /** Lấy lý do vắng có phép */
  getStudentExcusedReason(studentId: string, session: ScheduleSession): string {
    const key = this.getSessionKey(session);
    if (this.matrixDraft[key]) {
      return this.matrixDraft[key].excused.get(studentId) || '';
    }
    if (session.attendance?.excusedStudents) {
      const item = session.attendance.excusedStudents.find(i => (typeof i.studentId === 'object' ? i.studentId._id : i.studentId) === studentId);
      return item?.reason || '';
    }
    return '';
  }

  /** Click ô sinh viên trong ma trận: Có mặt (✓) -> Vắng không phép (✕) -> Vắng có phép (P) -> Có mặt (✓) */
  toggleStudentInMatrix(studentId: string, session: ScheduleSession, studentName = ''): void {
    if (this.isSessionLocked(session)) {
      alert(`🔒 Buổi học ngày ${new Date(session.scheduledDate).toLocaleDateString('vi-VN')} đã bị khóa (chốt sổ hoặc chưa tới ngày).\n\nHãy bấm "🔓 Bật Điểm Danh Linh Hoạt" ở thẻ thông tin môn học nếu cần mở khóa chỉnh sửa.`);
      return;
    }

    const key = this.getSessionKey(session);
    if (!key) return;
    this.setActiveSession(session);
    this.initSessionDraft(session);

    const draft = this.matrixDraft[key];
    const current = this.getStudentStatusInMatrix(studentId, session);

    if (current === 'present') {
      // Có mặt -> Vắng không phép
      draft.absent.add(studentId);
      draft.excused.delete(studentId);
    } else if (current === 'absent') {
      // Vắng không phép -> Vắng có phép (mở modal nhập lý do)
      draft.absent.delete(studentId);
      draft.excused.set(studentId, 'Bệnh / Sốt');
      this.openExcusedModal(studentId, studentName, session);
    } else {
      // Vắng có phép -> Có mặt
      draft.absent.delete(studentId);
      draft.excused.delete(studentId);
    }

    this.dirtySessions.add(key);
    this.cdr.detectChanges();
  }

  /** Mở popup nhập lý do vắng có phép */
  openExcusedModal(studentId: string, studentName: string, session: ScheduleSession): void {
    this.excusedTarget = { studentId, studentName, session };
    this.excusedReasonInput = this.getStudentExcusedReason(studentId, session) || 'Bệnh / Sốt';
    this.showExcusedModal = true;
    this.cdr.detectChanges();
  }

  selectQuickReason(reason: string): void {
    this.excusedReasonInput = reason;
  }

  saveExcusedReason(): void {
    if (!this.excusedTarget) return;
    const { studentId, session } = this.excusedTarget;
    const key = this.getSessionKey(session);
    if (this.matrixDraft[key]) {
      this.matrixDraft[key].excused.set(studentId, this.excusedReasonInput.trim() || 'Có đơn xin phép');
      this.dirtySessions.add(key);
    }
    this.showExcusedModal = false;
    this.excusedTarget = null;
    this.cdr.detectChanges();
  }

  cancelExcusedReason(): void {
    this.showExcusedModal = false;
    this.excusedTarget = null;
    this.cdr.detectChanges();
  }

  /** Đánh dấu tất cả CÓ MẶT cho buổi học này */
  markAllPresentInSession(session: ScheduleSession): void {
    const key = this.getSessionKey(session);
    if (!key) return;
    this.setActiveSession(session);
    this.matrixDraft[key] = { absent: new Set<string>(), excused: new Map<string, string>() };
    this.dirtySessions.add(key);
    this.cdr.detectChanges();
  }

  /** Đánh dấu tất cả VẮNG KHÔNG PHÉP cho buổi học này */
  markAllAbsentInSession(session: ScheduleSession): void {
    const key = this.getSessionKey(session);
    if (!key || !this.selectedGroup?.students) return;
    this.setActiveSession(session);
    this.matrixDraft[key] = {
      absent: new Set<string>(this.selectedGroup.students.map(s => s._id)),
      excused: new Map<string, string>()
    };
    this.dirtySessions.add(key);
    this.cdr.detectChanges();
  }

  /** Đánh dấu tất cả VẮNG CÓ PHÉP cho buổi học này */
  markAllExcusedInSession(session: ScheduleSession): void {
    const key = this.getSessionKey(session);
    if (!key || !this.selectedGroup?.students) return;
    this.setActiveSession(session);
    const excusedMap = new Map<string, string>();
    for (const s of this.selectedGroup.students) {
      excusedMap.set(s._id, 'Có đơn xin phép');
    }
    this.matrixDraft[key] = {
      absent: new Set<string>(),
      excused: excusedMap
    };
    this.dirtySessions.add(key);
    this.cdr.detectChanges();
  }

  /** Kiểm tra buổi học có thay đổi chưa lưu hay không */
  isSessionDirty(session: ScheduleSession): boolean {
    const key = this.getSessionKey(session);
    return this.dirtySessions.has(key);
  }

  /** Đếm số SV vắng không phép trong cột ma trận */
  getAbsentCountForSession(session: ScheduleSession): number {
    const key = this.getSessionKey(session);
    if (this.matrixDraft[key]) {
      return this.matrixDraft[key].absent.size;
    }
    return session.attendance?.absentStudents?.length || 0;
  }

  /** Đếm số SV vắng có phép trong cột ma trận */
  getExcusedCountForSession(session: ScheduleSession): number {
    const key = this.getSessionKey(session);
    if (this.matrixDraft[key]) {
      return this.matrixDraft[key].excused.size;
    }
    return session.attendance?.excusedStudents?.length || 0;
  }

  /** Bấm "Lưu điểm danh buổi này" */
  submitMatrixSession(session: ScheduleSession): void {
    if (!this.selectedGroup) return;
    const key = this.getSessionKey(session);
    this.initSessionDraft(session);

    const draft = this.matrixDraft[key];
    const absentStudentIds = Array.from(draft.absent);
    const excusedStudents = Array.from(draft.excused.entries()).map(([studentId, reason]) => ({ studentId, reason }));

    this.savingSessionKey = key;
    this.cdr.detectChanges();

    this.attendanceService.submitAttendance({
      courseGroupId: this.selectedGroup._id,
      date: session.scheduledDate,
      absentStudentIds,
      excusedStudents
    }).subscribe({
      next: (res) => {
        this.savingSessionKey = null;
        this.dirtySessions.delete(key);
        delete this.matrixDraft[key];
        this.submitResult = res;

        setTimeout(() => {
          if (this.submitResult === res) this.submitResult = null;
          this.cdr.detectChanges();
        }, 10000);

        this.loadHistory();
        this.loadAttendanceSummary();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.savingSessionKey = null;
        alert(err.error?.message || 'Không thể lưu điểm danh cho buổi này.');
        this.cdr.detectChanges();
      }
    });
  }

  /** Tất cả buổi lịch (recorded + missing + future), cũ → mới */
  get allSessions(): ScheduleSession[] {
    if (this.scheduleData?.sessions?.length) {
      return [...this.scheduleData.sessions].sort(
        (a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime()
      );
    }
    return this.historyList.map(h => ({
      scheduledDate: h.date,
      status: 'recorded' as const,
      attendance: h,
    }));
  }

  /** Số buổi đã điểm danh (chỉ recorded) */
  get recordedSessionsCount(): number {
    return this.allSessions.filter(s => s.status === 'recorded').length;
  }

  /** Kiểm tra sinh viên có vắng không phép trong buổi cụ thể không */
  isStudentAbsentInSession(studentId: string, session: ScheduleSession): boolean {
    if (session.status !== 'recorded' || !session.attendance) return false;
    const absentList = session.attendance.absentStudents || [];
    if (!absentList.length) return false;
    return absentList.some((st) => {
      const id = typeof st === 'object' ? st._id : st;
      return id === studentId;
    });
  }

  /** Tổng số buổi vắng KHÔNG PHÉP của SV */
  getTotalAbsentForStudent(studentId: string): number {
    return this.allSessions
      .filter(s => this.getStudentStatusInMatrix(studentId, s) === 'absent')
      .length;
  }

  /** Tổng số buổi vắng CÓ PHÉP của SV */
  getTotalExcusedForStudent(studentId: string): number {
    return this.allSessions
      .filter(s => this.getStudentStatusInMatrix(studentId, s) === 'excused')
      .length;
  }

  /** Chuyển đổi ngày sang định dạng Tiếng Việt (Thứ 2, Thứ 3...) */
  formatVietnameseDay(dateInput: any): string {
    if (!dateInput) return '';
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return '';
    const days = ['Chủ Nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
    return days[d.getDay()] || '';
  }
}


