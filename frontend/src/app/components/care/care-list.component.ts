import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CareCaseSummary } from '../../services/care-case.service';
import { CARE_SOURCE_LABELS, CARE_STATUS_LABELS, CareStatus } from '../../models/types';
import { CareIconComponent } from './care-icon.component';

@Component({
  selector: 'app-care-list',
  standalone: true,
  imports: [CommonModule, FormsModule, CareIconComponent],
  templateUrl: './care-list.component.html',
  styleUrl: './care-list.component.css',
})
export class CareListComponent {
  readonly items = input.required<CareCaseSummary[]>();
  readonly tabs =
    input.required<{ id: 'open' | CareStatus; label: string; count: number | null }[]>();
  readonly activeTab = input.required<'open' | CareStatus>();
  readonly search = input('');
  readonly selectedId = input<string>();
  readonly overdueIds = input.required<Set<string>>();
  readonly loading = input(false);
  readonly canCreate = input(false);
  readonly searchChange = output<string>();
  readonly tabChange = output<'open' | CareStatus>();
  readonly selectCase = output<CareCaseSummary>();
  readonly createCase = output<void>();
  readonly statusLabels = CARE_STATUS_LABELS;
  readonly sourceLabels = CARE_SOURCE_LABELS;

  progress(done: number, total: number): number {
    return total ? Math.round((done / total) * 100) : 0;
  }
}
