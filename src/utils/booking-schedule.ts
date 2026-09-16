export function bookingSchedule(day: string, period: string, now = new Date()) {
  const start = new Date(now);
  if (day === 'TOMORROW') start.setDate(start.getDate() + 1);
  else if (day === 'WEEKEND') start.setDate(start.getDate() + ((6 - start.getDay() + 7) % 7));
  const windows: Record<string, [number, number, number, number]> = {
    MORNING: [8, 0, 12, 0], AFTERNOON: [13, 30, 17, 30], EVENING: [18, 0, 20, 30],
  };
  let end: Date;
  if (period === 'EARLIEST') {
    if (day === 'TODAY') start.setTime(now.getTime() + 60 * 60 * 1000);
    else start.setHours(8, 0, 0, 0);
    end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  } else {
    const window = windows[period];
    if (!window) throw new Error('Vui lòng chọn khung giờ hợp lệ.');
    start.setHours(window[0], window[1], 0, 0);
    end = new Date(start);
    end.setHours(window[2], window[3], 0, 0);
  }
  if (start <= now) throw new Error('Khung giờ đã qua. Vui lòng chọn giờ hoặc ngày khác.');
  return { preferredStartAt: start.toISOString(), preferredEndAt: end.toISOString() };
}
