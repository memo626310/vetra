"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "vetra-hide-sensitive-values";
const CHANGE_EVENT = "vetra-sensitive-display-change";

type SensitiveDisplayPreferences = {
  hideSensitiveValues: boolean;
  loaded: boolean;
  setHideSensitiveValues: (hide: boolean) => void;
};

/** Local display preference only. This is not a substitute for server-side permissions. */
export function useSensitiveDisplay(): SensitiveDisplayPreferences {
  // Treat an unread preference as hidden to avoid briefly flashing sensitive values on screen.
  const [savedValue, setSavedValue] = useState<boolean | null>(null);

  const readPreference = useCallback(() => {
    try {
      setSavedValue(window.localStorage.getItem(STORAGE_KEY) === "true");
    } catch {
      setSavedValue(false);
    }
  }, []);

  useEffect(() => {
    readPreference();
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) readPreference();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(CHANGE_EVENT, readPreference);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(CHANGE_EVENT, readPreference);
    };
  }, [readPreference]);

  const setHideSensitiveValues = useCallback((hide: boolean) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, hide ? "true" : "false");
    } catch {
      // Keep the preference active in the current page even when storage is unavailable.
    }
    setSavedValue(hide);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return {
    hideSensitiveValues: savedValue !== false,
    loaded: savedValue !== null,
    setHideSensitiveValues,
  };
}
