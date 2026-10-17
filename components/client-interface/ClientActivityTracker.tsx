"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export default function ClientActivityTracker() {
  const pathname = usePathname();

  useEffect(() => {
    const segments = pathname.split("/").filter(Boolean);
    if (segments[0] !== "client-interface" || !segments[1] || segments[1] === "login") return;
    // The owner dashboard records its heartbeat after loading the verified client profile.
    if (segments.length === 2) return;
    let clientId = segments[1];
    try { clientId = decodeURIComponent(clientId); } catch { return; }

    const clientCode = localStorage.getItem("vetra-client-code") || sessionStorage.getItem("vetra-client-code") || "";
    const phone = localStorage.getItem("vetra-client-phone") || sessionStorage.getItem("vetra-client-phone") || "";
    const storedClientId = localStorage.getItem("vetra-client-id") || sessionStorage.getItem("vetra-client-id") || "";
    if (!clientCode || !phone || storedClientId !== clientId) return;

    const recordVisit = () => {
      if (document.visibilityState !== "visible") return;
      void fetch("/api/client-activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientCode, phone }),
        keepalive: true,
      }).catch((error) => console.error("Could not record client activity:", error));
    };

    recordVisit();
    const interval = window.setInterval(recordVisit, 45_000);
    document.addEventListener("visibilitychange", recordVisit);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", recordVisit);
    };
  }, [pathname]);

  return null;
}
