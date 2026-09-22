/** Match the Backend quotation-decision gate without treating demo values as actionable. */
export const canDecideOfficialQuotation = (
  order: { status?: string; quotation?: { status?: string } | null } | null | undefined,
): boolean => !!order && String(order.status).toUpperCase() === 'EN_ROUTE'
  && String(order.quotation?.status).toUpperCase() === 'SENT';