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
    async function load() {
      try {
        const { data } = await vetraCore.auth.getSession();
        const token = data.session?.access_token;
        if (!token) {
          console.log("NO AUTH TOKEN - skipping permissions load");
          return;
        }

        console.log("LOADING STAFF PERMISSIONS...");
        const response = await fetch("/api/staff/permissions", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });

        console.log("PERMISSIONS API RESPONSE:", response.status, response.ok);

        const result = await response.json().catch(() => null) as { permissions?: StaffPermissions; error?: string } | null;

        console.log("PERMISSIONS RESULT:", result);

        if (mounted && response.ok && result?.permissions) {
          setPermissions(result.permissions);
          console.log("PERMISSIONS SET:", Object.keys(result.permissions).length, "permission groups loaded");
        } else if (result?.error) {
          console.error("PERMISSIONS API ERROR:", result.error);
        }
      } catch (error) {
        console.error("Could not load staff permissions:", error);
      } finally {
        if (mounted) {
          setLoaded(true);
          console.log("PERMISSIONS LOADED FLAG SET TO TRUE");
        }
      }
    }
    void load();
    return () => { mounted = false; };
  }, []);

  // Stable function that uses ref - never changes reference
  const can = useCallback((key: string, action: PermissionAction = "view") => {
    return permissionsRef.current?.[key]?.[action] === true;
  }, []);

  // Legacy alias for backwards compatibility
  const hasPermission = can;

  return { permissions, loaded, can, hasPermission };
}
