import type { Component } from 'vue';
import {
  Award,
  Ban,
  Boxes,
  CreditCard,
  FolderKanban,
  Gauge,
  LayoutDashboard,
  LifeBuoy,
  ListChecks,
  MapPinned,
  Package,
  Receipt,
  ScrollText,
  ShieldCheck,
  Sliders,
  Star,
  UserCheck,
  UserPlus,
  UserSearch,
  Users,
  Wallet,
  WalletCards,
} from 'lucide-vue-next';

export interface ConsoleNavItem {
  label: string;
  path: string;
  icon: Component;
}

export interface ConsoleNavGroup {
  group: string;
  items: ConsoleNavItem[];
}

export type ConsoleRole = 'SERVICE_MANAGER' | 'ADMIN';

const item = (label: string, path: string, icon: Component): ConsoleNavItem => ({ label, path, icon });

const overview = item('Tổng quan', '/console', LayoutDashboard);
const orders = item('Đơn sửa chữa', '/console/orders', ListChecks);
const bookings = item('Gán thợ', '/console/bookings', UserPlus);
const partRequests = item('Yêu cầu linh kiện', '/console/part-requests', Boxes);
const warranty = item('Bảo hành', '/console/warranty', ShieldCheck);
const technicianWallets = item('Ví kỹ thuật viên', '/console/wallets', Wallet);
const serviceAreas = item('Khu vực phục vụ', '/console/service-areas', MapPinned);

/**
 * Sidebar of the console, one list per role (PO 10/10/2026): grouped by job,
 * every page once, short labels. Pages a role may not open are not listed.
 */
export function consoleNavigation(role: ConsoleRole | string | null | undefined): ConsoleNavGroup[] {
  if (role === 'SERVICE_MANAGER') {
    return [
      { group: 'Vận hành', items: [overview, orders, bookings, partRequests, technicianWallets, serviceAreas] },
      {
        group: 'Hỗ trợ',
        items: [
          item('Yêu cầu hỗ trợ', '/console/support', LifeBuoy),
          warranty,
          item('Huỷ đơn', '/console/cancellations', Ban),
          item('Điểm uy tín', '/console/reputation', Gauge),
        ],
      },
    ];
  }
  if (role === 'ADMIN') {
    return [
      { group: 'Vận hành', items: [overview, orders, bookings, partRequests, warranty] },
      {
        group: 'Kỹ thuật viên',
        items: [
          item('Duyệt hồ sơ', '/console/technicians', UserCheck),
          item('Duyệt kỹ năng', '/console/admin/skill-verifications', Award),
          item('Tra cứu', '/console/admin/technician-directory', UserSearch),
        ],
      },
      {
        group: 'Tài chính',
        items: [
          item('Thanh toán', '/console/admin/payments', CreditCard),
          technicianWallets,
          item('Ví khách hàng', '/console/admin/customer-wallets', WalletCards),
          item('Công nợ nền tảng', '/console/admin/platform-dues', Receipt),
        ],
      },
      {
        group: 'Danh mục',
        items: [
          item('Dịch vụ', '/console/catalog', FolderKanban),
          item('Linh kiện', '/console/admin/parts', Package),
          serviceAreas,
        ],
      },
      {
        group: 'Hệ thống',
        items: [
          item('Người dùng', '/console/admin/users', Users),
          item('Đánh giá', '/console/admin/reviews', Star),
          item('Cấu hình', '/console/admin/config', Sliders),
          item('Nhật ký thao tác', '/console/admin/audit-logs', ScrollText),
        ],
      },
    ];
  }
  return [];
}

export const consoleRoleLabels: Record<ConsoleRole, string> = {
  SERVICE_MANAGER: 'Quản lý dịch vụ',
  ADMIN: 'Quản trị viên',
};
