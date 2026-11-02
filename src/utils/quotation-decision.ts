/** Match the Backend quotation-decision gate without treating demo values as actionable. */
export const canDecideOfficialQuotation = (
  order: { workStopped?: boolean; operationalDisposition?: string; status?: string; quotation?: { status?: string } | null } | null | undefined,
): boolean => !!order && !order.workStopped && order.operationalDisposition !== 'STOPPED' && String(order.status).toUpperCase() === 'EN_ROUTE'
  && String(order.quotation?.status).toUpperCase() === 'SENT';