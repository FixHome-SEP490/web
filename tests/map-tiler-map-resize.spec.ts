import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';

/**
 * PO 12/10/2026: a map created in a hidden tab (0×0 container) kept a wrong size
 * and centre, so the pin sat at the top edge over the sea. The map must measure
 * itself again and put the pin back in the middle once it really has a size.
 */

const { mapInstances } = vi.hoisted(() => ({ mapInstances: [] as Array<Record<string, ReturnType<typeof vi.fn>>> }));

vi.mock('maplibre-gl', () => {
  class Map {
    resize = vi.fn();
    jumpTo = vi.fn();
    setCenter = vi.fn();
    flyTo = vi.fn();
    getZoom = vi.fn(() => 15);
    addControl = vi.fn();
    remove = vi.fn();
    on = vi.fn();
    constructor() {
      mapInstances.push(this as unknown as Record<string, ReturnType<typeof vi.fn>>);
    }
  }
  class Marker {
    setLngLat() { return this; }
    addTo() { return this; }
    on() { return this; }
    remove() {}
    getLngLat() { return { lat: 0, lng: 0 }; }
  }
  class NavigationControl {}
  return { Map, Marker, NavigationControl };
});
vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}));

import MapTilerMap from '../src/components/common/MapTilerMap.vue';

let observerCallback: (() => void) | null = null;
class FakeResizeObserver {
  constructor(cb: () => void) { observerCallback = cb; }
  observe() {}
  disconnect() {}
}

const setSize = (el: Element, width: number, height: number) => {
  Object.defineProperty(el, 'clientWidth', { configurable: true, value: width });
  Object.defineProperty(el, 'clientHeight', { configurable: true, value: height });
};

const PIN = { id: 'picker', lat: 10.7745, lng: 106.701, draggable: true };

describe('MapTilerMap: size and centre after a hidden tab', () => {
  beforeEach(() => {
    mapInstances.length = 0;
    observerCallback = null;
    vi.stubEnv('VITE_MAPTILER_KEY', 'test-key');
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('created at 0×0, it re-measures and re-centres on the pin once it gets a size', () => {
    const wrapper = mount(MapTilerMap, {
      props: { center: { lat: 21.0285, lng: 105.8542 }, markers: [PIN], zoom: 14, clickToMove: 'picker' },
    });
    const map = mapInstances[0];
    expect(map).toBeDefined();
    expect(observerCallback).toBeTypeOf('function');

    setSize(wrapper.find('div[style]').element, 800, 384);
    observerCallback!();

    expect(map.resize).toHaveBeenCalled();
    expect(map.jumpTo).toHaveBeenCalledWith({ center: [106.701, 10.7745], zoom: 14 });

    // A later plain resize only re-measures; it does not move the user's view.
    map.jumpTo.mockClear();
    observerCallback!();
    expect(map.jumpTo).not.toHaveBeenCalled();
  });

  it('refresh() re-measures and centres on the pin, or the centre when there is none', () => {
    const wrapper = mount(MapTilerMap, { props: { center: { lat: 21.0285, lng: 105.8542 }, zoom: 14 } });
    const map = mapInstances[0];

    (wrapper.vm as unknown as { refresh: () => void }).refresh();
    expect(map.resize).toHaveBeenCalled();
    expect(map.jumpTo).toHaveBeenCalledWith({ center: [105.8542, 21.0285], zoom: 14 });
  });
});
