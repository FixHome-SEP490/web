export function bookingSchedule(day: string, period: string, now = new Date()) {
  const start = new Date(now);
  if (day === 'TOMORROW') {
    start.setDate(start.getDate() + 1);
  } else if (day === 'WEEKEND') {
    start.setDate(start.getDate() + ((6 - start.getDay() + 7) % 7));
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    const [y, m, d] = day.split('-').map(Number);
    start.setFullYear(y, m - 1, d);
  }

  const windows: Record<string, [number, number, number, number]> = {
    MORNING: [8, 0, 12, 0],
    AFTERNOON: [13, 30, 17, 30],
    EVENING: [18, 0, 20, 30],
  };

  let end: Date;
  if (period === 'EARLIEST') {
    const isToday =
      day === 'TODAY' ||
      (/^\d{4}-\d{2}-\d{2}$/.test(day) &&
        start.getFullYear() === now.getFullYear() &&
        start.getMonth() === now.getMonth() &&
        start.getDate() === now.getDate());

    if (isToday) {
      start.setTime(now.getTime() + 60 * 60 * 1000);
    } else {
      start.setHours(8, 0, 0, 0);
    }
    end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  } else if (/^\d{1,2}:\d{2}$/.test(period)) {
    const [h, min] = period.split(':').map(Number);
    start.setHours(h, min, 0, 0);
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

