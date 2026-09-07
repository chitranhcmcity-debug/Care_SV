export interface User {
  id?: string;
  _id?: string;
  fullName: string;
  email: string;
  role: 'admin' | 'staff' | 'teacher';
  status: 'active' | 'inactive';
  managedClasses?: string[];
  managedStudents?: (Student | string)[];
}

export interface Student {
  _id: string;
  studentCode: string;
  fullName: string;
  classCode: string;
  dob?: string;
  major?: string;
  phone?: string;
  parentPhone?: string;
  courseGroups?: string[];
  tags?: string[];
}

export interface CourseGroup {
  _id: string;
  classCode?: string;
  courseCode?: string;
  courseName?: string;
  groupCode: string;
  shift?: 'Sáng' | 'Chiều' | 'Tối';
  scheduleDays?: string[];
  room?: string;
  startDate?: string;
  endDate?: string;
  teacherId?: User | string;
  teacherName?: string;
  students?: Student[];
}

export interface CallTask {
  _id: string;
  student?: Student;           // mapped from studentId
  studentId?: Student;         // populated student object
  courseGroup?: CourseGroup;   // mapped from courseGroupId
  courseGroupId?: CourseGroup;
  assignedStaff?: { fullName: string; email: string }; // admin-only
  absenceDate?: string;
  status?: 'Chưa gọi' | 'Không bắt máy' | 'Đã liên hệ';
  callStatus: 'Chưa gọi' | 'Không bắt máy' | 'Đã liên hệ';
  callNote: string;
  absenceReasonCategory?: string;
  callbackDate?: string | null;
  isCallbackDue?: boolean;
  callAttempts?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface CrawlerProgress {
  percent: number;
  currentTask: number;
  totalTasks: number;
  foundCount: number;
  currentMssv: string;
  lastFound?: {
    studentCode: string;
    fullName: string;
  } | null;
  completed?: boolean;
  message?: string;
}

export interface SystemSettings {
  _id?: string;
  systemTitle: string;
  schoolName: string;
  departmentName: string;
  supportHotline: string;
  supportEmail: string;
  examBanThreshold: number;
  parentWarningThreshold: number;
  taskAssignmentRule: 'round-robin' | 'least-tasks' | 'admin-only';
  defaultMajorPrefixes: string[];
  crawlerMajorPrefixes: string[];
  defaultConcurrency: number;
  defaultYearFilter: string;
  absenceReasons: string[];
  tags: string[];
}

export type SystemConfig = SystemSettings;

export interface TimelineItem {
  type: 'call_task' | 'attendance';
  date: string;
  title: string;
  courseGroup?: CourseGroup;
  staff?: { fullName: string; email?: string };
  status: string;
  note?: string;
  absenceReasonCategory?: string;
  callbackDate?: string;
  callAttempts?: number;
}

export interface Student360Profile {
  student: Student;
  timeline: TimelineItem[];
  totalAbsences: number;
  totalCalls: number;
}


