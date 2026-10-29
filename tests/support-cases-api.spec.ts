import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiClientMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock('../src/api/client', () => ({ default: apiClientMock }));

import {
  supportCasesApi,
  type SupportCaseDetail,
  type SupportCaseResolvePayload,
} from '../src/api/support-cases.api';

const sampleCase: SupportCaseDetail = {
  id: 'case-1',
  caseType: 'cash_mismatch',
  status: 'open',
  bookingId: 'booking-1',
  serviceOrderId: 'order-1',
  reason: 'Số tiền khách xác nhận khác với số tiền thợ khai báo.',
  description: 'Cần kiểm tra đối soát tiền mặt theo dữ liệu Backend.',
  createdAt: '2026-09-15T08:00:00.000Z',
  updatedAt: '2026-09-15T08:00:00.000Z',
  serviceOrder: {
    id: 'order-1',
    code: 'SO-1001',
    status: 'COMPLETED',
    paymentStatus: 'UNPAID',
    laborTotal: 180000,
    partsTotal: 120000,
    grandTotal: 300000,
  },
  cashSettlement: {
    id: 'settlement-1',
    status: 'disputed',
    declaredAmount: 300000,
    confirmedAmount: 250000,
    declaredAt: '2026-09-15T08:00:00.000Z',
    confirmedAt: '2026-09-15T09:00:00.000Z',
    technicianNotes: 'Khách báo đã đưa 250.000 đồng.',
  },
};

const envelope = (data: unknown, meta?: unknown) => ({
  data: { success: true, statusCode: 200, message: 'OK', data, ...(meta ? { meta } : {}) },
});

describe('supportCasesApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('normalizes the frozen list envelope and forwards supported query params', async () => {
    apiClientMock.get.mockResolvedValueOnce(
      envelope([sampleCase], { page: 2, limit: 10, total: 11, totalPages: 2 }),
    );

    const result = await supportCasesApi.listCases({
      page: 2,
      limit: 10,
      caseType: 'cash_mismatch',
      status: 'open',
      bookingId: 'booking-1',
      serviceOrderId: 'order-1',
      assignedManagerId: 'manager-1',
      search: 'cash',
    });

    expect(apiClientMock.get).toHaveBeenCalledWith('/support/cases', {
      params: {
        page: 2,
        limit: 10,
        caseType: 'cash_mismatch',
        status: 'open',
        bookingId: 'booking-1',
        serviceOrderId: 'order-1',
        assignedManagerId: 'manager-1',
        search: 'cash',
      },
    });
    expect(result.data[0]?.id).toBe('case-1');
    expect(result.meta.totalPages).toBe(2);
  });

  it('normalizes a detail envelope including readonly cash context', async () => {
    apiClientMock.get.mockResolvedValueOnce(envelope(sampleCase));

    const result = await supportCasesApi.getCase('case-1');

    expect(apiClientMock.get).toHaveBeenCalledWith('/support/cases/case-1');
    expect(result.cashSettlement?.confirmedAmount).toBe(250000);
    expect(result.serviceOrder?.grandTotal).toBe(300000);
  });

  it('normalizes typed technician responsibility fields from Backend detail', async () => {
    apiClientMock.get.mockResolvedValueOnce(envelope({
      ...sampleCase,
      caseType: 'technician_replacement',
      reasonClass: 'technician_skill_gap',
      reasonCode: 'skill_gap',
      responsibility: 'pending_sm_review',
      responsibilityCommandId: null,
      responsibilityActorId: null,
      responsibilityReason: null,
      responsibilityEvidenceRefs: null,
      responsibilityDecidedAt: null,
      workflowVersion: 0,
    }));

    const result = await supportCasesApi.getCase('case-1');

    expect(result).toMatchObject({
      reasonClass: 'technician_skill_gap',
      reasonCode: 'skill_gap',
      responsibility: 'pending',
      workflowVersion: 0,
      responsibilityEvidenceRefs: null,
    });
  });

  it('sends the exact resolve payload and returns the normalized detail', async () => {
    const payload: SupportCaseResolvePayload = {
      finalStatus: 'resolved',
      resolutionCode: 'CASH_CONFIRMED',
      reason: 'Đã đối chiếu chứng từ và xác nhận số tiền theo Backend.',
      evidenceRefs: ['audit://cash/settlement-1'],
    };
    apiClientMock.post.mockResolvedValueOnce(envelope({ ...sampleCase, status: 'resolved' }));

    const result = await supportCasesApi.resolveCase('case-1', payload);

    expect(apiClientMock.post).toHaveBeenCalledWith('/support/cases/case-1/resolve', payload);
    expect(result.status).toBe('resolved');
  });

  it('creates a typed technician report with the locked backend classification and evidence refs', async () => {
    const payload = {
      serviceOrderId: '7b367e43-fc40-481a-906d-8ca8cdbd6176',
      reasonClass: 'non_technician_exception' as const,
      reasonCode: 'no_compatible_part' as const,
      reason: 'Không có linh kiện phù hợp để hoàn tất sửa chữa tại nhà.',
      evidenceRefs: ['media-1'],
    };
    apiClientMock.post.mockResolvedValueOnce(envelope({
      ...sampleCase,
      caseType: 'technician_replacement',
      reasonClass: payload.reasonClass,
      reasonCode: payload.reasonCode,
      responsibility: 'pending_sm_review',
      workflowVersion: 0,
    }));

    const result = await supportCasesApi.createTechnicianReport(payload);

    expect(apiClientMock.post).toHaveBeenCalledWith('/support/cases/technician-report', payload);
    expect(result).toMatchObject({ id: 'case-1', status: 'open', responsibility: 'pending' });
  });

  it('sends an idempotent versioned responsibility decision and returns the server decision', async () => {
    const payload = {
      commandId: 'e1b8910e-0472-4e1f-a682-b94d4f8594ac',
      workflowVersion: 0,
      decision: 'technician_fault' as const,
      reason: 'Đối chiếu ảnh cho thấy thao tác khoan không đúng quy trình.',
      evidenceRefs: ['media-2'],
    };
    apiClientMock.post.mockResolvedValueOnce(envelope({
      ...sampleCase,
      caseType: 'technician_replacement',
      reasonClass: 'technician_skill_gap',
      reasonCode: 'skill_gap',
      responsibility: 'technician_fault',
      responsibilityReason: payload.reason,
      workflowVersion: 1,
    }));

    const result = await supportCasesApi.decideTechnicianResponsibility('case-1', payload);

    expect(apiClientMock.post).toHaveBeenCalledWith('/support/cases/case-1/responsibility', payload);
    expect(result).toMatchObject({ responsibility: 'technician_fault', workflowVersion: 1 });
  });

  it('reads authoritative interruption options for the selected support case', async () => {
    apiClientMock.get.mockResolvedValueOnce(envelope({
      caseId: 'case-1', caseStatus: 'open', caseVersion: 2, serviceOrderId: 'order-1', visitGroupId: null,
      requestIntent: 'stop_or_replace',
      flags: { approvedQuote: false, invoice: false, payment: false, voucher: false, parts: false, incompleteSiblings: false },
      actions: {
        DIRECT_REASSIGN_SOLO: { allowed: true, reasons: [] },
        CLOSE_FOR_REBOOK: { allowed: true, reasons: [] },
        REJECT_REQUEST: { allowed: true, reasons: [] },
      },
    }));

    const options = await supportCasesApi.replacementOptions('case-1');

    expect(apiClientMock.get).toHaveBeenCalledWith('/support/cases/case-1/replacement-options');
    expect(options.actions.DIRECT_REASSIGN_SOLO.allowed).toBe(true);
    expect(options.flags.parts).toBe(false);
  });

  it('sends one versioned interruption command and returns the real order result', async () => {
    const command = {
      commandId: 'aa648542-bf1e-41e6-a717-b8b593f8955c', expectedCaseVersion: 2,
      action: 'REJECT_REQUEST' as const, reason: 'Đã trao đổi với khách và giữ nguyên phương án sửa.',
    };
    apiClientMock.post.mockResolvedValueOnce(envelope({
      case: { ...sampleCase, status: 'rejected', requestIntent: 'stop_or_replace', workflowVersion: 3 },
      order: { id: 'order-1', status: 'UNDER_REPAIR' }, nextAction: 'none',
    }));

    const result = await supportCasesApi.resolveInterruption('case-1', command);

    expect(apiClientMock.post).toHaveBeenCalledWith('/support/cases/case-1/resolve-interruption', command);
    expect(result.order).toEqual({ id: 'order-1', status: 'UNDER_REPAIR' });
    expect(result.case.status).toBe('rejected');
  });

  it('fails closed for an invalid envelope instead of accepting data', async () => {
    apiClientMock.get.mockResolvedValueOnce({ data: { data: [sampleCase] } });

    await expect(supportCasesApi.listCases()).rejects.toThrow(
      'Backend returned an invalid support case list response.',
    );
  });

  it('does not silently return mock data when Backend is unavailable', async () => {
    apiClientMock.get.mockRejectedValueOnce(new Error('network unavailable'));

    await expect(supportCasesApi.listCases()).rejects.toThrow('network unavailable');
  });
});
