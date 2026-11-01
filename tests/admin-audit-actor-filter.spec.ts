import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

const { listLogs, getLog } = vi.hoisted(() => ({ listLogs: vi.fn(), getLog: vi.fn() }));
vi.mock('../src/api/admin-audit-logs.api', () => ({ auditLogsApi: { listLogs, getLog } }));

import AdminAuditLogsPage from '../src/pages/console/admin/AdminAuditLogsPage.vue';

// Real id of the seeded Admin on the shared database (version nibble 0, bug 31).
const SEED_ADMIN = 'a0000000-0000-0000-0000-000000000001';

const empty = { data: [], meta: { page: 1, limit: 10, total: 0, totalPages: 0 } };
const actorCalls = () => listLogs.mock.calls.map(([query]) => query.actorUserId);

async function typeSlowly(input: ReturnType<ReturnType<typeof mount>['find']>, text: string) {
  for (let i = 1; i <= text.length; i++) {
    await input.setValue(text.slice(0, i));
    vi.advanceTimersByTime(50);
  }
}

describe('Admin audit log actor filter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    listLogs.mockReset().mockResolvedValue(empty);
    getLog.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it('sends one request for a typed seeded id instead of one per character', async () => {
    const page = mount(AdminAuditLogsPage);
    await flushPromises();
    expect(listLogs).toHaveBeenCalledTimes(1);

    await typeSlowly(page.find('#audit-actor'), SEED_ADMIN);
    expect(listLogs).toHaveBeenCalledTimes(1);
    expect(page.text()).not.toContain('Nhập đủ mã 36 ký tự để lọc.');

    vi.advanceTimersByTime(400);
    await flushPromises();
    expect(listLogs).toHaveBeenCalledTimes(2);
    expect(actorCalls()).toEqual([undefined, SEED_ADMIN]);
    expect(listLogs.mock.calls[1][0]).toMatchObject({ page: 1, actorUserId: SEED_ADMIN });
  });

  it('never sends a partial id and tells the admin to finish typing it', async () => {
    const page = mount(AdminAuditLogsPage);
    await flushPromises();
    const input = page.find('#audit-actor');

    await input.setValue(SEED_ADMIN.slice(0, 20));
    vi.advanceTimersByTime(2000);
    await flushPromises();
    expect(listLogs).toHaveBeenCalledTimes(1);
    expect(page.text()).toContain('Nhập đủ mã 36 ký tự để lọc.');
    expect(input.attributes('aria-invalid')).toBe('true');

    // Other filters and the refresh action also hold the partial id back.
    await page.find('#audit-action').setValue(page.findAll('#audit-action option')[1].element.value);
    await flushPromises();
    expect(listLogs).toHaveBeenCalledTimes(1);

    await input.setValue('');
    vi.advanceTimersByTime(400);
    await flushPromises();
    expect(listLogs).toHaveBeenCalledTimes(2);
    expect(actorCalls()[1]).toBeUndefined();
    expect(page.text()).not.toContain('Nhập đủ mã 36 ký tự để lọc.');
  });

  it('trims spaces around a pasted id and reloads once', async () => {
    const page = mount(AdminAuditLogsPage);
    await flushPromises();
    await page.find('#audit-actor').setValue(`  ${SEED_ADMIN}  `);
    vi.advanceTimersByTime(400);
    await flushPromises();
    expect(actorCalls()).toEqual([undefined, SEED_ADMIN]);
  });
});
