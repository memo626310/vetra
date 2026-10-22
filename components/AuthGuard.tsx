"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { vetraCore } from "@/lib/vetra-core";
import { permissionForPath } from "@/lib/staff-permissions";
import { useStaffPermissions } from "@/lib/use-staff-permissions";

const PUBLIC_PATHS = [
  "/",
  "/login",
  "/register",
  "/clinic-setup",
  "/client-interface",
  "/client-interface/login",
];

function isPublicPath(pathname: string) {
  return (
    PUBLIC_PATHS.includes(pathname) ||
    pathname.startsWith("/client-interface/")
  );
}

export default function AuthGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { loaded: permissionsLoaded, can } = useStaffPermissions();
  const [checkedPath, setCheckedPath] = useState("");
  const [checkError, setCheckError] = useState(false);
  const verifiedState = useRef<{ userId: string; verifiedAt: number; mustChangePassword: boolean } | null>(null);

  useEffect(() => {
    if (isPublicPath(pathname)) {
      return;
    }

    let mounted = true;

    async function checkCoreSession() {
      const {
        data: { session },
        error,
      } = await vetraCore.auth.getSession();

      if (error) {
        console.error(
          "VETRA Core auth check failed:",
          error
        );
      }

      if (!session) {
        verifiedState.current = null;
        router.replace("/login");
        return;
      }

      const cached = verifiedState.current;
      // Keep route changes fast while still re-checking staff security periodically.
      if (cached?.userId === session.user.id && Date.now() - cached.verifiedAt < 5 * 60_000) {
        if (cached.mustChangePassword && pathname !== "/change-password") {
          router.replace("/change-password");
          return;
        }
        if (!cached.mustChangePassword && pathname === "/change-password") {
          router.replace("/dashboard");
          return;
        }
        if (mounted) {
          setCheckError(false);
          setCheckedPath(pathname);
        }
        return;
      }

      const staffStateResponse = await fetch("/api/staff/auth-state", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const staffState = await staffStateResponse.json().catch(() => null) as { mustChangePassword?: boolean } | null;
      if (!staffStateResponse.ok || !staffState) {
        verifiedState.current = null;
        await Promise.all([
          vetraCore.auth.signOut(),
          import("@/lib/supabase").then(({ supabase }) => supabase.auth.signOut()),
        ]);
        if (mounted) router.replace("/login");
        return;
      }
      if (staffState.mustChangePassword && pathname !== "/change-password") {
        verifiedState.current = { userId: session.user.id, verifiedAt: Date.now(), mustChangePassword: true };
        router.replace("/change-password");
        return;
      }
      if (!staffState.mustChangePassword && pathname === "/change-password") {
        verifiedState.current = { userId: session.user.id, verifiedAt: Date.now(), mustChangePassword: false };
        router.replace("/dashboard");
        return;
      }

      verifiedState.current = { userId: session.user.id, verifiedAt: Date.now(), mustChangePassword: Boolean(staffState.mustChangePassword) };
      if (mounted) {
        setCheckError(false);
        setCheckedPath(pathname);
      }
    }

    void checkCoreSession();

    const {
      data: { subscription },
    } = vetraCore.auth.onAuthStateChange(
      (_event, session) => {
        if (!session && !isPublicPath(pathname)) {
          router.replace("/login");
          return;
        }

      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [pathname, router]);

  const requiredPermission = permissionForPath(pathname);
  if ((checkedPath !== pathname || checkError || (requiredPermission && !permissionsLoaded)) && !isPublicPath(pathname)) {
    return (
      <main className="min-h-screen bg-[#f7f8fa] px-4 pt-3 dark:bg-[#0f1115]">
        <div className="mx-auto flex max-w-7xl items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-[#181b21]" role="status" aria-live="polite">
          <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-slate-300 border-t-cyan-500 dark:border-white/15 dark:border-t-cyan-400" />
          <p className="text-sm text-slate-600 dark:text-slate-300">{checkError ? "Could not verify account security. Refresh or sign in again." : "Loading VETRA..."}</p>
        </div>
      </main>
    );
  }

  if (requiredPermission && !can(requiredPermission.key, requiredPermission.action)) {
    return <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0f1115] px-4 text-center text-white">
      <h1 className="text-xl font-bold">ليس لديك صلاحية لفتح هذا القسم</h1>
      <button type="button" onClick={() => router.replace("/dashboard")} className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-bold text-slate-950">العودة للرئيسية</button>
    </main>;
  }

  return <>{children}</>;
}
