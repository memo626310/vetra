"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Client = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
};

type Pet = {
  id: string;
  name: string;
  species: string;
  breed: string | null;
  gender: string | null;
  birth_date: string | null;
  is_deceased: boolean;
};

const cards = [
  ["🐾", "Your Pets", "Everything about their care"],
  ["💉", "Vaccines", "Never miss an important dose"],
  ["📅", "Appointments", "Your next visit, one tap away"],
  ["🧾", "Invoices", "Your records, always with you"],
];

export default function ClientInterfaceIdPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const clientId = params.id;

  const [client, setClient] = useState<Client | null>(null);
  const [pets, setPets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [language, setLanguage] = useState<"en" | "ar">("en");
  const [dark, setDark] = useState(false);
  const [message, setMessage] = useState("");
  const [showDeviceSetup, setShowDeviceSetup] = useState(false);
  const [notificationState, setNotificationState] = useState<"default" | "granted" | "denied" | "unsupported">("default");
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<any>(null);
  const [canInstall, setCanInstall] = useState(false);
  const [installDone, setInstallDone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const savedLanguage = window.localStorage.getItem("vetra-language");
    const savedTheme = window.localStorage.getItem("vetra-theme");
    if (savedLanguage === "ar") setLanguage("ar");
    if (savedTheme === "dark") setDark(true);
  }, []);

  useEffect(() => {
    async function load() {
      setLoading(true);

      const savedClientId = window.sessionStorage.getItem("vetra-client-id");

      if (!savedClientId || savedClientId !== clientId) {
        router.replace("/client-interface/login");
        return;
      }

      const { data: clientData, error: clientError } = await supabase
        .from("clients")
        .select("id, name, phone, email")
        .eq("id", clientId)
        .maybeSingle();

      if (clientError || !clientData) {
        setMessage("ملف العميل غير موجود.");
        setLoading(false);
        return;
      }

      const { data: petsData, error: petsError } = await supabase
        .from("pets")
        .select("id, name, species, breed, gender, birth_date, is_deceased")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });

      if (petsError) {
        setMessage(petsError.message);
      }

      setClient(clientData);
      setPets((petsData || []) as Pet[]);
      setAuthorized(true);
      setLoading(false);
    }

    if (clientId) load();
  }, [clientId, router]);

  function signOut() {
    window.sessionStorage.removeItem("vetra-client-id");
    window.sessionStorage.removeItem("vetra-client-code");
    router.replace("/client-interface/login");
  }

  useEffect(() => {
    if (typeof window === "undefined") return;

    const nav = window.navigator;

    // Strong iOS detection:
    // 1) Normal iPhone/iPad/iPod user agents.
    // 2) iPadOS 13+ can identify itself as a Mac, so use touch points too.
    // 3) iOS standalone mode is exposed by Safari as navigator.standalone.
    const userAgent = nav.userAgent || "";
    const platform = nav.platform || "";
    const maxTouchPoints = nav.maxTouchPoints || 0;

    const ios =
      /iPhone|iPad|iPod/i.test(userAgent) ||
      /iPhone|iPad|iPod/i.test(platform) ||
      (platform === "MacIntel" && maxTouchPoints > 1);

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (nav as Navigator & { standalone?: boolean }).standalone === true;

    setIsIOS(ios);
    setIsStandalone(standalone);

    console.log("VETRA DEVICE:", {
      userAgent,
      platform,
      maxTouchPoints,
      isIOS: ios,
      isStandalone: standalone,
    });

    if ("Notification" in window) {
      const permission = window.Notification.permission;
      setNotificationState(permission === "granted" ? "granted" : permission === "denied" ? "denied" : "default");
    } else {
      setNotificationState("unsupported");
    }

    const handler = (event: Event) => {
      event.preventDefault();
      setDeferredInstallPrompt(event);
      setCanInstall(true);
    };

    const installed = () => {
      setCanInstall(false);
      setInstallDone(true);
      window.localStorage.setItem("vetra-pwa-installed", "true");
    };

    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", installed);

    if (standalone) {
      setInstallDone(true);
    }

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((error) => { console.error("VETRA SERVICE WORKER ERROR:", error); });
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  useEffect(() => {
    if (!authorized) return;
    if (window.localStorage.getItem("vetra-device-setup-seen-v2") === "true") return;
    const timer = window.setTimeout(() => setShowDeviceSetup(true), 700);
    return () => window.clearTimeout(timer);
  }, [authorized]);

  async function enableNotifications() {
    if (isIOS && !isStandalone) {
      return;
    }

    if (!("Notification" in window)) {
      setNotificationState("unsupported");
      return;
    }

    const permission = await window.Notification.requestPermission();
    setNotificationState(
      permission === "granted"
        ? "granted"
        : permission === "denied"
          ? "denied"
          : "default"
    );

    if (permission === "granted") {
      try {
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification("VETRA 🐾", {
          body: "تم تفعيل إشعارات VETRA بنجاح. هتوصلك التنبيهات المهمة هنا.",
          icon: "/icon-192.png",
          badge: "/icon-192.png",
        });
      } catch (error) {
        console.error("VETRA NOTIFICATION ERROR:", error);
      }
    }
  }

  async function installWebsite() {
    if (!deferredInstallPrompt) return;
    try {
      await deferredInstallPrompt.prompt();
      const result = await deferredInstallPrompt.userChoice;
      if (result?.outcome === "accepted") setInstallDone(true);
    } finally {
      setDeferredInstallPrompt(null);
      setCanInstall(false);
    }
  }

  function finishDeviceSetup() {
    window.localStorage.setItem("vetra-device-setup-seen-v2", "true");
    setShowDeviceSetup(false);
  }

  const ar = language === "ar";
  const heroPet = pets.find((pet) => !pet.is_deceased) || pets[0];

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F8FBFF] dark:bg-[#07111C]">
        <div className="text-center">
          <div className="text-6xl animate-pulse">🐾</div>
          <p className="mt-4 text-sm font-bold text-slate-500">Loading VETRA...</p>
        </div>
      </main>
    );
  }

  if (!authorized) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F8FBFF] px-6 dark:bg-[#07111C]">
        <div className="max-w-md rounded-[2rem] bg-white p-8 text-center shadow-2xl dark:bg-[#101923]">
          <div className="text-5xl">🐾</div>
          <h1 className="mt-4 text-2xl font-black">VETRA</h1>
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-300">{message}</p>
          <button
            onClick={() => router.replace("/client-interface/login")}
            className="mt-6 rounded-2xl bg-slate-900 px-6 py-3 text-sm font-black text-white dark:bg-white dark:text-slate-900"
          >
            Back to Login
          </button>
        </div>
      </main>
    );
  }

  const setupModal = showDeviceSetup ? (
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-slate-950/45 p-4 backdrop-blur-sm sm:items-center">
      <div dir="rtl" className="w-full max-w-md rounded-[2rem] border border-white/70 bg-white p-6 text-slate-900 shadow-2xl dark:border-white/10 dark:bg-[#101923] dark:text-white">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-cyan-100 text-3xl dark:bg-cyan-400/10">🐾</div>
        <h2 className="mt-5 text-center text-2xl font-black">خلي VETRA معاك دايمًا 🐾</h2>
        <div className="mt-3 text-center text-xs font-bold text-cyan-600 dark:text-cyan-300">
          {isIOS
            ? isStandalone
              ? "🍎 تم اكتشاف iPhone — VETRA تعمل كتطبيق"
              : "🍎 تم اكتشاف iPhone — افتحها كتطبيق من الشاشة الرئيسية"
            : "📱 تم اكتشاف جهاز Android / متصفح يدعم التثبيت"}
        </div>
        <p className="mt-2 text-center text-sm leading-7 text-slate-500 dark:text-slate-300">فعّل الإشعارات واحفظ VETRA على موبايلك عشان توصلك التنبيهات المهمة بسهولة.</p>

        <div className="mt-6 space-y-3">
          <button
            type="button"
            onClick={enableNotifications}
            disabled={notificationState === "granted" || (isIOS && !isStandalone)}
            className="flex w-full items-center justify-between rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-4 text-right transition hover:-translate-y-0.5 hover:shadow-md disabled:cursor-default disabled:opacity-90 dark:border-cyan-400/10 dark:bg-cyan-400/10"
          >
            <span>
              <span className="block font-black">
                {notificationState === "granted"
                  ? "الإشعارات مفعّلة ✓"
                  : isIOS && !isStandalone
                    ? "فعّل الإشعارات بعد إضافة VETRA"
                    : "السماح بإشعارات VETRA"}
              </span>
              <span className="mt-1 block text-xs leading-6 text-slate-500 dark:text-slate-300">
                {notificationState === "denied"
                  ? "الإشعارات مرفوضة من إعدادات الجهاز."
                  : isIOS && !isStandalone
                    ? "أولًا أضف VETRA للشاشة الرئيسية وافتحها من الأيقونة، وبعدها فعّل الإشعارات."
                    : "استقبل تنبيهات المواعيد والتطعيمات والتحديثات المهمة."}
              </span>
            </span>
            <span className="text-2xl">🔔</span>
          </button>

          <button
            type="button"
            onClick={isIOS ? undefined : installWebsite}
            disabled={isIOS ? isStandalone : !canInstall}
            className="flex w-full items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-right transition hover:-translate-y-0.5 hover:shadow-md disabled:cursor-default disabled:opacity-90 dark:border-emerald-400/10 dark:bg-emerald-400/10"
          >
            <span>
              <span className="block font-black">
                {installDone ? "VETRA محفوظة على الموبايل ✓" : "احفظ VETRA على موبايلك"}
              </span>
              <span className="mt-1 block text-xs leading-6 text-slate-500 dark:text-slate-300">
                {isIOS && !isStandalone
                  ? "اضغط مشاركة ↑ ثم إضافة إلى الشاشة الرئيسية، وبعدها افتح VETRA من الأيقونة."
                  : isIOS && isStandalone
                    ? "VETRA تعمل الآن كتطبيق على جهازك."
                    : canInstall
                      ? "أضف VETRA للشاشة الرئيسية بضغطة واحدة."
                      : installDone
                        ? "تقدر تفتح VETRA من الشاشة الرئيسية."
                        : "من المتصفح اختار إضافة إلى الشاشة الرئيسية."}
              </span>
            </span>
            <span className="text-2xl">📲</span>
          </button>
        </div>

        <button type="button" onClick={finishDeviceSetup} className="mt-5 w-full rounded-2xl px-4 py-3 text-sm font-bold text-slate-400 transition hover:text-slate-700 dark:hover:text-white">لاحقًا</button>
      </div>
    </div>
  ) : null;

  return (
    <>
      {setupModal}
      <main
      dir={ar ? "rtl" : "ltr"}
      className={`min-h-screen overflow-hidden transition-colors duration-700 ${
        dark ? "bg-[#07111C] text-white" : "bg-[#F8FBFF] text-slate-900"
      }`}
    >
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-cyan-300/20 blur-3xl" />
        <div className="absolute -right-32 top-1/4 h-[30rem] w-[30rem] rounded-full bg-blue-300/20 blur-3xl" />
        <div className="absolute bottom-[-10rem] left-1/3 h-96 w-96 rounded-full bg-emerald-300/15 blur-3xl" />
        <div className="absolute left-[5%] top-[35%] rotate-[-18deg] text-8xl opacity-10">🐾</div>
        <div className="absolute right-[5%] bottom-[20%] rotate-[18deg] text-8xl opacity-10">🐾</div>
      </div>

      <header className="relative z-10 flex items-center justify-between px-5 py-5 sm:px-10">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-2xl text-white shadow-xl dark:bg-white dark:text-slate-900">
            🐾
          </div>
          <div>
            <div className="font-black tracking-[0.2em]">VETRA</div>
            <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-400">
              Pet Care Portal
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setLanguage(ar ? "en" : "ar")}
            className="rounded-full border border-slate-200 bg-white/70 px-4 py-2 text-xs font-bold backdrop-blur dark:border-white/10 dark:bg-white/5"
          >
            {ar ? "English" : "العربية"}
          </button>
          <button
            onClick={() => setDark((v) => !v)}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white/70 backdrop-blur dark:border-white/10 dark:bg-white/5"
          >
            {dark ? "☀️" : "🌙"}
          </button>
          <button
            onClick={signOut}
            className="rounded-full border border-slate-200 bg-white/70 px-4 py-2 text-xs font-bold backdrop-blur dark:border-white/10 dark:bg-white/5"
          >
            {ar ? "خروج" : "Sign out"}
          </button>
        </div>
      </header>

      <section className="relative z-10 mx-auto max-w-7xl px-5 pb-12 sm:px-10">
        <div className="grid items-center gap-10 rounded-[3rem] border border-white/70 bg-white/65 p-6 shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-white/5 sm:p-10 lg:grid-cols-[1.05fr_.95fr]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-white/80 px-4 py-2 text-xs font-bold text-cyan-700 dark:border-cyan-300/10 dark:bg-white/5 dark:text-cyan-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              {ar ? "رعاية حيوانك في مكان واحد" : "Your pet care, all in one place"}
            </div>

            <h1 className="mt-6 text-5xl font-black leading-[1.02] tracking-tight sm:text-6xl">
              {ar ? "Welcome back، " : "Welcome back, "}
              <span className="text-cyan-500">
                {client?.name || "Pet Owner"}
              </span>{" "}
              👋
            </h1>

            <p className="mt-5 max-w-xl text-lg leading-8 text-slate-500 dark:text-slate-300">
              {ar
                ? "كل تفاصيل حيواناتك، مواعيدك وتطعيماتك وفواتيرك هنا."
                : "Your pets, appointments, vaccines and invoices — all in one place."}
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <div className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-black text-white dark:bg-white dark:text-slate-900">
                {pets.length} {ar ? "حيوان" : pets.length === 1 ? "Pet" : "Pets"}
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white/70 px-5 py-3 text-sm font-bold dark:border-white/10 dark:bg-white/5">
                {ar ? "حساب آمن" : "Secure account"} 🔐
              </div>
            </div>
          </div>

          <div className="relative mx-auto h-[360px] w-full max-w-[430px]">
            <div className="absolute inset-5 rounded-[3rem] bg-gradient-to-br from-cyan-100 via-white to-blue-100 shadow-2xl dark:from-cyan-500/10 dark:via-slate-900 dark:to-blue-500/10" />
            <div className="absolute left-1/2 top-5 flex h-56 w-56 -translate-x-1/2 items-center justify-center rounded-full bg-white/80 text-[8rem] shadow-2xl backdrop-blur-xl dark:bg-white/5">
              {heroPet?.species?.toLowerCase().includes("cat") ? "🐱" : "🐶"}
            </div>

            <div className="absolute bottom-0 left-4 right-4 rounded-[2rem] border border-white/70 bg-white/90 p-5 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-[#101923]/90">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                {ar ? "حيوانك المميز" : "Your Hero Pet"}
              </div>
              <div className="mt-1 text-2xl font-black">
                {heroPet?.name || "Your Hero Pet"} 🐾
              </div>
              <div className="mt-1 text-sm text-slate-500 dark:text-slate-300">
                {heroPet
                  ? `${heroPet.species}${heroPet.breed ? ` • ${heroPet.breed}` : ""}`
                  : ar
                    ? "لم تضف حيوانًا بعد"
                    : "No pet added yet"}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map(([icon, title, subtitle]) => (
            <button
              key={title}
              className="group rounded-[2rem] border border-white/70 bg-white/70 p-6 text-left shadow-lg backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:shadow-2xl dark:border-white/10 dark:bg-white/5"
            >
              <div className="text-3xl transition duration-300 group-hover:scale-110">{icon}</div>
              <div className="mt-5 text-lg font-black">{ar ? title : title}</div>
              <div className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-300">
                {subtitle}
              </div>
            </button>
          ))}
        </div>

        <div className="mt-8">
          <h2 className="text-2xl font-black">{ar ? "حيواناتك" : "Your Pets"}</h2>
          {pets.length === 0 ? (
            <div className="mt-4 rounded-[2rem] border border-dashed border-slate-300 bg-white/50 p-8 text-center text-sm text-slate-500 dark:border-white/10 dark:bg-white/5">
              {ar ? "لا توجد حيوانات مرتبطة بهذا الحساب حتى الآن." : "No pets are linked to this account yet."}
            </div>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {pets.map((pet) => (
                <button
                  key={pet.id}
                  onClick={() => router.push(`/client-interface/${clientId}?pet=${pet.id}`)}
                  className="rounded-[2rem] border border-white/70 bg-white/70 p-5 text-left shadow-lg backdrop-blur-xl transition hover:-translate-y-1 hover:shadow-2xl dark:border-white/10 dark:bg-white/5"
                >
                  <div className="text-4xl">
                    {pet.species.toLowerCase().includes("cat") ? "🐱" : "🐶"}
                  </div>
                  <div className="mt-3 text-xl font-black">{pet.name}</div>
                  <div className="mt-1 text-sm text-slate-500 dark:text-slate-300">
                    {pet.species}{pet.breed ? ` • ${pet.breed}` : ""}
                  </div>
                  {pet.is_deceased && (
                    <div className="mt-3 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500 dark:bg-white/10">
                      {ar ? "متوفى" : "Deceased"}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
    </>
  );
}
