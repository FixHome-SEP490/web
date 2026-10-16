import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiClient } = vi.hoisted(() => ({ apiClient: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../src/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api/client')>()),
  default: apiClient,
}));

import { TOP_UP_NOT_STARTED, walletApi } from '../src/api/wallet.api';

const VNPAY_URL = 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?vnp_Amount=10000000';

describe('walletApi.topUp reads the server envelope', () => {
  beforeEach(() => {
    apiClient.post.mockReset();
  });

  it('opens VNPay when the reply carries a payment link (success sits on the envelope)', async () => {
    // Exactly what the backend sends: success and message lifted beside data.
    apiClient.post.mockResolvedValue({
      data: {
        success: true,
        statusCode: 200,
        message: 'Khởi tạo cổng thanh toán VNPay thành công',
        data: { paymentId: 'pay-1', paymentUrl: VNPAY_URL, balanceAfter: null },
      },
    });
    const result = await walletApi.topUp(100000, 'TOPUP_KEY');
    expect(apiClient.post).toHaveBeenCalledWith('/technician/wallet/top-up', { amount: 100000, idempotencyKey: 'TOPUP_KEY' });
    expect(result).toEqual({ success: true, paymentId: 'pay-1', paymentUrl: VNPAY_URL, message: 'Khởi tạo cổng thanh toán VNPay thành công' });
  });

  it('refuses a reply without a payment link, never crediting instantly', async () => {
    apiClient.post.mockResolvedValue({ data: { success: true, data: { paymentId: 'pay-2', paymentUrl: null, balanceAfter: 110000 } } });
    await expect(walletApi.topUp(100000)).rejects.toThrow(TOP_UP_NOT_STARTED);
  });

  it('refuses a reply the server marks as failed', async () => {
    apiClient.post.mockResolvedValue({ data: { success: false, data: { paymentUrl: VNPAY_URL } } });
    await expect(walletApi.topUp(100000)).rejects.toThrow(TOP_UP_NOT_STARTED);
  });

  it('passes a server refusal through so the screen shows its message', async () => {
    const refusal = new Error('Nạp tiền chưa mở vì cổng thanh toán chưa bật.');
    apiClient.post.mockImplementation(async () => { throw refusal; });
    await expect(walletApi.topUp(100000)).rejects.toBe(refusal);
  });
});
