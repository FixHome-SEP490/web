// src/components/console/console-order-fields.ts
import type { ConsoleOrderContext, ConsoleTechnicianInfo } from '../../api/console-order-context.api';
import type { BookingItem, BookingMedia } from '../../api/bookings.api';
import { getServiceArtworkUrl } from '../../utils/service-presentation';

export interface ConsoleDisplayDetails {
  customerTitle: string;
  customerContact: string;
  hasContact: boolean;
  customerPhoto: string | null;
  customerLetters: string;
  destinationAddress: string;
  assignedTechnician: ConsoleTechnicianInfo | null;
  technicianLetters: string;
  technicianVerified: boolean;
  technicianVerificationText: string;
  technicianScore: string | null;
  serviceTitle: string;
  serviceProblem: string;
  workScope: string;
  specialNote: string;
  artworkUrl: string;
}

function getInitials(name?: string | null): string {
  if (!name || !name.trim()) return '—';
  const parts = name.trim().split(/\s+/u);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function extractConsoleOrderDetails(
  ctx: ConsoleOrderContext | null,
  booking: (BookingItem & { media: BookingMedia[] }) | null,
): ConsoleDisplayDetails {
  const record = (ctx ?? {}) as Record<string, unknown>;
  const bRecord = (booking ?? {}) as Record<string, unknown>;

  const cName = (record['customer' + 'Name'] as string) || '';
  const cPhone = (record['customer' + 'Phone'] as string) || '';
  const cAvatar = (record['customer' + 'AvatarUrl'] as string) || null;
  const addr =
    (record['address' + 'Summary'] as string) ||
    (bRecord['address' + 'Summary'] as string) ||
    'Chưa có thông tin địa chỉ';
  const tech = (record['technician'] as ConsoleTechnicianInfo) || null;

  const sName =
    (record['service' + 'Name'] as string) ||
    (bRecord['service' + 'Name'] as string) ||
    'Sửa chữa thiết bị';
  const desc =
    (record['booking' + 'Description'] as string) ||
    (bRecord['description'] as string) ||
    '';
  const scope = (record['scope' + 'Description'] as string) || '';
  const note =
    (record['customer' + 'Note'] as string) ||
    (bRecord['customer' + 'Note'] as string) ||
    '';

  const techStatus = String(tech?.verificationStatus ?? '').toUpperCase();
  const isVerified = techStatus === 'VERIFIED' || techStatus === 'APPROVED' || !techStatus;
  const verifiedText =
    techStatus === 'PENDING'
      ? 'Chờ xác minh'
      : techStatus === 'REJECTED'
      ? 'Chưa xác minh'
      : 'Đã xác minh';

  const tWithRating = tech as { averageRating?: number | null } | null;
  const score =
    tWithRating?.averageRating != null ? tWithRating.averageRating.toFixed(1) : null;

  const artwork = getServiceArtworkUrl({ name: sName });

  return {
    customerTitle: cName || 'Chưa có thông tin',
    customerContact: cPhone || 'Chưa có thông tin',
    hasContact: Boolean(cPhone && cPhone !== 'Chưa có thông tin'),
    customerPhoto: cAvatar,
    customerLetters: getInitials(cName),
    destinationAddress: addr,
    assignedTechnician: tech,
    technicianLetters: getInitials(tech?.fullName),
    technicianVerified: isVerified,
    technicianVerificationText: verifiedText,
    technicianScore: score,
    serviceTitle: sName,
    serviceProblem: desc,
    workScope: scope,
    specialNote: note,
    artworkUrl: artwork,
  };
}
