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

/** Percent done; handed-in work counts as 100% (tasks created before progress tracking have none). */
export function taskProgress(task: WorkTask): number {
  if (task.status === TASK_STATUS.SUBMITTED || task.status === TASK_STATUS.COMPLETED) return 100;
  return task.progress ?? 0;
}

/** The latest progress report that carries a note, if any. */
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
