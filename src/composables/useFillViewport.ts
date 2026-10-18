// A full-height panel (the chat) that fills the screen from wherever it starts
// down to the bottom tab bar (PO 18/10/2026). A fixed `calc(100vh - header)`
// ignored the notices above it (the technician's low-wallet strip) and the tab
// bar below it, so the composer ended up off screen on phones and laptops.
import { onMounted, onUnmounted, ref, type Ref } from 'vue';

/** Space kept under the panel so it does not touch the screen edge or the tab bar. */
const GAP_PX = 16;

/** Height of the fixed bottom tab bar when it is shown (narrow screens), else 0. */
function bottomDock(): number {
  const dock = document.querySelector<HTMLElement>('[data-fh-bottom-dock]');
  // A fixed element has no offsetParent even when shown: hidden (lg:hidden) means no height.
  if (!dock || getComputedStyle(dock).display === 'none') return 0;
  return dock.getBoundingClientRect().height;
}

export function useFillViewport(target: Ref<HTMLElement | null>, minPx = 420): Ref<number | null> {
  const height = ref<number | null>(null);
  let observer: ResizeObserver | null = null;
  let frame = 0;

  const measure = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const el = target.value;
      if (!el) return;
      // Where the panel starts on the page, whatever is above it right now.
      const top = el.getBoundingClientRect().top + window.scrollY;
      const available = window.innerHeight - top - bottomDock() - GAP_PX;
      height.value = Math.max(minPx, Math.round(available));
    });
  };

  onMounted(() => {
    measure();
    window.addEventListener('resize', measure);
    // A notice appearing or closing above the panel moves where it starts.
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(measure);
      observer.observe(document.body);
    }
  });
  onUnmounted(() => {
    cancelAnimationFrame(frame);
    window.removeEventListener('resize', measure);
    observer?.disconnect();
  });
  return height;
}
