"use client";

const CACHE_PREFIX = "vetra-clinic-cache:v1";

function cacheKey(clinicId: string, resource: string) {
  return `${CACHE_PREFIX}:${clinicId}:${resource}`;
}

export function readClinicCache<T>(clinicId: string | null | undefined, resource: string, maxAgeMs = 15 * 60 * 1000): T | null {
  if (typeof window === "undefined" || !clinicId) return null;

  try {
    const raw = window.localStorage.getItem(cacheKey(clinicId, resource));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt?: number; value?: T };
    if (!parsed.savedAt || Date.now() - parsed.savedAt > maxAgeMs) return null;
    return parsed.value ?? null;
  } catch {
    return null;
  }
}

export function writeClinicCache<T>(clinicId: string | null | undefined, resource: string, value: T) {
  if (typeof window === "undefined" || !clinicId) return;

  try {
    window.localStorage.setItem(cacheKey(clinicId, resource), JSON.stringify({ savedAt: Date.now(), value }));
  } catch {
    // Storage can be full or unavailable in restricted browser contexts.
  }
}

export function clearClinicCache(clinicId: string | null | undefined) {
  if (typeof window === "undefined" || !clinicId) return;

  try {
    const prefix = `${CACHE_PREFIX}:${clinicId}:`;
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(prefix)) window.localStorage.removeItem(key);
    }
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}
