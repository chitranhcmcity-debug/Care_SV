import { TASK_STATUS, TaskStatus, WorkTask } from '../models/types';

type TaskUser = { fullName: string; email: string } | string | null | undefined;

/** Display name for a task's assignee/assigner (populated object or bare id). */
export function taskUserName(user: TaskUser): string {
  if (!user) return '—';
  return typeof user === 'string' ? user : user.fullName;
}

export function isTaskOverdue(task: WorkTask): boolean {
  if (!task.dueDate || task.status === TASK_STATUS.COMPLETED) return false;
  return new Date(task.dueDate).getTime() < Date.now();
}

export function countTasksByStatus(tasks: WorkTask[], ...statuses: TaskStatus[]): number {
  return tasks.filter((t) => statuses.includes(t.status)).length;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
