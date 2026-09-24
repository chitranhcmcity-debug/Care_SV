import { Pipe, PipeTransform } from '@angular/core';
import { VI_LABELS } from '../models/types';

/** Stored code(s) → Vietnamese display text; arrays are joined, unknown values pass through. */
export function viLabel(value: string | null | undefined): string {
  return value ? (VI_LABELS[value] ?? value) : '';
}

@Pipe({ name: 'viLabel', standalone: true })
export class ViLabelPipe implements PipeTransform {
  transform(value: string | string[] | null | undefined): string {
    return Array.isArray(value) ? value.map(viLabel).join(', ') : viLabel(value);
  }
}
