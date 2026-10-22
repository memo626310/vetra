const REMEMBER_ME_KEY = "vetra-clinic-remember-me";

function usesPersistentStorage() {
  return typeof window === "undefined" || window.localStorage.getItem(REMEMBER_ME_KEY) !== "false";
}

export function setClinicRememberMePreference(remember: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(REMEMBER_ME_KEY, String(remember));
}

export const clinicAuthStorage = {
  getItem(key: string) {
    if (typeof window === "undefined") return null;

    const primary = usesPersistentStorage() ? window.localStorage : window.sessionStorage;
    const secondary = usesPersistentStorage() ? window.sessionStorage : window.localStorage;
    const value = primary.getItem(key);
    if (value !== null) return value;

    const previousValue = secondary.getItem(key);
    if (previousValue !== null) {
      primary.setItem(key, previousValue);
      secondary.removeItem(key);
    }
    return previousValue;
  },
  setItem(key: string, value: string) {
    if (typeof window === "undefined") return;

    const primary = usesPersistentStorage() ? window.localStorage : window.sessionStorage;
    const secondary = usesPersistentStorage() ? window.sessionStorage : window.localStorage;
    primary.setItem(key, value);
    secondary.removeItem(key);
  },
  removeItem(key: string) {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  },
};
