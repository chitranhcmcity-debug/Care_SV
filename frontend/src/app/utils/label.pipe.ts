import { Pipe, PipeTransform } from '@angular/core';
import { VI_LABELS } from '../models/types';

/** Mã đã lưu → chữ hiển thị tiếng Việt; mảng được nối, giá trị không rõ được giữ nguyên. */
export function viLabel(value: string | null | undefined): string {
  return value ? (VI_LABELS[value] ?? value) : '';
}

@Pipe({ name: 'viLabel', standalone: true })
export class ViLabelPipe implements PipeTransform {
  transform(value: string | string[] | null | undefined): string {
    return Array.isArray(value) ? value.map(viLabel).join(', ') : viLabel(value);
  }
}
