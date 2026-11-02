// One check-in covers every device of a visit, but each device's order stays EN_ROUTE until its
// own repair starts (bug 17). The lists read the arrival from `arrivedAt`, the order state is not
// changed and no ARRIVED status is invented.
import type { VisitGroupPageDevice, VisitGroupPageItem } from '../api/visit-groups.api';

export const VISIT_DEVICE_ARRIVED_LABEL = 'Đã đến, chờ sửa';
export const VISIT_GROUP_ARRIVED_LABEL = 'Đã đến nơi';

type ArrivalSource = Pick<VisitGroupPageDevice, 'orderStatus' | 'outcome'> & { arrivedAt?: string | null };

/** The technician checked in for the visit and this device's repair has not started yet. */
export function isArrivedWaiting(item: ArrivalSource): boolean {
  if (!item.arrivedAt || item.outcome != null) return false;
  return ['accepted', 'en_route'].includes(String(item.orderStatus ?? '').toLowerCase());
}

/** The parent row still reads EN_ROUTE (nothing under repair yet) although the technician is there. */
export function isVisitArrived(group: Pick<VisitGroupPageItem, 'status' | 'items'>): boolean {
  return (group.status === 'en_route' || group.status === 'accepted') && group.items.some(isArrivedWaiting);
}
