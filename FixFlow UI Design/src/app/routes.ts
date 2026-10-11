/**
 * Hash-based routing (§2).
 *
 * The app previously used `history.pushState` with real paths like
 * `/admin/dashboard`. Those 404 on reload unless the host rewrites every
 * unknown path to index.html, which a static deploy does not do. A hash route
 * never reaches the server, so reload, bookmark and shared-link all work with
 * no host configuration — which is why the spec mandates it.
 *
 * These helpers are pure so the parsing can be unit tested; only `readHash`
 * and `writeHash` touch the browser.
 */

export interface RouteTarget {
  role: string
  /** The page label, e.g. "Repair Details". */
  page: string
  /**
   * Optional record identifier, e.g. a job number. Detail pages need it to load
   * one record; collection pages leave it empty. Kept as the last path segment
   * so `#/admin/repair-details/FX-2026-004821` still reloads and shares cleanly.
   */
  param: string
}

/** The route shown when nobody is signed in. */
export const LOGIN_HASH = '#/login'

/** "Repair Details" -> "repair-details" */
export const slugify = (page: string): string => page.trim().toLowerCase().replaceAll(' ', '-')

/** "repair-details" -> "Repair Details" */
export const deslugify = (slug: string): string =>
  slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')

/** Builds `#/admin/repair-details`, or `.../repair-details/FX-2026-004821`. */
export const buildHash = (role: string, page: string, param = ''): string => {
  const base = `#/${role.toLowerCase()}/${slugify(page)}`
  return param ? `${base}/${encodeURIComponent(param)}` : base
}

/**
 * Parses a hash into a route target.
 *
 * Accepts `#/admin/repair-details`, `#admin/repair-details`, and a bare
 * `#/login`. Returns null for anything it cannot make sense of, so the caller
 * decides the fallback rather than this function guessing.
 */
export const parseHash = (raw: string): RouteTarget | null => {
  if (!raw) return null
  const path = raw.replace(/^#/, '').replace(/^\/+/, '')
  if (!path) return null
  const segments = path.split('/').filter(Boolean)
  if (!segments.length) return null
  if (segments[0] === 'login') return { role: 'login', page: 'Login', param: '' }
  if (segments.length < 2) return null
  const [role, pageSlug, ...rest] = segments
  // Anything after the page slug is the record identifier. Joined back with
  // '/' and decoded so a job number or id survives the round trip.
  const param = rest.length ? decodeURIComponent(rest.join('/')) : ''
  return { role, page: deslugify(pageSlug), param }
}

/** Round-trips a route target through the hash format. */
export const formatRoute = (target: RouteTarget): string =>
  target.role === 'login' ? LOGIN_HASH : buildHash(target.role, target.page, target.param)

/** Reads the current route from the browser. */
export const readHash = (): RouteTarget | null => parseHash(window.location.hash)

/**
 * Writes a route. `replace` avoids adding a history entry, which is what login
 * and logout want so the Back button cannot return to a signed-out route.
 */
export const writeHash = (hash: string, replace = false): void => {
  if (window.location.hash === hash) return
  if (replace) window.history.replaceState(null, '', hash)
  else window.location.hash = hash
}
