import type { RouteLocationNormalizedLoaded } from 'vue-router';

/** Order detail captures orderId in its setup closures; a new route ID needs a fresh component. */
export function customerPageKey(
  route: Pick<RouteLocationNormalizedLoaded, 'name'> & Partial<Pick<RouteLocationNormalizedLoaded, 'params'>>,
): string | undefined {
  if (route.name === 'customer-order-detail') {
    const id = route.params?.id;
    return typeof id === 'string' && id.trim() ? `customer-order:${id}` : undefined;
  }
  return bookingFormKey(route);
}


/** The two booking forms ("Đặt thợ ngay" and "Chẩn đoán bằng AI") share one page component. */
const BOOKING_FORMS = new Set(['new-booking', 'ai-booking']);

/**
 * A key for the customer area's router view: switching between the two booking forms must load
 * the other form, but Vue keeps the same component instance when only the route changes, so the
 * page stayed on the first form (PO 10/10/2026). Other pages keep the default behaviour.
 */
export function bookingFormKey(route: Pick<RouteLocationNormalizedLoaded, 'name'>): string | undefined {
  return typeof route.name === 'string' && BOOKING_FORMS.has(route.name) ? route.name : undefined;
}
