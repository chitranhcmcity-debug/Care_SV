import { TASK_STATUS, TaskStatus, WorkTask } from '../models/types';

type TaskUser = { fullName: string; email: string } | string | null | undefined;

/** Tên hiển thị của người được giao/người giao nhiệm vụ (object đã populate hoặc id trần). */
export function taskUserName(user: TaskUser): string {
  if (!user) return '—';
  return typeof user === 'string' ? user : user.fullName;
}

export function isTaskOverdue(task: WorkTask): boolean {
  if (!task.dueDate || task.status === TASK_STATUS.COMPLETED) return false;
  return new Date(task.dueDate).getTime() < Date.now();
}

/** Phần trăm hoàn thành; việc đã nộp tính là 100% (nhiệm vụ tạo trước khi có theo dõi tiến độ thì không có). */
export function taskProgress(task: WorkTask): number {
  if (task.status === TASK_STATUS.SUBMITTED || task.status === TASK_STATUS.COMPLETED) return 100;
  return task.progress ?? 0;
}

/** Báo cáo tiến độ mới nhất có ghi chú, nếu có. */
export function lastProgressNote(task: WorkTask) {
  return [...(task.progressLog ?? [])].reverse().find((entry) => entry.note) ?? null;
}

export function countTasksByStatus(tasks: WorkTask[], ...statuses: TaskStatus[]): number {
  return tasks.filter((t) => statuses.includes(t.status)).length;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
