// Shared fetch helper used by both the Next.js web app and the Capacitor
// mobile bundle. On the web the app is served from the same origin as its
// API, so a plain relative fetch is enough. The mobile app has no server of
// its own — it's a static bundle running inside a native WebView — so its
// requests need an absolute base URL and must carry credentials across
// origins for the session cookie to work.
//
// `window.__API_BASE__` is set once, at startup, by the mobile entry point
// (see mobile/src.tsx). It's simply undefined on the web, where this
// resolves to "" and every request stays relative.

declare global {
  interface Window {
    __API_BASE__?: string;
  }
}

export function apiBase(): string {
  if (typeof window !== "undefined" && window.__API_BASE__) return window.__API_BASE__;
  return "";
}

export function apiUrl(path: string): string {
  return `${apiBase()}${path}`;
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(apiUrl(path), {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
}
