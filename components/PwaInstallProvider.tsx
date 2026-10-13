"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export type PwaInstallResult = "accepted" | "dismissed" | "unavailable";

type PwaInstallContextValue = {
  canInstall: boolean;
  isInstalled: boolean;
  isIOS: boolean;
  installApp: () => Promise<PwaInstallResult>;
};

const PwaInstallContext = createContext<PwaInstallContextValue>({
  canInstall: false,
  isInstalled: false,
  isIOS: false,
  installApp: async () => "unavailable",
});

export function usePwaInstall() {
  return useContext(PwaInstallContext);
}

export default function PwaInstallProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const browserNavigator = window.navigator as Navigator & { standalone?: boolean };
    const standalone = window.matchMedia("(display-mode: standalone)").matches || browserNavigator.standalone === true;
    setIsInstalled(standalone);

    const ios = /iPhone|iPad|iPod/i.test(window.navigator.userAgent) ||
      (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
    setIsIOS(ios);

    const isClientPortal = pathname === "/client-interface" || pathname.startsWith("/client-interface/");
    const hasClinicManifest = pathname === "/dashboard" || pathname.startsWith("/dashboard/") || pathname === "/settings" || pathname.startsWith("/settings/");
    if (isClientPortal || !hasClinicManifest) {
      setInstallPrompt(null);
      return;
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const handleAppInstalled = () => {
      setInstallPrompt(null);
      setIsInstalled(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, [pathname]);

  async function installApp(): Promise<PwaInstallResult> {
    const prompt = installPrompt;
    if (!prompt) return "unavailable";

    setInstallPrompt(null);
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === "accepted") setIsInstalled(true);
      return choice.outcome;
    } catch (error) {
      console.error("VETRA PWA INSTALL PROMPT ERROR:", error);
      return "unavailable";
    }
  }

  return (
    <PwaInstallContext.Provider value={{ canInstall: Boolean(installPrompt), isInstalled, isIOS, installApp }}>
      {children}
    </PwaInstallContext.Provider>
  );
}