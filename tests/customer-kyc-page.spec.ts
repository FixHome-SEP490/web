// Customer identity check (PO 14/10/2026): both sides of the CCCD as photos and
// the details as printed on the card, checked in the form before anything is
// uploaded; then upload-url, PUT, upload-url, PUT and one submit.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';

const api = vi.hoisted(() => ({
  getMine: vi.fn(),
  requestUploadUrl: vi.fn(),
  uploadToSignedUrl: vi.fn(),
  submit: vi.fn(),
  order: [] as string[],
}));
vi.mock('../src/api/customer-verification.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api/customer-verification.api')>()),
  customerVerificationApi: {
    getMine: api.getMine,
    requestUploadUrl: api.requestUploadUrl,
    uploadToSignedUrl: api.uploadToSignedUrl,
    submit: api.submit,
  },
}));

import CustomerKycPage from '../src/pages/customer/CustomerKycPage.vue';
import { validateAddressText, validateBirthDate, validateCitizenId } from '../src/utils/input-validation';
import { toBankAccountName } from '../src/utils/formatters';

const stubs = { 'router-link': { props: ['to'], template: '<a :href="to"><slot /></a>' } };

const emptyProfile = { fullName: 'Nguyễn Văn An', dateOfBirth: null, gender: null, citizenIdNumber: null, address: null };
const submitted = {
  id: 'v1',
  customerId: 'c1',
  status: 'pending',
  fullName: 'Nguyễn Văn An',
  dateOfBirth: '1990-05-20',
  gender: 'male',
  citizenIdNumber: '079090000001',
  address: '12 Lê Lợi, Phường Bến Nghé, TP. Hồ Chí Minh',
  submittedAt: '2026-10-14T09:00:00Z',
  reviewedAt: null,
  rejectionReason: null,
  verifiedFullName: null,
  documents: [],
};

async function mountPage(): Promise<VueWrapper> {
  const w = mount(CustomerKycPage, { global: { stubs } });
  await flushPromises();
  return w;
}

function image(name: string, type = 'image/jpeg', size = 200_000): File {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

async function pick(w: VueWrapper, side: 'front' | 'back', file: File) {
  const input = w.get(`[data-testid="kyc-${side}-input"]`);
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true });
  await input.trigger('change');
}

async function fillValid(w: VueWrapper) {
  await w.get('[data-testid="kyc-fullname"]').setValue('Nguyễn Văn An');
  await w.get('[data-testid="kyc-dob"]').setValue('1990-05-20');
  await w.get('[data-testid="kyc-gender"]').setValue('male');
  await w.get('[data-testid="kyc-cccd"]').setValue('079090000001');
  await w.get('[data-testid="kyc-address"]').setValue('12 Lê Lợi, Phường Bến Nghé, TP. Hồ Chí Minh');
  await pick(w, 'front', image('front.jpg'));
  await pick(w, 'back', image('back.png', 'image/png'));
}

beforeEach(() => {
  vi.clearAllMocks();
  api.order.length = 0;
  api.getMine.mockResolvedValue({ status: 'none', rejectionReason: null, verification: null, profile: emptyProfile });
  let n = 0;
  api.requestUploadUrl.mockImplementation(async (mime: string) => {
    n += 1;
    api.order.push(`upload-url:${mime}`);
    return { storageObjectPath: `kyc/c1/${n}.img`, uploadUrl: `https://storage.example/${n}` };
  });
  api.uploadToSignedUrl.mockImplementation(async (url: string) => {
    api.order.push(`put:${url}`);
  });
  api.submit.mockImplementation(async () => {
    api.order.push('submit');
    return { status: 'pending', rejectionReason: null, verification: submitted, profile: emptyProfile };
  });
});

describe('Customer identity check: form', () => {
  it('prefills from the profile and shows the note about what cannot change later', async () => {
    const w = await mountPage();
    expect((w.get('[data-testid="kyc-fullname"]').element as HTMLInputElement).value).toBe('Nguyễn Văn An');
    expect(w.get('[data-testid="kyc-form"]').text()).toContain('họ tên và ngày sinh không đổi được nữa');
    expect(w.findAll('input[type="file"]')).toHaveLength(2);
    expect(w.text()).not.toMatch(/khuôn mặt|video/i);
  });

  it.each([
    ['kyc-fullname', '😀 An', 'fullName', 'chỉ gồm chữ cái'],
    ['kyc-cccd', '07909000000', 'citizenIdNumber', 'đúng 12 chữ số'],
    ['kyc-cccd', '07909000000a', 'citizenIdNumber', 'đúng 12 chữ số'],
    ['kyc-address', '<b>12</b> Lê Lợi', 'address', 'Địa chỉ chỉ gồm'],
    ['kyc-address', 'abc', 'address', 'tối thiểu 5'],
  ])('refuses %s = %j before uploading anything', async (field, value, key, reason) => {
    const w = await mountPage();
    await fillValid(w);
    await w.get(`[data-testid="${field}"]`).setValue(value);
    await w.get('[data-testid="kyc-form"]').trigger('submit');
    await flushPromises();
    expect(w.get(`[data-testid="kyc-error-${key}"]`).text()).toContain(reason);
    expect(api.requestUploadUrl).not.toHaveBeenCalled();
    expect(api.submit).not.toHaveBeenCalled();
  });

  it('refuses someone under 18 and a birth date in the future', async () => {
    const w = await mountPage();
    await fillValid(w);
    const now = new Date();
    const underAge = `${now.getFullYear() - 17}-01-01`;
    await w.get('[data-testid="kyc-dob"]').setValue(underAge);
    await w.get('[data-testid="kyc-form"]').trigger('submit');
    await flushPromises();
    expect(w.get('[data-testid="kyc-error-dateOfBirth"]').text()).toContain('đủ 18 tuổi');
    await w.get('[data-testid="kyc-dob"]').setValue(`${now.getFullYear() + 1}-01-01`);
    await w.get('[data-testid="kyc-form"]').trigger('submit');
    await flushPromises();
    expect(w.get('[data-testid="kyc-error-dateOfBirth"]').text()).toContain('tương lai');
    expect(api.requestUploadUrl).not.toHaveBeenCalled();
  });

  it('refuses a file that is not an image and an image over 10 MB', async () => {
    const w = await mountPage();
    await pick(w, 'front', image('cccd.pdf', 'application/pdf'));
    expect(w.get('[data-testid="kyc-error-front"]').text()).toContain('JPG, PNG hoặc WebP');
    await pick(w, 'back', image('big.jpg', 'image/jpeg', 11 * 1024 * 1024));
    expect(w.get('[data-testid="kyc-error-back"]').text()).toContain('10 MB');
    await w.get('[data-testid="kyc-form"]').trigger('submit');
    await flushPromises();
    expect(api.requestUploadUrl).not.toHaveBeenCalled();
  });

  it('needs both sides of the card', async () => {
    const w = await mountPage();
    await w.get('[data-testid="kyc-dob"]').setValue('1990-05-20');
    await w.get('[data-testid="kyc-gender"]').setValue('male');
    await w.get('[data-testid="kyc-cccd"]').setValue('079090000001');
    await w.get('[data-testid="kyc-address"]').setValue('12 Lê Lợi, Quận 1');
    await w.get('[data-testid="kyc-form"]').trigger('submit');
    await flushPromises();
    expect(w.get('[data-testid="kyc-error-front"]').text()).toContain('mặt trước');
    expect(w.get('[data-testid="kyc-error-back"]').text()).toContain('mặt sau');
    expect(api.requestUploadUrl).not.toHaveBeenCalled();
  });

  it('uploads front then back, then submits once, and shows the pending note', async () => {
    const w = await mountPage();
    await fillValid(w);
    await w.get('[data-testid="kyc-form"]').trigger('submit');
    await flushPromises();
    expect(api.order).toEqual([
      'upload-url:image/jpeg',
      'put:https://storage.example/1',
      'upload-url:image/png',
      'put:https://storage.example/2',
      'submit',
    ]);
    expect(api.submit).toHaveBeenCalledWith({
      fullName: 'Nguyễn Văn An',
      dateOfBirth: '1990-05-20',
      gender: 'male',
      citizenIdNumber: '079090000001',
      address: '12 Lê Lợi, Phường Bến Nghé, TP. Hồ Chí Minh',
      documents: [
        { documentType: 'citizen_id_front', storageObjectPath: 'kyc/c1/1.img', fileName: 'cccd-mat-truoc.jpg', fileSize: 200000, mimeType: 'image/jpeg' },
        { documentType: 'citizen_id_back', storageObjectPath: 'kyc/c1/2.img', fileName: 'cccd-mat-sau.png', fileSize: 200000, mimeType: 'image/png' },
      ],
    });
    expect(w.get('[data-testid="kyc-pending"]').text()).toContain('đang chờ duyệt');
    expect(w.find('[data-testid="kyc-form"]').exists()).toBe(false);
  });

  it('keeps the form with a readable sentence when the upload fails', async () => {
    api.uploadToSignedUrl.mockRejectedValueOnce(new Error('Failed to fetch'));
    const w = await mountPage();
    await fillValid(w);
    await w.get('[data-testid="kyc-form"]').trigger('submit');
    await flushPromises();
    expect(api.submit).not.toHaveBeenCalled();
    expect(w.get('[data-testid="kyc-submit-error"]').text()).toContain('Chưa gửi được hồ sơ xác minh');
    expect(w.find('[data-testid="kyc-form"]').exists()).toBe(true);
  });
});

describe('Customer identity check: status', () => {
  it('pending: a yellow note and no form', async () => {
    api.getMine.mockResolvedValue({ status: 'pending', rejectionReason: null, verification: submitted, profile: emptyProfile });
    const w = await mountPage();
    expect(w.get('[data-testid="kyc-pending"]').text()).toContain('Hồ sơ xác minh đang chờ duyệt');
    expect(w.find('[data-testid="kyc-form"]').exists()).toBe(false);
  });

  it('rejected: the reason in red and the form to send again, prefilled', async () => {
    api.getMine.mockResolvedValue({
      status: 'rejected',
      rejectionReason: 'Ảnh mặt trước bị loá, vui lòng chụp lại.',
      verification: { ...submitted, status: 'rejected', rejectionReason: 'Ảnh mặt trước bị loá, vui lòng chụp lại.' },
      profile: { ...emptyProfile, dateOfBirth: '1990-05-20', gender: 'male', citizenIdNumber: '079090000001', address: submitted.address },
    });
    const w = await mountPage();
    const box = w.get('[data-testid="kyc-rejected"]');
    expect(box.text()).toContain('Ảnh mặt trước bị loá');
    expect(box.classes()).toContain('bg-danger-50');
    expect((w.get('[data-testid="kyc-cccd"]').element as HTMLInputElement).value).toBe('079090000001');
    await pick(w, 'front', image('front.jpg'));
    await pick(w, 'back', image('back.jpg'));
    await w.get('[data-testid="kyc-form"]').trigger('submit');
    await flushPromises();
    expect(api.submit).toHaveBeenCalledTimes(1);
  });

  it('verified: never asks again', async () => {
    api.getMine.mockResolvedValue({
      status: 'verified',
      rejectionReason: null,
      verification: { ...submitted, status: 'verified', verifiedFullName: 'Nguyễn Văn An' },
      profile: { ...emptyProfile, dateOfBirth: '1990-05-20' },
    });
    const w = await mountPage();
    expect(w.get('[data-testid="kyc-verified"]').text()).toContain('Đã xác minh danh tính');
    expect(w.get('[data-testid="kyc-verified"]').text()).toContain('20/05/1990');
    expect(w.find('[data-testid="kyc-form"]').exists()).toBe(false);
  });

  it('a failed read offers "Thử lại" without technical text', async () => {
    api.getMine.mockRejectedValueOnce(new Error('Network Error')).mockResolvedValueOnce({ status: 'none', rejectionReason: null, verification: null, profile: emptyProfile });
    const w = await mountPage();
    expect(w.text()).not.toContain('Network Error');
    await w.findAll('button').find((b) => b.text() === 'Thử lại')!.trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="kyc-form"]').exists()).toBe(true);
  });
});

describe('Identity validators', () => {
  it('CCCD is exactly 12 digits', () => {
    expect(validateCitizenId('079090000001')).toBe('');
    expect(validateCitizenId('07909000000')).not.toBe('');
    expect(validateCitizenId('0790900000012')).not.toBe('');
    expect(validateCitizenId('０７９０９０００００01')).not.toBe('');
  });

  it('address allows Vietnamese letters, digits and address punctuation only', () => {
    expect(validateAddressText('Số 12/3 Lê Lợi, P. Bến Nghé, Q.1, TP. Hồ Chí Minh')).toBe('');
    expect(validateAddressText('12 Lê Lợi 🏠')).not.toBe('');
    expect(validateAddressText('A'.repeat(501))).toContain('500');
    expect(validateAddressText('12​Lê Lợi')).toContain('ký tự ẩn');
  });

  it('birth date counts age in Vietnam time', () => {
    const now = new Date('2026-10-14T18:00:00Z'); // 15/10/2026 01:00 in Vietnam
    expect(validateBirthDate('2008-10-15', 18, now)).toBe('');
    expect(validateBirthDate('2008-10-16', 18, now)).toContain('18 tuổi');
    expect(validateBirthDate('2026-02-30', 18, now)).toContain('không hợp lệ');
    expect(validateBirthDate('', 18, now)).toContain('chọn ngày sinh');
  });

  it('bank holder name is the verified name without accents', () => {
    expect(toBankAccountName('  Nguyễn  Văn Đức ')).toBe('NGUYEN VAN DUC');
    expect(toBankAccountName('Trần Thị Thuỷ')).toBe('TRAN THI THUY');
  });
});
