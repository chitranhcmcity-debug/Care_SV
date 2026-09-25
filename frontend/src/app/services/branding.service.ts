import { inject, Injectable, signal } from '@angular/core';
import { Branding, SettingsService } from './settings.service';

const DEFAULT_COLOR = '#673ab7';
const DEFAULT_LOGO = 'logo_truong.png';
// Tailwind shade → mix ratio: positive = towards white, negative = towards black.
const SHADES: [number, number][] = [
  [50, 0.9],
  [100, 0.78],
  [200, 0.6],
  [300, 0.4],
  [400, 0.2],
  [500, 0],
  [600, -0.08],
  [700, -0.16],
  [800, -0.26],
  [900, -0.4],
  [950, -0.55],
];

/**
 * Web interface configured by the admin: system name, logo and primary colour. The `violet`
 * Tailwind palette (the app's accent colour) reads CSS variables, so changing the colour
 * re-themes the whole app without a rebuild (see index.html and styles.css).
 */
@Injectable({ providedIn: 'root' })
export class BrandingService {
  private readonly settings = inject(SettingsService);

  readonly title = signal('ITC CARE');
  readonly schoolName = signal('');
  readonly logo = signal(DEFAULT_LOGO);

  /** Loads the public branding once at start-up (works before sign-in). */
  load(): void {
    this.settings.getBranding().subscribe({
      next: (b) => this.apply(b),
      error: () => {}, // keep the defaults
    });
  }

  apply(b: Partial<Branding>): void {
    if (b.systemTitle) {
      this.title.set(b.systemTitle);
      document.title = b.systemTitle;
    }
    if (b.schoolName) this.schoolName.set(b.schoolName);
    this.logo.set(b.logoDataUrl || DEFAULT_LOGO);
    this.applyColor(b.primaryColor || DEFAULT_COLOR);
  }

  private applyColor(hex: string): void {
    const root = document.documentElement.style;
    if (!/^#[0-9a-f]{6}$/i.test(hex) || hex.toLowerCase() === DEFAULT_COLOR) {
      // The hand-tuned default palette in styles.css.
      for (const [shade] of SHADES) root.removeProperty(`--brand-${shade}`);
      return;
    }
    const base = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    for (const [shade, ratio] of SHADES) {
      const target = ratio >= 0 ? 255 : 0;
      const weight = Math.abs(ratio);
      const rgb = base.map((c) => Math.round(c + (target - c) * weight));
      root.setProperty(`--brand-${shade}`, rgb.join(' '));
    }
  }
}
