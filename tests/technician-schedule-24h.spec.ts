import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';

/**
 * Weekly schedule in 24-hour time (PO 10/10/2026): "cover theo 24h chứ không
 * nên chia SA CH, cứ select giờ auto bật". Times are a 30-minute select, the
 * end of day shows "24:00" and is stored as "23:59", an off-grid stored value
 * is kept, and picking a time on a day off switches that day on.
 */

const { technicianProfileApi, profileApi, technicianVerificationApi, catalogApi, reviewsApi } = vi.hoisted(() => ({
  technicianProfileApi: {
    getMyProfile: vi.fn(),
    getMyServices: vi.fn(),
    getMyTimeOff: vi.fn(),
    updateMyProfile: vi.fn(),
    setSkillPricing: vi.fn(),
    updateMySchedule: vi.fn(),
    setDefaultLaborWarranty: vi.fn(),
  },
  profileApi: { getAddresses: vi.fn(), updateMe: vi.fn() },
  technicianVerificationApi: { getMyVerification: vi.fn() },
  catalogApi: { getServices: vi.fn(), getCategories: vi.fn() },
  reviewsApi: { getByTechnician: vi.fn() },
}));

vi.mock('../src/api/technician-profile.api', () => ({ technicianProfileApi }));
vi.mock('../src/api/profile.api', () => ({ profileApi }));
vi.mock('../src/api/geo.api', () => ({ geoApi: { autocomplete: vi.fn(), reverse: vi.fn() } }));
vi.mock('../src/api/technician-verification.api', () => ({ technicianVerificationApi }));
vi.mock('../src/api/catalog.api', () => ({ catalogApi }));
vi.mock('../src/api/reviews.api', () => ({ reviewsApi }));
vi.mock('../src/stores/auth', () => ({
  useAuthStore: () => ({
    user: { id: 'u-1', fullName: 'Phạm Đức Toàn', email: 'tech@example.test', phoneNumber: '0900000000', avatarUrl: '' },
    token: 't',
    setAuth: vi.fn(),
    fetchProfile: vi.fn(),
  }),
}));
vi.mock('../src/components/account/ChangePasswordCard.vue', () => ({ default: { template: '<div />' } }));
vi.mock('../src/components/account/ReputationCard.vue', () => ({ default: { template: '<div />' } }));

import TechnicianProfilePage from '../src/pages/technician/TechnicianProfilePage.vue';

// Monday works the whole day to midnight, Tuesday has an off-grid window.
const SCHEDULES = [
  { dayOfWeek: 1, startTime: '06:00', endTime: '23:59' },
  { dayOfWeek: 2, startTime: '08:15', endTime: '17:45' },
];

const PROFILE = {
  bio: 'Sửa điều hoà và tủ lạnh tại nhà.',
  yearsExperience: 4,
  skills: [],
  schedules: SCHEDULES,
  serviceRadiusKm: 10,
  isAvailable: true,
  averageRating: 5,
  ratingCount: 2,
  reliabilityScore: 100,
};

const stubs = {
  FhButton: {
    props: ['disabled', 'loading', 'variant', 'size', 'block'],
    emits: ['click'],
    template: '<button :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>',
  },
  FhConfirmDialog: true,
  FhSkeleton: { template: '<div data-testid="skeleton" />' },
  MapTilerMap: true,
  'router-link': { props: ['to'], template: '<a :href="to"><slot /></a>' },
};

async function openSchedule(): Promise<VueWrapper> {
  const wrapper = mount(TechnicianProfilePage, { global: { stubs } });
  await flushPromises();
  await wrapper.findAll('[role="tab"]').find((t) => t.text().includes('Lịch làm việc'))!.trigger('click');
  return wrapper;
}

const timeSelect = (wrapper: VueWrapper, which: 'bắt đầu' | 'kết thúc', day: string) =>
  wrapper.get(`select[aria-label="Giờ ${which} ${day}"]`);

const selectedLabel = (wrapper: VueWrapper, which: 'bắt đầu' | 'kết thúc', day: string) => {
  const el = timeSelect(wrapper, which, day).element as HTMLSelectElement;
  return el.options[el.selectedIndex]?.text;
};

const dayToggle = (wrapper: VueWrapper, day: string) =>
  wrapper.get(`input[type="checkbox"][aria-label="Làm việc ${day}"]`).element as HTMLInputElement;

const saveButton = (wrapper: VueWrapper) =>
  wrapper.findAll('button').find((b) => b.text().trim() === 'Lưu lịch làm việc')!;

describe('Lịch làm việc hằng tuần theo 24 giờ', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    technicianProfileApi.getMyProfile.mockResolvedValue({ ...PROFILE, schedules: SCHEDULES.map((s) => ({ ...s })) });
    technicianProfileApi.getMyServices.mockResolvedValue([]);
    technicianProfileApi.getMyTimeOff.mockResolvedValue([]);
    technicianProfileApi.updateMySchedule.mockResolvedValue([]);
    profileApi.getAddresses.mockResolvedValue([]);
    technicianVerificationApi.getMyVerification.mockResolvedValue({ status: 'VERIFIED', rejectionReason: null, documents: [] });
    catalogApi.getServices.mockResolvedValue({ data: [] });
    catalogApi.getCategories.mockResolvedValue([]);
    reviewsApi.getByTechnician.mockResolvedValue({ data: [], total: 0 });
  });

  it('offers 24-hour times in 30-minute steps, never SA/CH or a native time input', async () => {
    const wrapper = await openSchedule();

    expect(wrapper.findAll('input[type="time"]')).toHaveLength(0);

    const start = timeSelect(wrapper, 'bắt đầu', 'Thứ Tư').findAll('option').map((o) => o.text());
    expect(start).toHaveLength(48);
    expect(start[0]).toBe('00:00');
    expect(start).toContain('13:30');
    expect(start[47]).toBe('23:30');
    expect(start).not.toContain('24:00');

    const endOptions = timeSelect(wrapper, 'kết thúc', 'Thứ Tư').findAll('option');
    const end = endOptions.map((o) => o.text());
    expect(end).toHaveLength(48);
    expect(end[0]).toBe('00:30');
    expect(end).not.toContain('00:00');
    expect(end[47]).toBe('24:00');
    expect((endOptions[47].element as HTMLOptionElement).value).toBe('23:59');

    for (const label of [...start, ...end]) expect(label).toMatch(/^([01]\d|2[0-4]):[0-5]\d$/);
    const scheduleText = wrapper.get('ul.divide-y').text();
    expect(scheduleText).not.toMatch(/\b(SA|CH|AM|PM)\b/);
  });

  it('shows a stored "23:59" as "24:00"', async () => {
    const wrapper = await openSchedule();

    expect(selectedLabel(wrapper, 'bắt đầu', 'Thứ Hai')).toBe('06:00');
    expect(selectedLabel(wrapper, 'kết thúc', 'Thứ Hai')).toBe('24:00');
    expect(wrapper.text()).not.toContain('23:59');
  });

  it('keeps a stored time that is off the 30-minute grid', async () => {
    const wrapper = await openSchedule();

    expect(selectedLabel(wrapper, 'bắt đầu', 'Thứ Ba')).toBe('08:15');
    expect(selectedLabel(wrapper, 'kết thúc', 'Thứ Ba')).toBe('17:45');
    const start = timeSelect(wrapper, 'bắt đầu', 'Thứ Ba').findAll('option').map((o) => o.text());
    expect(start).toHaveLength(49);
    expect(start.indexOf('08:15')).toBe(start.indexOf('08:00') + 1);
  });

  it('picking a time on a day off switches it on, and "24:00" is saved as "23:59"', async () => {
    const wrapper = await openSchedule();

    expect(dayToggle(wrapper, 'Thứ Tư').checked).toBe(false);
    await timeSelect(wrapper, 'bắt đầu', 'Thứ Tư').setValue('13:30');
    expect(dayToggle(wrapper, 'Thứ Tư').checked).toBe(true);

    expect(dayToggle(wrapper, 'Thứ Năm').checked).toBe(false);
    await timeSelect(wrapper, 'kết thúc', 'Thứ Năm').setValue('23:59');
    expect(dayToggle(wrapper, 'Thứ Năm').checked).toBe(true);
    expect(selectedLabel(wrapper, 'kết thúc', 'Thứ Năm')).toBe('24:00');

    await saveButton(wrapper).trigger('click');
    await flushPromises();

    expect(technicianProfileApi.updateMySchedule).toHaveBeenCalledTimes(1);
    expect(technicianProfileApi.updateMySchedule).toHaveBeenCalledWith([
      { dayOfWeek: 1, startTime: '06:00', endTime: '23:59' },
      { dayOfWeek: 2, startTime: '08:15', endTime: '17:45' },
      { dayOfWeek: 3, startTime: '13:30', endTime: '18:00' },
      { dayOfWeek: 4, startTime: '08:00', endTime: '23:59' },
    ]);
    expect(wrapper.text()).toContain('Đã lưu lịch làm việc.');
  });

  it('the day switch still turns a day off', async () => {
    const wrapper = await openSchedule();

    await wrapper.get('input[type="checkbox"][aria-label="Làm việc Thứ Ba"]').setValue(false);
    await saveButton(wrapper).trigger('click');
    await flushPromises();

    expect(technicianProfileApi.updateMySchedule).toHaveBeenCalledWith([
      { dayOfWeek: 1, startTime: '06:00', endTime: '23:59' },
    ]);
  });

  it('the quick buttons copy Monday, including "24:00"', async () => {
    const wrapper = await openSchedule();

    await wrapper.findAll('button').find((b) => b.text().trim() === 'Cả tuần')!.trigger('click');
    for (const day of ['Chủ Nhật', 'Thứ Ba', 'Thứ Bảy']) {
      expect(dayToggle(wrapper, day).checked).toBe(true);
      expect(selectedLabel(wrapper, 'bắt đầu', day)).toBe('06:00');
      expect(selectedLabel(wrapper, 'kết thúc', day)).toBe('24:00');
    }

    await saveButton(wrapper).trigger('click');
    await flushPromises();
    const sent = technicianProfileApi.updateMySchedule.mock.calls[0][0] as Array<{ endTime: string }>;
    expect(sent).toHaveLength(7);
    expect(sent.every((s) => s.endTime === '23:59')).toBe(true);
  });

  it('an end before the start is caught before saving, in plain words', async () => {
    const wrapper = await openSchedule();

    await timeSelect(wrapper, 'bắt đầu', 'Thứ Tư').setValue('18:00');
    await timeSelect(wrapper, 'kết thúc', 'Thứ Tư').setValue('09:00');
    await saveButton(wrapper).trigger('click');
    await flushPromises();

    expect(technicianProfileApi.updateMySchedule).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Thứ Tư: giờ kết thúc phải sau giờ bắt đầu.');
  });
});
