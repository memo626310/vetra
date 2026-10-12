"use client";

import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type Language = "ar" | "en";

export default function ClientAppInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [language, setLanguage] = useState<Language>("en");

  useEffect(() => {
    const savedLanguage = window.localStorage.getItem("vetra-language");
    setLanguage(savedLanguage === "ar" ? "ar" : "en");

    const navigatorWithStandalone = window.navigator as Navigator & { standalone?: boolean };
    const isAlreadyInstalled =
      window.matchMedia("(display-mode: standalone)").matches ||
      navigatorWithStandalone.standalone === true;

    if (isAlreadyInstalled) {
      setInstalled(true);
      return;
    }

    const iosDevice =
      /iPhone|iPad|iPod/i.test(window.navigator.userAgent) ||
      (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
    setIsIOS(iosDevice);

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallPromptEvent);
    };
    const handleAppInstalled = () => setInstalled(true);

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  if (installed || dismissed || (!installEvent && !isIOS)) return null;

  const isArabic = language === "ar";
  const title = isArabic ? "\u062b\u0628\u0651\u062a VETRA \u0639\u0644\u0649 \u0645\u0648\u0628\u0627\u064a\u0644\u0643" : "Install VETRA on your phone";
  const subtitle = isArabic
    ? "\u0648\u0635\u0648\u0644 \u0623\u0633\u0631\u0639 \u0644\u0645\u0644\u0641 \u062d\u064a\u0648\u0627\u0646\u0643 \u0648\u062a\u0637\u0639\u064a\u0645\u0627\u062a\u0647 \u0648\u0645\u062a\u0627\u0628\u0639\u062a\u0647."
    : "Quick access to your pet's records, vaccines, and care.";
  const installLabel = isArabic ? "\u062a\u062b\u0628\u064a\u062a" : "Install";
  const closeLabel = isArabic ? "\u0625\u062e\u0641\u0627\u0621" : "Dismiss";
  const instruction = isArabic
    ? "\u0644\u062a\u062b\u0628\u064a\u062a VETRA \u0639\u0644\u0649 iPhone: \u0627\u0636\u063a\u0637 \u0645\u0634\u0627\u0631\u0643\u0629 \u062b\u0645 \u00ab\u0625\u0636\u0627\u0641\u0629 \u0625\u0644\u0649 \u0627\u0644\u0634\u0627\u0634\u0629 \u0627\u0644\u0631\u0626\u064a\u0633\u064a\u0629\u00bb."
    : "On iPhone: tap Share, then choose \u201cAdd to Home Screen\u201d.";

  async function installApp() {
    if (!installEvent) {
      setShowIOSInstructions((current) => !current);
      return;
    }

    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    setInstallEvent(null);
  }

  return (
    <aside
      dir={isArabic ? "rtl" : "ltr"}
      className="fixed inset-x-3 bottom-3 z-[100] mx-auto max-w-md rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur dark:border-slate-700 dark:bg-slate-900/95"
      aria-label={title}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#0B2540] text-xl font-black text-white">
          V<span className="ml-0.5 text-cyan-300">.</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-900 dark:text-white">{title}</p>
          <p className="mt-0.5 text-xs leading-5 text-slate-600 dark:text-slate-300">{subtitle}</p>
          {isIOS && showIOSInstructions && (
            <p className="mt-2 rounded-lg bg-slate-100 p-2 text-xs leading-5 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              {instruction}
            </p>
          )}
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={installApp}
              className="rounded-lg bg-[#0B2540] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#123F61]"
            >
              {isIOS && !installEvent
                ? (isArabic ? "\u0637\u0631\u064a\u0642\u0629 \u0627\u0644\u062a\u062b\u0628\u064a\u062a" : "How to install")
                : installLabel}
            </button>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="rounded-lg px-3 py-2 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {closeLabel}
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}