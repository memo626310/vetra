"use client";

import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { vetraCore } from "@/lib/vetra-core";
import { type PermissionAction, type StaffPermissions } from "@/lib/staff-permissions";

type StaffPermissionState = {
  permissions: StaffPermissions | null;
  loaded: boolean;
  can: (key: string, action?: PermissionAction) => boolean;
  hasPermission: (key: string, action?: PermissionAction) => boolean;
};

const StaffPermissionsContext = createContext<StaffPermissionState | null>(null);
const PERMISSIONS_FOCUS_TTL_MS = 60_000;

export function StaffPermissionsProvider({ children }: { children: ReactNode }) {
  const value = useLoadStaffPermissions();
  return createElement(StaffPermissionsContext.Provider, { value }, children);
}

export function useStaffPermissions() {
  const value = useContext(StaffPermissionsContext);
  if (!value) throw new Error("useStaffPermissions requires StaffPermissionsProvider");
  return value;
}

function useLoadStaffPermissions(): StaffPermissionState {
  const [permissions, setPermissions] = useState<StaffPermissions | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Keep can() stable so permission updates do not restart page loading effects.
  const permissionsRef = useRef<StaffPermissions | null>(null);

  useEffect(() => {
    let mounted = true;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let requestSequence = 0;
    let permissionUserId: string | null = null;
    let activeUserId: string | null = null;
    let activeAccessToken: string | null = null;
    let lastVerifiedAt = 0;
    let requestPending = false;

    function updatePermissions(next: StaffPermissions | null) {
      // Update can() before publishing loaded state, including account revocation.
      permissionsRef.current = next;
      setPermissions((current) => JSON.stringify(current) === JSON.stringify(next) ? current : next);
    }

    async function load(attempt = 0) {
      retryTimer = null;
      const sequence = ++requestSequence;
      requestPending = true;
      let granted = false;
      try {
        const { data } = await vetraCore.auth.getSession();
        if (!mounted || sequence !== requestSequence) return;
        const token = data.session?.access_token;
        if (!token) {
          // The auth session can become available a moment after a client-side
          // navigation from the login page. Keep the guard in a loading state
          // instead of treating that short gap as a real permission denial.
          if (mounted && attempt < 8) {
            retryTimer = setTimeout(() => { void load(attempt + 1); }, 250);
            return;
          }
          if (mounted && sequence === requestSequence) setLoaded(true);
          return;
        }
        activeUserId = data.session!.user.id;
        activeAccessToken = token;

        const response = await fetch("/api/staff/permissions", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const result = await response.json().catch(() => null) as { permissions?: StaffPermissions; error?: string } | null;

        if (mounted && sequence === requestSequence && response.ok && result?.permissions) {
          permissionUserId = data.session!.user.id;
          lastVerifiedAt = Date.now();
          granted = true;
          updatePermissions(result.permissions);
          setLoaded(true);
          return;
        }

        // A token issued immediately after sign-in may still be rejected by
        // the API while the session refresh propagates. Refresh once and retry
        // transient auth/server responses before exposing a denial screen.
        if (mounted && sequence === requestSequence && attempt < 3 && [401, 403, 408, 429, 500, 502, 503, 504].includes(response.status)) {
          if (response.status === 401) await vetraCore.auth.refreshSession();
          if (!mounted || sequence !== requestSequence) return;
          retryTimer = setTimeout(() => { void load(attempt + 1); }, 300);
          return;
        }

        if (result?.error) console.error("PERMISSIONS API ERROR:", result.error);
      } catch (error) {
        console.error("Could not load staff permissions:", error);
        if (mounted && sequence === requestSequence && attempt < 3) {
          retryTimer = setTimeout(() => { void load(attempt + 1); }, 300);
          return;
        }
      } finally {
        if (sequence === requestSequence) requestPending = false;
        if (mounted && sequence === requestSequence && !retryTimer) {
          // Failed revalidation must still revoke the previously loaded grant.
          if (!granted) {
            permissionUserId = null;
            updatePermissions(null);
          }
          setLoaded(true);
        }
      }
    }

    const {
      data: { subscription },
    } = vetraCore.auth.onAuthStateChange((event, session) => {
      if (["SIGNED_IN", "TOKEN_REFRESHED", "USER_UPDATED"].includes(event)) {
        // Returning to a tab (or unlocking a phone) emits SIGNED_IN for the
        // existing session. Coalesce those events without hiding the page.
        // Token/user updates and account switches always revalidate.
        const sameUser = Boolean(session && activeUserId === session.user.id);
        const sameLogin = sameUser && activeAccessToken === session?.access_token;
        if (event === "SIGNED_IN" && sameLogin && (
          requestPending || retryTimer || (permissionUserId && Date.now() - lastVerifiedAt < PERMISSIONS_FOCUS_TTL_MS)
        )) return;
        if (retryTimer) clearTimeout(retryTimer);
        // Supabase can emit SIGNED_IN again when the tab regains focus. Keep
        // the current user's page mounted while refreshing their permissions.
        // Account changes still clear all permissions immediately.
        if (!sameUser) {
          activeUserId = session?.user.id ?? null;
          permissionUserId = null;
          lastVerifiedAt = 0;
          updatePermissions(null);
          setLoaded(false);
        }
        void load();
      } else if (event === "SIGNED_OUT") {
        ++requestSequence;
        requestPending = false;
        activeUserId = null;
        activeAccessToken = null;
        permissionUserId = null;
        lastVerifiedAt = 0;
        if (retryTimer) clearTimeout(retryTimer);
        updatePermissions(null);
        setLoaded(false);
      }
    });

    void load();
    return () => {
      mounted = false;
      if (retryTimer) clearTimeout(retryTimer);
      subscription.unsubscribe();
    };
  }, []);

  // Stable function that uses ref - never changes reference
  const can = useCallback((key: string, action: PermissionAction = "view") => {
    return permissionsRef.current?.[key]?.[action] === true;
  }, []);

  return useMemo(() => ({ permissions, loaded, can, hasPermission: can }), [permissions, loaded, can]);
}
