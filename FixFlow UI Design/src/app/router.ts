import { useEffect, useState } from "react";

/**
 * Hash-based routing.
 *
 * The approved demo is a static build with no server to rewrite URLs, so routes
 * live in the hash: `#/repairs/rep-0001`. This keeps deep links, browser back
 * and forward, and reload behaviour all working without server configuration.
 */

export const DEFAULT_PATH = "/dashboard";
export const LOGIN_PATH = "/login";

export function currentPath(): string {
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash || hash === "/") return DEFAULT_PATH;
  return hash.startsWith("/") ? hash : `/${hash}`;
}

export function navigate(path: string): void {
  const next = path.startsWith("/") ? path : `/${path}`;
  if (currentPath() === next) return;
  window.location.hash = next;
}

export function goBack(): void {
  window.history.back();
}

export type Route = {
  /** Full hash path, e.g. "/repairs/rep-0001". */
  path: string;
  /** Path split on "/", e.g. ["repairs", "rep-0001"]. */
  segments: string[];
  /** First segment, e.g. "repairs". */
  section: string;
  /** Second segment when present (a record id or sub-page). */
  id?: string;
};

export function parseRoute(path: string): Route {
  const [pathname] = path.split("?");
  const segments = pathname.split("/").filter(Boolean);
  return { path: pathname, segments, section: segments[0] ?? "", id: segments[1] };
}

export function useRoute(): Route {
  const [path, setPath] = useState(() => currentPath());

  useEffect(() => {
    const onHashChange = () => setPath(currentPath());
    window.addEventListener("hashchange", onHashChange);
    // Normalise an empty hash so the address bar always shows a real route.
    if (!window.location.hash) window.location.replace(`#${DEFAULT_PATH}`);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  return parseRoute(path);
}

/** Builds a route from a section and optional id, e.g. route("repairs", id). */
export function route(section: string, id?: string): string {
  return id ? `/${section}/${id}` : `/${section}`;
}
