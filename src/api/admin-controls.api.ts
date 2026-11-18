// BUG 175–177: admin controls over service manager permissions and notifications.
import apiClient from './client';

export interface SmPermission {
  code: string;
  group: string;
  label: string;
  granted: boolean;
}

export interface SentBroadcast {
  key: string;
  title: string;
  message: string;
  sentAt: string;
  recipients: number;
  read: number;
}

export type BroadcastAudience = 'all' | 'customer' | 'technician' | 'service_manager';

function payload(body: unknown): unknown {
  if (body && typeof body === 'object' && 'data' in (body as Record<string, unknown>)) {
    return (body as Record<string, unknown>).data;
  }
  return body;
}

function toPermissions(body: unknown): SmPermission[] {
  const data = payload(body);
  if (!Array.isArray(data)) throw new Error('Backend returned an invalid permission list.');
  return data.map((row) => {
    const r = row as Record<string, unknown>;
    return { code: String(r.code), group: String(r.group ?? ''), label: String(r.label ?? r.code), granted: r.granted === true };
  });
}

export const adminControlsApi = {
  async listSmPermissions(): Promise<SmPermission[]> {
    const res = await apiClient.get<unknown>('/admin/rbac/service-manager/permissions');
    return toPermissions(res.data);
  },
  async setSmPermission(code: string, granted: boolean): Promise<SmPermission[]> {
    const res = await apiClient.put<unknown>(`/admin/rbac/service-manager/permissions/${encodeURIComponent(code)}`, { granted });
    return toPermissions(res.data);
  },
  async broadcast(input: { title: string; message: string; audience: BroadcastAudience }): Promise<number> {
    const res = await apiClient.post<unknown>('/notifications/broadcast', input);
    const data = payload(res.data) as Record<string, unknown> | null;
    return Number(data?.recipients ?? 0);
  },
  async listBroadcasts(): Promise<SentBroadcast[]> {
    const res = await apiClient.get<unknown>('/notifications/broadcasts');
    const data = payload(res.data);
    if (!Array.isArray(data)) throw new Error('Backend returned an invalid broadcast list.');
    return data.map((row) => {
      const r = row as Record<string, unknown>;
      return { key: String(r.key), title: String(r.title ?? ''), message: String(r.message ?? ''), sentAt: String(r.sentAt ?? ''), recipients: Number(r.recipients ?? 0), read: Number(r.read ?? 0) };
    });
  },
  async recallBroadcast(key: string): Promise<number> {
    const res = await apiClient.delete<unknown>(`/notifications/broadcasts/${encodeURIComponent(key)}`);
    const data = payload(res.data) as Record<string, unknown> | null;
    return Number(data?.recalled ?? 0);
  },
  async notifyUser(input: { userId: string; title: string; message: string }): Promise<void> {
    await apiClient.post('/notifications', { ...input, type: 'ADMIN_MESSAGE' });
  },
};
