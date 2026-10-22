"use client";

import { useCallback, useEffect, useState } from "react";
import { vetraCore } from "@/lib/vetra-core";
import { type PermissionAction, type StaffPermissions } from "@/lib/staff-permissions";

export function useStaffPermissions() {
  const [permissions, setPermissions] = useState<StaffPermissions | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const { data } = await vetraCore.auth.getSession();
        const token = data.session?.access_token;
        if (!token) return;
        const response = await fetch("/api/staff/permissions", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const result = await response.json().catch(() => null) as { permissions?: StaffPermissions } | null;
        if (mounted && response.ok && result?.permissions) setPermissions(result.permissions);
      } catch (error) {
        console.error("Could not load staff permissions:", error);
      } finally {
        if (mounted) setLoaded(true);
      }
    }
    void load();
    return () => { mounted = false; };
  }, []);

  const can = useCallback((key: string, action: PermissionAction = "view") => {
    return permissions?.[key]?.[action] === true;
  }, [permissions]);

  return { permissions, loaded, can };
}
