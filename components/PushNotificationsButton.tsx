"use client";

import { useEffect, useState } from "react";
import { vetraCore } from "@/lib/vetra-core";

type Audience = "owner" | "clinic";
type Language = "ar" | "en";
type OwnerCredentials = { clientCode: string; phone: string };

type Props = {
  audience: Audience;
  language: Language;
  darkMode?: boolean;
};

type ApiPayload = {
  audience: Audience;
  subscription: PushSubscriptionJSON;
  clientCode?: string;
  phone?: string;
};

const words = {
  ar: {
    title: "إشعارات VETRA",
    description: "استقبل تنبيهات الرعاية حتى عندما لا تكون الصفحة مفتوحة.",
    enable: "تفعيل الإشعارات",
    disable: "إيقاف على هذا الجهاز",
    test: "إرسال إشعار تجريبي",
    enabled: "الإشعارات مفعّلة على هذا الجهاز.",
    unsupported: "المتصفح لا يدعم الإشعارات أو يحتاج إلى HTTPS.",
    permission: "تم رفض الإذن. غيّر إعداد الإشعارات من المتصفح.",
    signIn: "انتهت الجلسة. سجّل الدخول مرة أخرى.",
    settings: "لم تكتمل إعدادات الإشعارات على الخادم بعد.",
    ready: "تم إرسال الإشعار التجريبي.",
    working: "جارٍ الحفظ...",
    open: "إدارة الإشعارات",
    close: "إغلاق",
  },
  en: {
    title: "VETRA notifications",
    description: "Get care updates even when the page is closed.",
    enable: "Turn on notifications",
    disable: "Turn off on this device",
    test: "Send a test notification",
    enabled: "Notifications are on for this device.",
    unsupported: "This browser does not support push notifications or needs HTTPS.",
    permission: "Permission was denied. Change the notification setting in your browser.",
    signIn: "Your session expired. Sign in again.",
    settings: "Push notifications are not configured on the server yet.",
    ready: "Test notification sent.",
    working: "Saving...",
    open: "Manage notifications",
    close: "Close",
  },
} as const;

function base64UrlToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

function readOwnerCredentials(): OwnerCredentials | null {
  const storages = [window.localStorage, window.sessionStorage];
  for (const storage of storages) {
    const clientCode = storage.getItem("vetra-client-code")?.trim() || "";
    const phone = storage.getItem("vetra-client-phone")?.trim() || "";
    if (clientCode && phone) return { clientCode, phone };
  }
  return null;
}

export default function PushNotificationsButton({
  audience,
  language,
  darkMode = true,
}: Props) {
  const t = words[language];
  const [open, setOpen] = useState(false);
  const [supported, setSupported] = useState(false);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    async function initialize() {
      const canPush = typeof window !== "undefined"
        && window.isSecureContext
        && "serviceWorker" in navigator
        && "PushManager" in window
        && "Notification" in window;
      if (!canPush) {
        if (active) {
          setSupported(false);
          setReady(true);
        }
        return;
      }
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });
        const existing = await registration.pushManager.getSubscription();
        if (active) {
          setSupported(true);
          setSubscription(existing);
          setReady(true);
        }
      } catch {
        if (active) {
          setSupported(false);
          setReady(true);
        }
      }
    }
    void initialize();
    return () => {
      active = false;
    };
  }, []);

  async function identityHeaders(): Promise<{
    headers: Record<string, string>;
    clientCode?: string;
    phone?: string;
  }> {
    if (audience === "owner") {
      const credentials = readOwnerCredentials();
      if (!credentials) throw new Error(t.signIn);
      return { headers: {}, ...credentials };
    }
    const { data, error } = await vetraCore.auth.getSession();
    if (error || !data.session?.access_token) throw new Error(t.signIn);
    return {
      headers: { Authorization: `Bearer ${data.session.access_token}` },
    };
  }

  async function sendRequest(path: string, method: "POST" | "DELETE", current: PushSubscription) {
    const { headers, clientCode, phone } = await identityHeaders();
    const body: ApiPayload & OwnerCredentials = {
      audience,
      subscription: current.toJSON(),
      clientCode: clientCode || "",
      phone: phone || "",
    };
    const response = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) {
      if (response.status === 503 && result.error?.includes("configuration")) {
        throw new Error(t.settings);
      }
      throw new Error(result.error || "Push notification request failed.");
    }
  }

  async function enable() {
    setBusy(true);
    setNotice("");
    try {
      if (!supported) throw new Error(t.unsupported);
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) throw new Error(t.settings);
      const permission = Notification.permission === "granted"
        ? "granted"
        : await Notification.requestPermission();
      if (permission !== "granted") throw new Error(t.permission);

      const registration = await navigator.serviceWorker.ready;
      const applicationKey = base64UrlToUint8Array(publicKey);
      const current = subscription || await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationKey.buffer.slice(
          applicationKey.byteOffset,
          applicationKey.byteOffset + applicationKey.byteLength
        ) as ArrayBuffer,
      });
      await sendRequest("/api/push/subscriptions", "POST", current);
      setSubscription(current);
      setNotice(t.enabled);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Push notification setup failed.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (!subscription) return;
    setBusy(true);
    setNotice("");
    try {
      await sendRequest("/api/push/subscriptions", "DELETE", subscription);
      await subscription.unsubscribe();
      setSubscription(null);
      setNotice(language === "ar" ? "تم إيقاف الإشعارات على هذا الجهاز." : "Notifications are off on this device.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not turn notifications off.");
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    if (!subscription) return;
    setBusy(true);
    setNotice("");
    try {
      await sendRequest("/api/push/subscriptions", "POST", subscription);
      await sendRequest("/api/push/test", "POST", subscription);
      setNotice(t.ready);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not send a test notification.");
    } finally {
      setBusy(false);
    }
  }

  const buttonClass = darkMode
    ? "border-white/10 bg-white/[.05] text-slate-100 hover:bg-white/10"
    : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((value) => !value);
          setNotice("");
        }}
        aria-label={t.open}
        aria-expanded={open}
        title={t.open}
        className={`relative flex h-10 w-10 items-center justify-center rounded-2xl border transition active:scale-95 sm:h-12 sm:w-12 ${buttonClass}`}
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
          <path d="M10 21h4" />
        </svg>
        {subscription && <span className="absolute end-2 top-2 h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-white" />}
      </button>

      {open && (
        <div
          dir={language === "ar" ? "rtl" : "ltr"}
          className={`absolute end-0 top-[calc(100%+0.75rem)] z-[120] w-[min(21rem,calc(100vw-2rem))] rounded-3xl border p-4 shadow-2xl ${darkMode ? "border-white/10 bg-[#111c29] text-white" : "border-slate-200 bg-white text-slate-900"}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-black">{t.title}</h3>
              <p className={`mt-1 text-xs leading-5 ${darkMode ? "text-slate-300" : "text-slate-600"}`}>{t.description}</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${darkMode ? "bg-white/10" : "bg-slate-100"}`} aria-label={t.close}>×</button>
          </div>

          <p className={`mt-3 min-h-5 text-xs leading-5 ${darkMode ? "text-slate-300" : "text-slate-600"}`} aria-live="polite">
            {notice || (subscription ? t.enabled : !ready ? t.working : !supported ? t.unsupported : "")}
          </p>

          <div className="mt-3 flex flex-col gap-2">
            {!subscription ? (
              <button type="button" onClick={() => void enable()} disabled={busy || !ready} className="rounded-2xl bg-cyan-500 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-cyan-400 disabled:opacity-50">
                {busy ? t.working : t.enable}
              </button>
            ) : (
              <>
                <button type="button" onClick={() => void sendTest()} disabled={busy} className="rounded-2xl bg-cyan-500 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-cyan-400 disabled:opacity-50">
                  {busy ? t.working : t.test}
                </button>
                <button type="button" onClick={() => void disable()} disabled={busy} className={`rounded-2xl border px-4 py-2.5 text-xs font-bold transition disabled:opacity-50 ${darkMode ? "border-white/10 text-slate-200 hover:bg-white/5" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}>
                  {t.disable}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
