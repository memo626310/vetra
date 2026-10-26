"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { vetraCore } from "@/lib/vetra-core";
import { type PermissionAction, type StaffPermissions } from "@/lib/staff-permissions";

export function useStaffPermissions() {
  const [permissions, setPermissions] = useState<StaffPermissions | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Use ref to keep permissions up-to-date without causing re-renders
  const permissionsRef = useRef<StaffPermissions | null>(null);
  permissionsRef.current = permissions;

  useEffect(() => {
    let mounted = true;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let requestSequence = 0;

    async function load(attempt = 0) {
      retryTimer = null;
      const sequence = ++requestSequence;
      try {
        const { data } = await vetraCore.auth.getSession();
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

        const response = await fetch("/api/staff/permissions", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const result = await response.json().catch(() => null) as { permissions?: StaffPermissions; error?: string } | null;

        if (mounted && sequence === requestSequence && response.ok && result?.permissions) {
          setPermissions(result.permissions);
          setLoaded(true);
          return;
        }

        // A token issued immediately after sign-in may still be rejected by
        // the API while the session refresh propagates. Refresh once and retry
        // transient auth/server responses before exposing a denial screen.
        if (mounted && sequence === requestSequence && attempt < 3 && [401, 403, 408, 429, 500, 502, 503, 504].includes(response.status)) {
          if (response.status === 401) await vetraCore.auth.refreshSession();
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
        if (mounted && sequence === requestSequence && !retryTimer) {
          setLoaded(true);
        }
      }
    }

    const {
      data: { subscription },
    } = vetraCore.auth.onAuthStateChange((event) => {
      if (["SIGNED_IN", "TOKEN_REFRESHED", "USER_UPDATED"].includes(event)) {
        if (retryTimer) clearTimeout(retryTimer);
        setPermissions(null);
        setLoaded(false);
        void load();
      } else if (event === "SIGNED_OUT") {
        if (retryTimer) clearTimeout(retryTimer);
        setPermissions(null);
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

  // Legacy alias for backwards compatibility
  const hasPermission = can;

  return { permissions, loaded, can, hasPermission };
}
