import { onMounted, onUnmounted } from 'vue';
import Lenis from 'lenis';

export function useSmoothScroll() {
  let lenis: Lenis | null = null;
  let rafId: number;

  onMounted(() => {
    lenis = new Lenis();

    function raf(time: number) {
      if (lenis) {
        lenis.raf(time);
      }
      rafId = requestAnimationFrame(raf);
    }

    rafId = requestAnimationFrame(raf);
  });

  onUnmounted(() => {
    if (rafId) {
      cancelAnimationFrame(rafId);
    }
    if (lenis) {
      lenis.destroy();
    }
  });
}
