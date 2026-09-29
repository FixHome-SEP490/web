import { describe, it, expect } from 'vitest';
import {
  formatCurrencyVND,
  formatDateTimeVN,
  formatDateVN,
  formatWalletTxType,
  formatWithdrawalStatus,
} from '../src/utils/formatters';

describe('Wallet Formatters & Logic (Design System Conformance)', () => {
  describe('formatCurrencyVND', () => {
    it('should format positive amounts with dots and ₫ symbol', () => {
      expect(formatCurrencyVND(1250000)).toBe('1.250.000 ₫');
      expect(formatCurrencyVND(200000)).toBe('200.000 ₫');
      expect(formatCurrencyVND(50000)).toBe('50.000 ₫');
    });

    it('should format zero correctly', () => {
      expect(formatCurrencyVND(0)).toBe('0 ₫');
    });

    it('should format negative amounts with leading minus sign', () => {
      expect(formatCurrencyVND(-50000)).toBe('-50.000 ₫');
      expect(formatCurrencyVND(-150000)).toBe('-150.000 ₫');
    });

    it('should handle null/undefined safely', () => {
      expect(formatCurrencyVND(null)).toBe('0 ₫');
      expect(formatCurrencyVND(undefined)).toBe('0 ₫');
    });

    it('should handle bigint safely', () => {
      expect(formatCurrencyVND(500000n)).toBe('500.000 ₫');
      expect(formatCurrencyVND(-200000n)).toBe('-200.000 ₫');
    });
  });

  describe('formatDateTimeVN', () => {
    it('should format date string in HH:mm, dd/MM/yyyy format in Asia/Ho_Chi_Minh timezone', () => {
      const date = new Date('2026-09-27T10:30:00Z');
      const formatted = formatDateTimeVN(date);
      // UTC 10:30 + 7h = 17:30
      expect(formatted).toContain('17:30');
      expect(formatted).toContain('27/09/2026');
    });

    it('should return — for null or invalid date', () => {
      expect(formatDateTimeVN(null)).toBe('—');
      expect(formatDateTimeVN('invalid')).toBe('—');
    });
  });

  describe('formatDateVN', () => {
    it('should format date in dd/MM/yyyy', () => {
      const date = new Date('2026-09-27T10:30:00Z');
      expect(formatDateVN(date)).toBe('27/09/2026');
    });
  });

  describe('formatWalletTxType', () => {
    it('should correctly classify credit transactions', () => {
      expect(formatWalletTxType('TOP_UP')).toEqual({
        label: 'Nạp tiền vào ví',
        isCredit: true,
      });
      expect(formatWalletTxType('ONLINE_EARNING')).toEqual({
        label: 'Thu nhập ròng (Đơn online)',
        isCredit: true,
      });
    });

    it('should correctly classify debit transactions', () => {
      expect(formatWalletTxType('PLATFORM_FEE')).toEqual({
        label: 'Khấu trừ phí nền tảng (Đơn tiền mặt)',
        isCredit: false,
      });
      expect(formatWalletTxType('WITHDRAW')).toEqual({
        label: 'Rút tiền về ngân hàng',
        isCredit: false,
      });
    });
  });

  describe('formatWithdrawalStatus', () => {
    it('should return pure Vietnamese labels and tone colors', () => {
      expect(formatWithdrawalStatus('PENDING')).toEqual({
        label: 'Chờ duyệt',
        color: 'amber',
      });
      expect(formatWithdrawalStatus('SUCCESS')).toEqual({
        label: 'Đã chi tiền',
        color: 'emerald',
      });
      expect(formatWithdrawalStatus('REJECTED')).toEqual({
        label: 'Đã từ chối',
        color: 'rose',
      });
      // Automatic payouts: approved and moving, and a transfer the bank refused.
      expect(formatWithdrawalStatus('PROCESSING')).toEqual({
        label: 'Đang chuyển tiền',
        color: 'blue',
      });
      expect(formatWithdrawalStatus('FAILED')).toEqual({
        label: 'Chuyển thất bại',
        color: 'rose',
      });
    });

    it('shows a refunded payout as money coming back in', () => {
      expect(formatWalletTxType('WITHDRAW_REFUND')).toEqual({
        label: 'Hoàn tiền rút không thành công',
        isCredit: true,
      });
    });
  });
});
