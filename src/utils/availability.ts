import { vnDateString, vnTimeString, isSameVnDay } from './vn-time';

/** Receiving jobs now (PO 08/10/2026): the weekly schedule switches it, the manual switch pauses, time off wins. */
export interface TechnicianAvailability {
  state: 'receiving' | 'paused' | 'off_hours' | 'time_off' | 'no_schedule';
  receiving: boolean;
  until: string | null;
  nextStartAt: string | null;
}

const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

/** "07:00 hôm nay", "07:00 T7 10/10". */
function when(at: string, now: Date): string {
  const date = new Date(at);
  if (isSameVnDay(date, now)) return `${vnTimeString(date)} hôm nay`;
  const dow = new Date(date.getTime() + 7 * 3600_000).getUTCDay();
  return `${vnTimeString(date)} ${WEEKDAYS[dow]} ${vnDateString(date).slice(0, 5)}`;
}

/** Title and one line of detail for the dashboard switch. */
export function availabilityText(a: TechnicianAvailability | null, manual: boolean | null, now: Date = new Date()): { title: string; detail: string; receiving: boolean } {
  if (!a) {
    if (manual === null) return { title: 'Chưa xác định trạng thái nhận đơn', detail: '', receiving: false };
    return { title: manual ? 'Đang nhận việc' : 'Tạm nghỉ nhận đơn', detail: 'Trạng thái ca', receiving: !!manual };
  }
  switch (a.state) {
    case 'receiving':
      return { title: 'Đang nhận việc', detail: a.until ? `Theo lịch tới ${vnTimeString(new Date(a.until))}` : 'Theo lịch làm việc', receiving: true };
    case 'off_hours':
      return { title: 'Ngoài giờ làm', detail: a.nextStartAt ? `Tự nhận việc lại lúc ${when(a.nextStartAt, now)}` : 'Theo lịch làm việc', receiving: false };
    case 'paused':
      return { title: 'Tạm nghỉ nhận đơn', detail: 'Bấm để bật lại', receiving: false };
    case 'time_off':
      return { title: 'Đang nghỉ', detail: a.until ? `Tới ${when(a.until, now)}` : 'Theo lịch nghỉ', receiving: false };
    case 'no_schedule':
    default:
      return { title: 'Chưa đặt lịch làm', detail: 'Đặt lịch tuần để nhận việc', receiving: false };
  }
}
