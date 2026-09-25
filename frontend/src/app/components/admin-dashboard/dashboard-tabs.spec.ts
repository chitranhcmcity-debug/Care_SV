import { AuthService } from '../../services/auth.service';
import { visibleDashboardTabs } from './dashboard-tabs';

describe('Manager dashboard', () => {
  const manager = (permissions: string[]) =>
    ({
      isAdmin: () => false,
      isManager: () => true,
      can: (permission: string) => permissions.includes(permission),
    }) as unknown as AuthService;

  it('opens on the overview and excludes system administration', () => {
    const tabs = visibleDashboardTabs(manager(['reports.view', 'tasks.manage', 'classes.assign']));
    expect(tabs.map((tab) => tab.id)).toEqual(['analytics', 'classes', 'tasks']);
  });

  it('does not expose the overview after report permission is revoked', () => {
    expect(visibleDashboardTabs(manager(['tasks.manage'])).map((tab) => tab.id)).toEqual(['tasks']);
  });
});
