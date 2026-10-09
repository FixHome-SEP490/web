// What the account (avatar) menu and the header button show for each role.
// One source for the public pages and the customer area, so the header reads
// the same everywhere: account items only, never a list of services.

export type AccountMenuContext = 'public' | 'customer-app';

export type AccountMenuIcon = 'orders' | 'history' | 'warranty' | 'wallet' | 'notifications' | 'profile' | 'area';

export interface AccountMenuLink {
  to: string;
  label: string;
  icon: AccountMenuIcon;
  testId: string;
  /** Hidden from the lg breakpoint up, where the top navigation already has it. */
  hiddenOnWide?: boolean;
}

export interface RoleLink {
  to: string;
  label: string;
}

function normalise(role: string | null | undefined): string {
  return (role ?? '').toUpperCase();
}

function isStaff(role: string): boolean {
  return role === 'ADMIN' || role === 'SERVICE_MANAGER';
}

/** The one call to action a signed-in user gets in the public header. */
export function roleHeaderAction(role: string | null | undefined): RoleLink | null {
  const r = normalise(role);
  if (r === 'CUSTOMER') return { to: '/app/bookings/new', label: 'Đặt thợ ngay' };
  if (r === 'TECHNICIAN') return { to: '/tech', label: 'Vào trang thợ' };
  if (isStaff(r)) return { to: '/console', label: 'Vào trang quản lý' };
  return null;
}

/** Where a signed-in user's own area starts (footer "Tài khoản" column). */
export function roleAreaLink(role: string | null | undefined): RoleLink | null {
  const r = normalise(role);
  if (r === 'CUSTOMER') return { to: '/app/orders', label: 'Đơn của tôi' };
  if (r === 'TECHNICIAN') return { to: '/tech', label: 'Vào trang thợ' };
  if (isStaff(r)) return { to: '/console', label: 'Vào trang quản lý' };
  return null;
}

/** Account items of the avatar menu; logout is always added by the menu itself. */
export function accountMenuLinks(role: string | null | undefined, context: AccountMenuContext): AccountMenuLink[] {
  const r = normalise(role);
  if (r === 'CUSTOMER') {
    if (context === 'customer-app') {
      // Orders sit in the top navigation and the bottom tab bar already.
      return [
        { to: '/app/history', label: 'Lịch sử sửa chữa', icon: 'history', testId: 'menu-history' },
        { to: '/app/warranties', label: 'Bảo hành', icon: 'warranty', testId: 'menu-warranties', hiddenOnWide: true },
        { to: '/app/wallet', label: 'Ví của tôi', icon: 'wallet', testId: 'menu-wallet' },
        { to: '/app/notifications', label: 'Thông báo', icon: 'notifications', testId: 'menu-notifications' },
        { to: '/app/profile', label: 'Hồ sơ cá nhân', icon: 'profile', testId: 'menu-profile' },
      ];
    }
    return [
      { to: '/app/orders', label: 'Đơn của tôi', icon: 'orders', testId: 'menu-orders' },
      { to: '/app/history', label: 'Lịch sử sửa chữa', icon: 'history', testId: 'menu-history' },
      { to: '/app/wallet', label: 'Ví của tôi', icon: 'wallet', testId: 'menu-wallet' },
      { to: '/app/profile', label: 'Hồ sơ cá nhân', icon: 'profile', testId: 'menu-profile' },
    ];
  }
  if (r === 'TECHNICIAN') {
    return [
      { to: '/tech/jobs', label: 'Công việc', icon: 'orders', testId: 'menu-jobs' },
      { to: '/tech/wallet', label: 'Ví của tôi', icon: 'wallet', testId: 'menu-wallet' },
      { to: '/tech/profile', label: 'Hồ sơ cá nhân', icon: 'profile', testId: 'menu-profile' },
    ];
  }
  if (isStaff(r)) {
    return [{ to: '/console/orders', label: 'Quản lý đơn', icon: 'orders', testId: 'menu-orders' }];
  }
  return [];
}

export function roleLabel(role: string | null | undefined): string {
  switch (normalise(role)) {
    case 'ADMIN':
      return 'Quản trị viên';
    case 'SERVICE_MANAGER':
      return 'Quản lý dịch vụ';
    case 'TECHNICIAN':
      return 'Kỹ thuật viên';
    case 'CUSTOMER':
      return 'Khách hàng';
    default:
      return 'Thành viên';
  }
}
