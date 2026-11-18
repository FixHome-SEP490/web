/**
 * Routes used by customers and technicians, as opposed to the Console and the
 * public site. These get the mobile-matched look (`.fh-app` in theme.css).
 */
export function isAppSurface(path: string): boolean {
  return /^\/(app|tech)(\/|$)/.test(path);
}

/**
 * Operations & admin Console routes receive crisp cool-slate surfaces (`.fh-console`).
 */
export function isConsoleSurface(path: string): boolean {
  return /^\/console(\/|$)/.test(path);
}
