import { describe, expect, it } from 'vitest';
import { AxiosError, AxiosHeaders } from 'axios';
import {
  FORBIDDEN,
  GENERIC_ERROR,
  NETWORK_ERROR,
  SESSION_EXPIRED,
  TIMEOUT_ERROR,
  toUserFacingMessage,
  transportMessage,
  userFacingError,
  withoutCodes,
} from '../src/utils/user-facing-error';

/** An axios error the way the backend's exception filter shapes it. */
function httpError(status: number, data: unknown): AxiosError {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_REQUEST', config, {}, {
    status,
    statusText: '',
    headers: {},
    config,
    data,
  });
}

describe('user-facing errors', () => {
  it('keeps a clear Vietnamese sentence from the server', () => {
    const err = httpError(400, {
      success: false,
      error: { code: 'WITHDRAWAL_TOO_LARGE', message: 'Số tiền rút tối đa hiện tại là 500.000 ₫' },
    });
    expect(userFacingError(err, 'Không thể rút tiền.')).toBe('Số tiền rút tối đa hiện tại là 500.000 ₫');
  });

  it('reads validation details before the generic wording', () => {
    const err = httpError(400, {
      error: { code: 'VALIDATION_FAILED', message: 'Validation failed', details: ['Số điện thoại không hợp lệ'] },
    });
    expect(userFacingError(err, 'Không thể lưu.')).toBe('Số điện thoại không hợp lệ');
  });

  it.each([
    ['Internal server error'],
    ['Validation failed'],
    ['Bad request'],
    ['A record with these identifiers already exists'],
    ['BOOKING_NOT_FOUND'],
    ['Cannot read properties of undefined (reading \'id\')'],
    ['{"statusCode":500}'],
    ['Lỗi hệ thống backend'],
    ['Request failed with status code 500'],
  ])('never shows "%s"', (message) => {
    // A system failure (5xx) never shows the server wording, only the screen sentence (PO 22/11/2026).
    expect(userFacingError(httpError(500, { error: { message } }), 'Không thể tải đơn sửa chữa. Vui lòng thử lại.')).toBe('Không thể tải đơn sửa chữa. Vui lòng thử lại.');
    // The same wording on a 4xx falls back to what the screen says.
    expect(userFacingError(httpError(400, { error: { message } }), 'Không thể tải đơn sửa chữa. Vui lòng thử lại.')).toBe(
      'Không thể tải đơn sửa chữa. Vui lòng thử lại.',
    );
  });

  it('reads every system failure as the one generic sentence', () => {
    expect(GENERIC_ERROR).toBe('Có lỗi xảy ra, vui lòng thử lại sau.');
    for (const status of [500, 502, 503, 504]) {
      expect(userFacingError(httpError(status, { error: { message: 'Hệ thống đang bận' } }))).toBe(GENERIC_ERROR);
      expect(userFacingError(httpError(status, { error: { message: 'Lỗi máy chủ.' } }), 'Không thể lưu.')).toBe('Không thể lưu.');
    }
  });

  it('drops partner and system code prefixes', () => {
    expect(toUserFacingMessage('607: Tài khoản đích không hợp lệ')).toBe('Tài khoản đích không hợp lệ');
    expect(toUserFacingMessage('[PAYOUT_REJECTED] Tài khoản đích không hợp lệ')).toBe('Tài khoản đích không hợp lệ');
    expect(toUserFacingMessage('Không thể gửi yêu cầu (Lỗi 400)')).toBe('Không thể gửi yêu cầu');
  });

  it('removes codes from display text without replacing it', () => {
    expect(withoutCodes('Hoàn tiền rút không thành công - 607: Tài khoản đích không hợp lệ')).toBe(
      'Hoàn tiền rút không thành công - Tài khoản đích không hợp lệ',
    );
    expect(withoutCodes('Rút tiền về MBBank - STK 000000')).toBe('Rút tiền về MBBank - STK 000000');
    expect(withoutCodes(null)).toBe('');
  });

  it('names the shared cases in plain words', () => {
    expect(userFacingError(httpError(401, {}), 'x')).toBe(SESSION_EXPIRED);
    expect(userFacingError(httpError(403, { error: { message: 'Forbidden resource' } }), 'x')).toBe(FORBIDDEN);

    const config = { headers: new AxiosHeaders() };
    const offline = new AxiosError('Network Error', 'ERR_NETWORK', config, {});
    expect(userFacingError(offline, 'x')).toBe(NETWORK_ERROR);
    const slow = new AxiosError('timeout of 15000ms exceeded', 'ECONNABORTED', config, {});
    expect(userFacingError(slow, 'x')).toBe(TIMEOUT_ERROR);
  });

  it('keeps Vietnamese validation thrown by our own code', () => {
    expect(userFacingError(new Error('Khung giờ đã qua. Vui lòng chọn giờ hoặc ngày khác.'), 'x')).toBe(
      'Khung giờ đã qua. Vui lòng chọn giờ hoặc ngày khác.',
    );
    expect(userFacingError(new Error('Invalid refresh response'), 'Không thể tải.')).toBe('Không thể tải.');
    expect(userFacingError(undefined)).toBe(GENERIC_ERROR);
  });

  it('leaves the screen to speak when the request itself says nothing useful', () => {
    // The API client stores this as error.message, so `err.message || fallback` works.
    expect(transportMessage(httpError(500, { error: { message: 'Internal server error' } }))).toBe(GENERIC_ERROR);
    expect(transportMessage(httpError(400, { error: { message: 'Validation failed' } }))).toBe('');
    expect(transportMessage(httpError(400, { error: { message: 'Đơn đã bị huỷ.' } }))).toBe('Đơn đã bị huỷ.');
  });
});
