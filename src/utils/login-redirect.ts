import type { Router } from 'vue-router';

/**
 * BUG DETECTOR 67: after signing in, the page followed ?redirect= blindly. A redirect
 * left by another account's expired session (a technician page, say) sent a customer
 * straight to "Không có quyền truy cập"; going home then worked. Follow it only when it
 * is a page of this site that the signed-in role may open; otherwise go to the role's home.
 */
export function usableLoginRedirect(router: Pick<Router, 'resolve'>, redirect: unknown, role: string | null | undefined): string | null {
  if (typeof redirect !== 'string' || !redirect.startsWith('/') || redirect.startsWith('//') || redirect.startsWith('/\\')) return null;
  let target;
  try { target = router.resolve(redirect); } catch { return null; }
  if (!target.matched.length || target.name === 'not-found' || target.meta.guestOnly) return null;
  const roles = target.meta.roles;
  if (Array.isArray(roles) && roles.length && !roles.includes((role ?? '').toUpperCase())) return null;
  return target.fullPath;
}
