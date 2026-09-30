import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CareCase } from '../../services/care-case.service';
import { CARE_SOURCE_LABELS, CARE_STATUS, CARE_STATUS_LABELS } from '../../models/types';
import { CareIconComponent } from './care-icon.component';

/** Presentational header; editing and closing remain owned by the care page. */
@Component({
  selector: 'app-care-header',
  standalone: true,
  imports: [CommonModule, CareIconComponent],
  templateUrl: './care-header.component.html',
  styleUrl: './care-header.component.css',
})
export class CareHeaderComponent {
  readonly c = input.required<CareCase>();
  readonly overdue = input(false);
  readonly edit = output<void>();
  readonly history = output<void>();
  readonly closeCase = output<void>();
  readonly dismiss = output<void>();
  readonly STATUS = CARE_STATUS;
  readonly statusLabels = CARE_STATUS_LABELS;
  readonly sourceLabels = CARE_SOURCE_LABELS;
}
