import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import apiClient, { registerAuthSessionInvalidator, registerTokenRefreshed } from '../src/api/client';

const deny = (config: InternalAxiosRequestConfig, status=401) => {
  throw new AxiosError('HTTP failure',undefined,config,undefined,{status,statusText:'Error',data:{},headers:{},config});
};
describe('access token expiry and refresh', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('access_token','expired');
    localStorage.setItem('refresh_token','refresh');
    registerAuthSessionInvalidator(null);
    registerTokenRefreshed(null);
  });
  afterEach(() => vi.restoreAllMocks());
  it('rotates one refresh token for concurrent 401 responses and retries both', async () => {
    const post = vi.spyOn(axios,'post').mockResolvedValue({data:{data:{accessToken:'fresh',refreshToken:'rotated'}}});
    const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => {
      if (config.headers.Authorization !== 'Bearer fresh') return deny(config);
      return {data:{data:'ok'},status:200,statusText:'OK',headers:{},config};
    });
    const result = await Promise.all([apiClient.get('/me',{adapter}),apiClient.get('/me/addresses',{adapter})]);
    expect(result).toHaveLength(2);
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][2]).toEqual({timeout:15000});
    expect(localStorage.getItem('refresh_token')).toBe('rotated');
  });
  it('clears tokens when refresh fails and settles all queued requests', async () => {
    vi.spyOn(axios,'post').mockRejectedValue(new Error('expired refresh'));
    const adapter = async (config: InternalAxiosRequestConfig) => deny(config);
    const outcomes = await Promise.allSettled([apiClient.get('/me',{adapter}),apiClient.get('/me/addresses',{adapter})]);
    expect(outcomes.map(r=>r.status)).toEqual(['rejected','rejected']);
    expect(localStorage.getItem('access_token')).toBeNull();
    expect(localStorage.getItem('refresh_token')).toBeNull();
  });
  it('does not refresh 403 or invalid login credentials', async () => {
    const post = vi.spyOn(axios,'post');
    await expect(apiClient.get('/admin/users',{adapter:async config=>deny(config,403)})).rejects.toBeDefined();
    await expect(apiClient.post('/auth/login',{}, {adapter:async config=>deny(config)})).rejects.toBeDefined();
    expect(post).not.toHaveBeenCalled();
  });
  it('rejects a repeated 401 after refresh without looping', async () => {
    const post = vi.spyOn(axios,'post').mockResolvedValue({data:{data:{accessToken:'fresh',refreshToken:'rotated'}}});
    await expect(apiClient.get('/me',{adapter:async config=>deny(config)})).rejects.toBeDefined();
    expect(post).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('access_token')).toBeNull();
  });
});
