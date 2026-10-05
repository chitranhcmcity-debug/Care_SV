import { Component, input } from '@angular/core';

const PATHS = {
  search: 'm21 21-4.3-4.3 M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  person: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M4 21v-2a8 8 0 0 1 16 0v2Z',
  calendar:
    'M8 2v4 M16 2v4 M3 10h18 M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2 M7 14h2 M12 14h2 M7 18h2 M12 18h2',
  phone: 'M8 3 4 4C1 12 12 23 20 20l1-4-5-3-2 3-6-6 3-2Z',
  edit: 'm15 4 5 5 M4 16 16 4a2 2 0 0 1 4 4L8 20H4Z M13 21h8',
  history: 'M3 11a9 9 0 1 1 2 7 M3 4v7h7 M12 7v5l3 2',
  close: 'm6 6 12 12 M6 18 18 6',
  archive: 'M3 4h18v4H3Z M5 8v12h14V8 M9 12h6',
  steps: 'M9 5h12 M9 12h12 M9 19h12 M3 5h1 M3 12h1 M3 19h1',
  note: 'M4 3h16v14l-5 4H4Z M8 8h8 M8 12h6 M15 21v-4h5',
  file: 'M14 2H5v20h14V7Z M14 2v5h5 M8 12h8 M8 16h6',
  check: 'm5 12 4 4L19 6',
  sparkles: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z M20 2v4 M18 4h4',
  bulb: 'M9 18h6 M9 21h6 M8 14a7 7 0 1 1 8 0l-1 2H9Z',
  flag: 'M5 22V3 M5 3c5-4 9 4 15 0v11c-6 4-10-4-15 0',
  arrow: 'm14 5-7 7 7 7',
  plus: 'M12 5v14 M5 12h14',
} as const;

export type CareIcon = keyof typeof PATHS;

/** Same inline SVG approach as the app shell, shared by the care panels. */
@Component({
  selector: 'app-care-icon',
  standalone: true,
  template: `<svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path [attr.d]="paths[name()]" />
  </svg>`,
  styles: [
    ':host { display: inline-flex; width: 20px; height: 20px; flex: 0 0 auto; } svg { width: 100%; height: 100%; }',
  ],
})
export class CareIconComponent {
  readonly name = input.required<CareIcon>();
  readonly paths = PATHS;
}
