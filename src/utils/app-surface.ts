/**
 * Routes used by customers and technicians, as opposed to the Console and the
 * public site. These get the mobile-matched look (`.fh-app` in theme.css).
 */
export function isAppSurface(path: string): boolean {
  return /^\/(app|tech)(\/|$)/.test(path);
}
