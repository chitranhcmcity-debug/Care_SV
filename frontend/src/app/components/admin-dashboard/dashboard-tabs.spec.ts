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

  it('returns the same tab objects on every call (the sidebar re-renders with them)', () => {
    const auth = manager(['reports.view', 'tasks.manage']);
    expect(visibleDashboardTabs(auth)).toEqual(visibleDashboardTabs(auth));
    visibleDashboardTabs(auth).forEach((tab, i) => expect(tab).toBe(visibleDashboardTabs(auth)[i]));
  });

  it('does not expose the overview after report permission is revoked', () => {
    expect(visibleDashboardTabs(manager(['tasks.manage'])).map((tab) => tab.id)).toEqual(['tasks']);
  });
});

describe('Admin dashboard', () => {
  it('opens on the system overview', () => {
    const admin = {
      isAdmin: () => true,
      isManager: () => false,
      can: () => true,
    } as unknown as AuthService;
    expect(visibleDashboardTabs(admin)[0].id).toBe('overview');
  });
});
