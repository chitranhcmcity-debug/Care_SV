import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { finalize } from 'rxjs';
import { PermissionService } from '../../services/permission.service';
import { NotificationService } from '../../services/notification.service';
import {
  ConfigurableRole,
  Permission,
  PermissionConfig,
  PermissionMatrix,
} from '../../models/types';

/** Admin: role permission matrix (Phân quyền). */
@Component({
  selector: 'app-permissions-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './permissions-panel.component.html',
  styleUrl: './permissions-panel.component.css',
  host: { class: 'block' },
})
export class PermissionsPanelComponent implements OnInit {
  private readonly permissionService = inject(PermissionService);
  private readonly notify = inject(NotificationService);
  private readonly cdr = inject(ChangeDetectorRef);

  permissionConfig: PermissionConfig | null = null;
  /** Working copy edited by the checkboxes; saved with savePermissions(). */
  permissionDraft: PermissionMatrix | null = null;
  isSavingPermissions = false;

  ngOnInit() {
    this.permissionService.getConfig().subscribe({
      next: (config) => this.applyPermissionConfig(config),
      error: (err) => this.notify.error(err.error?.message || 'Không tải được bảng phân quyền'),
    });
  }

  private applyPermissionConfig(config: PermissionConfig) {
    this.permissionConfig = config;
    this.permissionDraft = this.copyMatrix(config.matrix);
    this.cdr.detectChanges();
  }

  private copyMatrix(matrix: PermissionMatrix): PermissionMatrix {
    return {
      manager: [...matrix.manager],
      staff: [...matrix.staff],
      teacher: [...matrix.teacher],
    };
  }

  /** Permissions grouped for display: one block per group name, groups in first-seen order. */
  get permissionGroups(): { group: string; items: PermissionConfig['permissions'] }[] {
    const groups: { group: string; items: PermissionConfig['permissions'] }[] = [];
    for (const item of this.permissionConfig?.permissions ?? []) {
      const existing = groups.find((g) => g.group === item.group);
      if (existing) existing.items.push(item);
      else groups.push({ group: item.group, items: [item] });
    }
    return groups;
  }

  hasPermission(role: ConfigurableRole, key: Permission): boolean {
    return Boolean(this.permissionDraft?.[role].includes(key));
  }

  /** False when the permission cannot work for that role (e.g. attendance for CSSV staff). */
  permissionApplies(role: ConfigurableRole, key: Permission): boolean {
    const item = this.permissionConfig?.permissions.find((p) => p.key === key);
    return !item?.onlyRoles || item.onlyRoles.includes(role);
  }

  togglePermission(role: ConfigurableRole, key: Permission) {
    if (!this.permissionDraft || !this.permissionApplies(role, key)) return;
    const list = this.permissionDraft[role];
    this.permissionDraft[role] = list.includes(key)
      ? list.filter((k) => k !== key)
      : [...list, key];
  }

  isDefaultPermission(role: ConfigurableRole, key: Permission): boolean {
    return Boolean(this.permissionConfig?.defaults[role].includes(key));
  }

  get permissionsChanged(): boolean {
    const saved = this.permissionConfig?.matrix;
    const draft = this.permissionDraft;
    if (!saved || !draft) return false;
    return (Object.keys(saved) as ConfigurableRole[]).some(
      (role) =>
        saved[role].length !== draft[role].length ||
        saved[role].some((key) => !draft[role].includes(key)),
    );
  }

  resetPermissionsToDefault() {
    if (this.permissionConfig)
      this.permissionDraft = this.copyMatrix(this.permissionConfig.defaults);
  }

  discardPermissionChanges() {
    if (this.permissionConfig) this.permissionDraft = this.copyMatrix(this.permissionConfig.matrix);
  }

  savePermissions() {
    if (!this.permissionDraft) return;
    this.isSavingPermissions = true;
    this.permissionService
      .updateMatrix(this.permissionDraft)
      .pipe(finalize(() => (this.isSavingPermissions = false)))
      .subscribe({
        next: (res) => {
          this.applyPermissionConfig(res);
          this.notify.success(res.message || 'Đã cập nhật phân quyền!');
        },
        error: (err) => this.notify.error(err.error?.message || 'Lỗi khi lưu phân quyền'),
      });
  }
}
