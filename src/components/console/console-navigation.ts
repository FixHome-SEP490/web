import type { Component } from 'vue';
import {
  Award,
  Ban,
  Bot,
  Boxes,
  CreditCard,
  FolderKanban,
  Gauge,
  LayoutDashboard,
  LifeBuoy,
  ListChecks,
  MapPinned,
  Package,
  PackageCheck,
  Receipt,
  ScanFace,
  ScrollText,
  ShieldCheck,
  Sliders,
  Star,
  UserCheck,
  UserSearch,
  Users,
  Wallet,
  WalletCards,
  TicketPercent,
  Warehouse,
  Building2,
  ClipboardCheck,
  KeyRound,
  Megaphone,
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
const partRequests = item('Yêu cầu linh kiện', '/console/part-requests', Boxes);
const partReturns = item('Hoàn trả linh kiện', '/console/part-returns', PackageCheck);
const support = item('Yêu cầu hỗ trợ', '/console/support', LifeBuoy);
const warranty = item('Bảo hành', '/console/warranty', ShieldCheck);
const checkinFaces = item('Xác nhận khuôn mặt', '/console/checkin-faces', ScanFace);
const payouts = item('Chi hộ và rút tiền', '/console/wallets', Wallet);
const serviceAreas = item('Khu vực phục vụ', '/console/service-areas', MapPinned);
const warehouses = item('Kho linh kiện', '/console/warehouses', Warehouse);

/**
 * Sidebar of the console, one list per role (PO 10/10/2026): grouped by job,
 * every page once, short labels. Pages a role may not open are not listed.
 */
export function consoleNavigation(role: ConsoleRole | string | null | undefined): ConsoleNavGroup[] {
  if (role === 'SERVICE_MANAGER') {
    return [
      { group: 'Vận hành', items: [overview, orders, checkinFaces, warehouses, partRequests, partReturns, payouts, serviceAreas] },
      {
        group: 'Hỗ trợ',
        items: [
          support,
          warranty,
          item('Huỷ đơn', '/console/cancellations', Ban),
          item('Điểm uy tín', '/console/reputation', Gauge),
        ],
      },
    ];
  }
  if (role === 'ADMIN') {
    return [
      {
        group: 'Vận hành',
        items: [overview, orders, warehouses, partRequests, support, warranty, item('Trợ lý AI', '/console/admin/ai-quality', Bot)],
      },
      {
        group: 'Kỹ thuật viên',
        items: [
          item('Duyệt danh tính', '/console/technicians', UserCheck),
          item('Duyệt hồ sơ', '/console/admin/profile-reviews', ClipboardCheck),
          item('Trụ sở nhận hồ sơ', '/console/admin/visit-offices', Building2),
          item('Duyệt kỹ năng', '/console/admin/skill-verifications', Award),
          item('Tra cứu', '/console/admin/technician-directory', UserSearch),
        ],
      },
      {
        group: 'Tài chính',
        items: [
          item('Thanh toán', '/console/admin/payments', CreditCard),
          payouts,
          item('Ưu đãi voucher', '/console/admin/vouchers', TicketPercent),
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
          item('Phân quyền SM', '/console/admin/sm-permissions', KeyRound),
          item('Gửi thông báo', '/console/admin/broadcast', Megaphone),
          item('Đánh giá', '/console/admin/reviews', Star),
          item('Cấu hình', '/console/admin/config', Sliders),
          item('Cấu hình giao hàng', '/console/admin/w3-delivery-policy', Package),
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
