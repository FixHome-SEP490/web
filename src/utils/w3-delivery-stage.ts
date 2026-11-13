/**
 * W-16: a request on the paid W3 delivery path keeps `status = 'requested'` on the server
 * (the old QR path is closed for it); its real progress is `w3DeliveryStage`, the latest
 * warehouse delivery event. Screens show the matching ordinary status instead.
 */
export type W3DeliveryStage = 'ENROLLED' | 'INELIGIBLE' | 'PENDING_ASSISTANCE' | 'RESERVED' | 'RELEASED'
  | 'ISSUED_TO_COURIER' | 'DISPATCH_RECORDED' | 'TECHNICIAN_RECEIVED' | string;

const STAGE_STATUS: Record<string, string> = {
  RESERVED: 'ready',
  ISSUED_TO_COURIER: 'delivering',
  DISPATCH_RECORDED: 'delivering',
  TECHNICIAN_RECEIVED: 'received',
};

export function isW3Delivery(request: { w3DeliveryStage?: W3DeliveryStage | null }): boolean {
  return !!request.w3DeliveryStage;
}

/** The status to display: the W3 stage when the request is on that path, else its own status. */
export function displayPartRequestStatus(request: { status: string; w3DeliveryStage?: W3DeliveryStage | null }): string {
  if (!request.w3DeliveryStage || request.status.toLowerCase() !== 'requested') return request.status;
  return STAGE_STATUS[request.w3DeliveryStage] ?? 'requested';
}
