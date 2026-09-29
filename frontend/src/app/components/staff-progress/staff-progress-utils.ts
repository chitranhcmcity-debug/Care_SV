import { StaffProgressRow } from '../../models/types';

/** The four KPI parts, in the order and weight the backend uses (dichVuTienDoNhanVien.js). */
export const RATE_PARTS: { key: keyof StaffProgressRow['rates']; label: string; weight: number }[] =
  [
    { key: 'completion', label: 'Hoàn thành', weight: 30 },
    { key: 'onTime', label: 'Đúng hạn', weight: 25 },
    { key: 'quality', label: 'Chất lượng', weight: 25 },
    { key: 'care', label: 'Bước chăm sóc', weight: 20 },
  ];

/** Tailwind classes for a KPI score badge. */
export function kpiTone(score: number | null): string {
  if (score === null) return 'bg-slate-100 text-slate-600 border-slate-300';
  if (score >= 85) return 'bg-emerald-100 text-emerald-800 border-emerald-300';
  if (score >= 70) return 'bg-blue-100 text-blue-800 border-blue-300';
  if (score >= 50) return 'bg-amber-100 text-amber-800 border-amber-300';
  return 'bg-rose-100 text-rose-800 border-rose-300';
}

/** Bar colour for a 0–100 rate. */
export function rateTone(value: number | null): string {
  if (value === null) return 'bg-slate-300';
  if (value >= 85) return 'bg-emerald-500';
  if (value >= 70) return 'bg-blue-500';
  if (value >= 50) return 'bg-amber-500';
  return 'bg-rose-500';
}
