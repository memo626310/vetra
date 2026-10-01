"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { vetraCore } from "@/lib/vetra-core";

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

  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (isPublicPath(pathname)) {
      setChecking(false);
      return;
    }

    let mounted = true;

    async function checkCoreSession() {
      const {
        data: { session },
        error,
      } = await vetraCore.auth.getSession();

      if (error) {
        console.error("VETRA Core auth check failed:", error);
      }

      if (!session) {
        router.replace("/login");
        return;
      }

      if (mounted) {
        setChecking(false);
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

        if (session && mounted) {
          setChecking(false);
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [pathname, router]);

  if (checking && !isPublicPath(pathname)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="text-center">
          <div className="mb-3 text-4xl">
            🐾
          </div>

          <p className="text-sm text-slate-500">
            Loading VETRA...
          </p>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}