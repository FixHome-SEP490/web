import apiClient from './client';

export type ConfigValueType = 'int' | 'bigint' | 'string' | 'enum' | 'boolean';
export type ConfigEffectStatus = 'ACTIVE' | 'TO_WIRE' | 'NOT_IMPLEMENTED' | 'STALE_REVIEW';

export interface AdminConfigItem {
  key: string;
  value: string;
  valueType: ConfigValueType;
  description: string | null;
  updatedByUserId: string | null;
  updatedAt: string;
  effectStatus?: ConfigEffectStatus;
  consumerEvidence?: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeConfig(payload: unknown): AdminConfigItem {
  const config = isRecord(payload) ? payload : {};
  const valueType = String(config.valueType ?? '');
  if (!['int', 'bigint', 'string', 'enum', 'boolean'].includes(valueType)) {
    throw new Error('Backend returned an unsupported config value type.');
  }
  return {
    key: String(config.key ?? ''),
    value: String(config.value ?? ''),
    valueType: valueType as ConfigValueType,
    description: config.description == null ? null : String(config.description),
    updatedByUserId:
      config.updatedByUserId == null ? null : String(config.updatedByUserId),
    updatedAt: String(config.updatedAt ?? ''),
    effectStatus: isConfigEffectStatus(config.effectStatus)
      ? config.effectStatus
      : undefined,
    consumerEvidence:
      config.consumerEvidence == null ? null : String(config.consumerEvidence),
  };
}

function isConfigEffectStatus(value: unknown): value is ConfigEffectStatus {
  return (
    value === 'ACTIVE' ||
    value === 'TO_WIRE' ||
    value === 'NOT_IMPLEMENTED' ||
    value === 'STALE_REVIEW'
  );
}

function unwrapConfigList(payload: unknown): AdminConfigItem[] {
  const outer = isRecord(payload) ? payload : {};
  const candidate = Array.isArray(payload) ? payload : outer.data;
  const dataSource = Array.isArray(candidate)
    ? candidate
    : isRecord(candidate) && Array.isArray(candidate.data)
      ? candidate.data
      : null;
  if (!dataSource) throw new Error('Backend returned an invalid config list response.');
  return dataSource.map(normalizeConfig);
}

function unwrapConfig(payload: unknown): AdminConfigItem {
  const outer = isRecord(payload) ? payload : {};
  return normalizeConfig(outer.data && isRecord(outer.data) ? outer.data : payload);
}

export const adminConfigApi = {
  async getConfigs(search?: string): Promise<AdminConfigItem[]> {
    const response = await apiClient.get<unknown>('/admin/config', {
      params: search ? { search } : undefined,
    });
    return unwrapConfigList(response.data);
  },

  async getConfig(key: string): Promise<AdminConfigItem> {
    const response = await apiClient.get<unknown>(`/admin/config/${encodeURIComponent(key)}`);
    return unwrapConfig(response.data);
  },

  async updateConfig(key: string, value: string): Promise<AdminConfigItem> {
    const response = await apiClient.patch<unknown>(
      `/admin/config/${encodeURIComponent(key)}`,
      { value },
    );
    return unwrapConfig(response.data);
  },
};
