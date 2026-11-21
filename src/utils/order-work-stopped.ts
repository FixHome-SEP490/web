/** True when onsite work was stopped and technician assignment was released (historical order status is kept). */
export function isOrderWorkStopped(
  order: { workStopped?: boolean; operationalDisposition?: string } | null | undefined,
): boolean {
  return !!order && (order.workStopped === true || order.operationalDisposition === 'STOPPED');
}
