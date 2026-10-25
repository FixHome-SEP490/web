import { onMounted, onUnmounted } from 'vue';
import { onResync } from '../services/live-updates';
import { chatSocketService } from '../services/chat-socket.service';

/** Notifications only trigger a bounded read; the pending API decides what is owed. */
export function usePartReturnsRefresh(refresh: () => Promise<void>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  const schedule = () => {
    if (disposed || document.visibilityState === 'hidden') return;
    clearTimeout(timer);
    timer = setTimeout(() => { if (!disposed) void refresh(); }, 150);
  };
  const stopResync = onResync(schedule);
  const stopNotifications = chatSocketService.subscribe({
    onNotificationNew: event => { if (event.type.toUpperCase() === 'PART_RETURN_DECLARED') schedule(); },
  });
  onMounted(() => {
    window.addEventListener('focus', schedule);
    document.addEventListener('visibilitychange', schedule);
  });
  onUnmounted(() => {
    disposed = true;
    clearTimeout(timer);
    stopResync();
    stopNotifications();
    window.removeEventListener('focus', schedule);
    document.removeEventListener('visibilitychange', schedule);
  });
}
