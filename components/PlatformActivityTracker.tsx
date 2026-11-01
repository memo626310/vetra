"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { vetraCore } from "@/lib/vetra-core";

export default function PlatformActivityTracker() {
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname || pathname.startsWith("/client-interface") || pathname.startsWith("/core-admin") || pathname === "/login") return;
    let active = true;
    void vetraCore.auth.getSession().then(({ data }) => {
      if (!active || !data.session?.access_token) return;
      void fetch("/api/core-admin/activity", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
        body: JSON.stringify({ route: pathname }),
        keepalive: true,
      }).catch(() => undefined);
    });
    return () => { active = false; };
  }, [pathname]);
  return null;
}
