"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { vetraCore } from "@/lib/vetra-core";

type Language = "ar" | "en";
type Listing = {
  id: string;
  name: string;
  species: "dog" | "cat" | "other";
  breed: string | null;
  color: string | null;
  age_label: string;
  gender: "male" | "female" | "unknown" | null;
  city: string;
  description: string;
  photo_url: string | null;
  is_demo: boolean;
};

export default function AdoptionListingsPage() {
  const { id } = useParams<{ id: string }>();
  const [language, setLanguage] = useState<Language>("ar");
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [species, setSpecies] = useState("all");
  const [breed, setBreed] = useState("all");
  const [color, setColor] = useState("all");
  const [photoFilter, setPhotoFilter] = useState("all");
  const [activeIndex, setActiveIndex] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [reporting, setReporting] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const ar = language === "ar";

  const loadListings = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data: sessionData } = await vetraCore.auth.getSession();
      const token = sessionData.session?.access_token || "";
      const clientCode = window.localStorage.getItem("vetra-client-code") || window.sessionStorage.getItem("vetra-client-code") || "";
      const phone = window.localStorage.getItem("vetra-client-phone") || window.sessionStorage.getItem("vetra-client-phone") || "";
      const response = token || clientCode && phone
        ? await fetch("/api/match/adoption", { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ clientCode, phone }), cache: "no-store" })
        : await fetch("/api/match/adoption", { cache: "no-store" });
      const result = await response.json() as { listings?: Listing[]; error?: string };
      if (!response.ok) throw new Error(result.error || (ar ? "تعذر تحميل الحيوانات المعروضة." : "Could not load adoption listings."));
      setListings(result.listings || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : (ar ? "تعذر تحميل الحيوانات المعروضة." : "Could not load adoption listings."));
    } finally {
      setLoading(false);
    }
  }, [ar]);

  useEffect(() => {
    const savedLanguage = window.localStorage.getItem("vetra-language");
    // Restore the portal language after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (savedLanguage === "ar" || savedLanguage === "en") setLanguage(savedLanguage);
    void loadListings();
  }, [loadListings]);

  const breeds = useMemo(() => [...new Set(listings.map((item) => item.breed).filter((value): value is string => Boolean(value)))].sort(), [listings]);
  const colors = useMemo(() => [...new Set(listings.map((item) => item.color).filter((value): value is string => Boolean(value)))].sort(), [listings]);
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase(ar ? "ar" : "en");
    return listings.filter((item) => {
      const matchesSearch = !query || [item.name, item.species, item.breed, item.color, item.city, item.description]
        .some((value) => value?.toLocaleLowerCase(ar ? "ar" : "en").includes(query));
      return matchesSearch
        && (species === "all" || item.species === species)
        && (breed === "all" || item.breed === breed)
        && (color === "all" || item.color === color)
        && (photoFilter === "all" || (photoFilter === "with" ? Boolean(item.photo_url) : !item.photo_url));
    });
  }, [ar, breed, color, listings, photoFilter, search, species]);
  const activePet = filtered.length ? filtered[activeIndex % filtered.length] : null;

  async function interact(action: "like" | "pass" | "report" | "block") {
    if (!activePet) return;
    setError("");
    try {
      const { data } = await vetraCore.auth.getSession();
      const clientCode = window.localStorage.getItem("vetra-client-code") || window.sessionStorage.getItem("vetra-client-code") || "";
      const phone = window.localStorage.getItem("vetra-client-phone") || window.sessionStorage.getItem("vetra-client-phone") || "";
      const token = data.session?.access_token || "";
      const actionBody = { action, type: "adoption", listingId: activePet.id, ...(action === "report" ? { reason: reportReason } : {}), clientCode, phone };
      const response = await fetch("/api/match/interactions", { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(actionBody) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || (ar ? "تعذر تنفيذ الطلب." : "Could not process this action."));
      setFeedback(action === "like" ? (ar ? "تم إرسال طلب التواصل لصاحب الحيوان. تابع الرد في صندوق التواصل." : "Your adoption inquiry was sent. Check your inbox for a reply.") : action === "report" ? (ar ? "تم استلام البلاغ للمراجعة." : "Report submitted for review.") : action === "block" ? (ar ? "تم حظر صاحب الملف." : "Profile owner blocked.") : (ar ? "تم التخطي." : "Skipped."));
      setReporting(false); setReportReason("");
    } catch (cause) { setFeedback(cause instanceof Error ? cause.message : (ar ? "سجّل الدخول للتفاعل مع الملفات." : "Sign in to interact with listings.")); }
  }

  const t = ar ? {
    back: "العودة إلى VETRA Tinder", title: "حيوانات للتبني", subtitle: "ابحث عن رفيق جديد يناسب بيتك وأسرتك.", search: "ابحث بالاسم أو النوع أو الفصيلة أو اللون أو المدينة…",
    all: "الكل", species: "النوع", breeds: "الفصيلة", colors: "اللون", photos: "الصور", withPhotos: "بصور", withoutPhotos: "بدون صور",
    dog: "كلب", cat: "قط", other: "أخرى", demo: "ملف تجريبي", count: "نتيجة", empty: "لا توجد حيوانات تطابق البحث والفلاتر.", loading: "جاري تحميل الحيوانات…", refresh: "تحديث", noPhoto: "لا توجد صورة", demoNotice: "الملفات التي تحمل علامة تجريبي أمثلة خيالية للعرض فقط، وليست حيوانات متاحة فعليًا للتبني.", age: "العمر", city: "المدينة", skip: "حيوان آخر", like: "مهتم", demoAction: "ده بروفايل تجريبي؛ مفيش تواصل أو طلب تبنٍ فعلي متاح.", pendingAction: "طلب التواصل لسه مش متاح على الملفات الحقيقية.",
  } : {
    back: "Back to VETRA Tinder", title: "Pets for adoption", subtitle: "Find a new companion that fits your home and family.", search: "Search by name, species, breed, color, or city…",
    all: "All", species: "Species", breeds: "Breed", colors: "Color", photos: "Photos", withPhotos: "With photos", withoutPhotos: "No photos",
    dog: "Dog", cat: "Cat", other: "Other", demo: "DEMO PROFILE", count: "results", empty: "No pets match your search and filters.", loading: "Loading pets…", refresh: "Refresh", noPhoto: "No photo", demoNotice: "Profiles marked DEMO are fictional examples for display only. They are not real animals available for adoption.", age: "Age", city: "City", skip: "Next pet", like: "Interested", demoAction: "This is a demo profile. Adoption requests and contact are not available.", pendingAction: "Contact requests are not available for real profiles yet.",
  };

  return (
    <main dir={ar ? "rtl" : "ltr"} className="min-h-screen bg-[#FAF8F4] px-4 py-5 text-[#17324D] sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link href={`/client-interface/${id}/match`} className="inline-flex min-h-11 items-center rounded-full border border-[#E7EAE6] bg-white px-4 text-sm font-bold text-[#138780] shadow-sm">{ar ? "→" : "←"} {t.back}</Link>
          <div className="flex gap-2">
            <button type="button" onClick={() => void loadListings()} className="min-h-11 rounded-full bg-[#138780] px-4 text-sm font-black text-white">{t.refresh}</button>
            <button type="button" onClick={() => setLanguage(ar ? "en" : "ar")} className="min-h-11 rounded-full border border-[#E7EAE6] bg-white px-4 text-sm font-bold">{ar ? "English" : "العربية"}</button>
          </div>
        </header>

        <section className="rounded-[2rem] border border-[#E7EAE6] bg-white p-5 shadow-[0_18px_55px_rgba(23,50,77,.08)] sm:p-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex items-center gap-3"><Image src="/vetra-tinder-logo.png" alt="VETRA Tinder" width={72} height={72} className="h-16 w-16 object-contain"/><div><p className="text-xs font-black uppercase tracking-[.18em] text-[#138780]">VETRA TINDER · ADOPTION</p><h1 className="mt-2 text-3xl font-black sm:text-4xl">{t.title}</h1><p className="mt-2 text-sm text-[#657585]">{t.subtitle}</p></div></div>
            <span className="rounded-full bg-[#E6F6F0] px-3 py-2 text-sm font-black text-[#138780]">{filtered.length} {t.count}</span>
          </div>

          <div role="note" className="mt-5 rounded-2xl border border-[#BFE8DB] bg-[#E6F6F0] p-3 text-xs leading-6 text-[#275A5B]">{t.demoNotice}</div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <label className="sm:col-span-2 lg:col-span-1"><span className="mb-1 block text-xs font-bold text-[#657585]">{ar ? "بحث" : "Search"}</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t.search} className="min-h-11 w-full rounded-xl border border-[#E7EAE6] bg-[#F4FBF8] px-3 text-sm outline-none focus:border-[#138780]" /></label>
            <label><span className="mb-1 block text-xs font-bold text-[#657585]">{t.species}</span><select value={species} onChange={(event) => setSpecies(event.target.value)} className="min-h-11 w-full rounded-xl border border-[#E7EAE6] bg-[#F4FBF8] px-3 text-sm"><option value="all">{t.all}</option><option value="cat">{t.cat}</option><option value="dog">{t.dog}</option><option value="other">{t.other}</option></select></label>
            <label><span className="mb-1 block text-xs font-bold text-[#657585]">{t.breeds}</span><select value={breed} onChange={(event) => setBreed(event.target.value)} className="min-h-11 w-full rounded-xl border border-[#E7EAE6] bg-[#F4FBF8] px-3 text-sm"><option value="all">{t.all}</option>{breeds.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label><span className="mb-1 block text-xs font-bold text-[#657585]">{t.colors}</span><select value={color} onChange={(event) => setColor(event.target.value)} className="min-h-11 w-full rounded-xl border border-[#E7EAE6] bg-[#F4FBF8] px-3 text-sm"><option value="all">{t.all}</option>{colors.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label><span className="mb-1 block text-xs font-bold text-[#657585]">{t.photos}</span><select value={photoFilter} onChange={(event) => setPhotoFilter(event.target.value)} className="min-h-11 w-full rounded-xl border border-[#E7EAE6] bg-[#F4FBF8] px-3 text-sm"><option value="all">{t.all}</option><option value="with">{t.withPhotos}</option><option value="without">{t.withoutPhotos}</option></select></label>
          </div>

          {error && <p role="alert" className="mt-5 rounded-xl bg-[#C74646]/10 p-4 text-sm font-semibold text-[#A83232]">{error}</p>}
          {loading && <p className="py-12 text-center text-sm font-semibold text-[#657585]">{t.loading}</p>}
          {!loading && !error && filtered.length === 0 && <p className="py-12 text-center text-sm font-semibold text-[#657585]">{t.empty}</p>}
          {!loading && !error && activePet && <div className="mx-auto mt-7 max-w-md">
            <article key={activePet.id} className="relative h-[min(68vh,620px)] min-h-[440px] overflow-hidden rounded-[2rem] bg-[#138780] shadow-[0_28px_70px_rgba(23,50,77,.20)] ring-1 ring-white/70">
              {activePet.photo_url ? <Image src={activePet.photo_url} alt={activePet.name} fill unoptimized sizes="(max-width: 640px) 100vw, 448px" className="object-cover" priority /> : <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#BFE8DB] via-[#138780] to-[#138780]"><span className="text-[8rem] drop-shadow-xl" aria-hidden="true">{activePet.species === "cat" ? "🐱" : activePet.species === "dog" ? "🐶" : "🐾"}</span><span className="absolute bottom-36 rounded-full bg-white/20 px-3 py-1 text-xs font-bold text-white">{t.noPhoto}</span></div>}
              <div className="absolute inset-0 bg-gradient-to-t from-[#25151B]/90 via-[#25151B]/10 to-black/10" />
              {activePet.is_demo && <span className="absolute start-5 top-5 rounded-full border border-white/40 bg-white/90 px-3 py-1.5 text-[10px] font-black tracking-wider text-[#275A5B]">{t.demo}</span>}
              <div className="absolute inset-x-0 bottom-0 p-6 text-white sm:p-7">
                <div className="mb-2 flex items-center gap-2"><span className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold backdrop-blur">{activePet.species === "cat" ? t.cat : activePet.species === "dog" ? t.dog : t.other}</span><span className="text-sm text-white/85">{activePet.city}</span></div>
                <h2 className="text-4xl font-black drop-shadow">{activePet.name}<span className="ms-2 text-lg font-semibold">{activePet.age_label}</span></h2>
                <p className="mt-1 text-sm font-bold text-white/90">{activePet.breed || t.other}{activePet.color ? ` · ${activePet.color}` : ""}</p>
                <p className="mt-3 line-clamp-3 text-sm leading-6 text-white/90">{activePet.description}</p>
              </div>
            </article>
            <div className="mt-5 flex items-center justify-center gap-5">
            <button type="button" aria-label={t.skip} onClick={() => { void interact("pass"); setActiveIndex((index) => (index + 1) % filtered.length); }} className="flex h-14 w-14 items-center justify-center rounded-full border border-[#E7EAE6] bg-white text-2xl font-bold text-[#8B7A82] shadow-lg transition hover:-translate-y-1 hover:text-[#138780]">×</button>
              <span className="min-w-20 text-center text-sm font-black text-[#657585]">{activeIndex % filtered.length + 1} / {filtered.length}</span>
            <button type="button" aria-label={t.like} onClick={() => void interact("like")} className="flex h-16 w-16 items-center justify-center rounded-full bg-[#138780] text-3xl text-white shadow-[0_12px_28px_rgba(19,135,128,.28)] transition hover:-translate-y-1 hover:bg-[#0F716B]">♥</button>
            </div>
            <div className="mt-3 flex flex-wrap justify-center gap-3 text-xs font-bold text-[#657585]"><button type="button" onClick={() => setReporting((value) => !value)} className="underline">{ar ? "الإبلاغ عن الملف" : "Report profile"}</button><button type="button" onClick={() => { if (window.confirm(ar ? "حظر صاحب هذا الملف؟ لن تظهر تفاعلاته في محادثاتك." : "Block this profile owner?")) void interact("block"); }} className="underline">{ar ? "حظر" : "Block"}</button><Link href={`/client-interface/${id}/match/inbox`} className="underline">{ar ? "صندوق التواصل" : "Inbox"}</Link></div>
            {reporting && <form onSubmit={(event) => { event.preventDefault(); void interact("report"); }} className="mt-3 flex gap-2"><input required minLength={5} maxLength={1000} value={reportReason} onChange={(event) => setReportReason(event.target.value)} placeholder={ar ? "سبب البلاغ" : "Reason"} className="min-h-10 min-w-0 flex-1 rounded-lg border border-[#E7EAE6] px-3 text-sm"/><button className="rounded-lg bg-[#138780] px-3 text-xs font-bold text-white">{ar ? "إرسال" : "Submit"}</button></form>}
            {feedback && <p role="status" className="mt-3 rounded-xl bg-[#E6F6F0] p-3 text-center text-xs font-bold text-[#275A5B]">{feedback}</p>}
          </div>}
        </section>
      </div>
    </main>
  );
}
