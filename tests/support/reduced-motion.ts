// Tests run as a browser with reduced motion: the assistant's reply appears at
// once instead of being written out, so a test that waits for the reply does
// not also wait for the animation. Only that one media query is answered; the
// rest (the sidebar's width check) behave as before. The write-out itself is
// tested with an explicit pace in tests/ai-reply-reveal.spec.ts.
if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
  const original = window.matchMedia.bind(window);
  window.matchMedia = (query: string) => {
    const result = original(query);
    if (!query.includes('prefers-reduced-motion')) return result;
    const noop = () => undefined;
    return {
      matches: query.includes('reduce'),
      media: query,
      onchange: null,
      addListener: noop,
      removeListener: noop,
      addEventListener: noop,
      removeEventListener: noop,
      dispatchEvent: () => false,
    } as MediaQueryList;
  };
}
