"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { vetraCore } from "@/lib/vetra-core";

type Lang = "ar" | "en";
type Credentials = { id: string; clientCode: string; phone: string };
type Pet = { id: string; name: string; species: string; breed: string | null; gender: string | null; is_deceased: boolean | null };
type Candidate = { id: string; name: string; species: "cat" | "dog"; breed: string | null; color: string | null; age_label: string; gender: string; city: string; description: string; photo_url: string | null; is_demo: boolean; health_review_status: string };

function ownerCredentials(): Credentials | null {
  for (const store of [window.localStorage, window.sessionStorage]) {
    const id = store.getItem("vetra-client-id");
    const clientCode = store.getItem("vetra-client-code");
    const phone = store.getItem("vetra-client-phone");
    if (id && clientCode && phone) return { id, clientCode, phone };
  }
  return null;
}

export default function BreedingListingsPage() {
  const { id } = useParams<{ id: string }>();
  const [lang, setLang] = useState<Lang>("ar");
  const [owner, setOwner] = useState<Credentials | null>(null);
  const [externalToken, setExternalToken] = useState("");
  const [pets, setPets] = useState<Pet[]>([]);
  const [petId, setPetId] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loadingPets, setLoadingPets] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [breed, setBreed] = useState("all");
  const [color, setColor] = useState("all");
  const [photo, setPhoto] = useState("all");
  const [activeIndex, setActiveIndex] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [reporting, setReporting] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const ar = lang === "ar";

  const loadPets = useCallback(async () => {
    const { data: authData } = await vetraCore.auth.getSession();
    const externalSession = authData.session;
    if (externalSession?.user.email_confirmed_at) {
      setExternalToken(externalSession.access_token);
      const profileResponse = await fetch("/api/match/profile", { headers: { Authorization: `Bearer ${externalSession.access_token}` }, cache: "no-store" });
      const profileResult = await profileResponse.json();
      if (!profileResponse.ok || !profileResult.profile) { setOwner(null); setPets([]); setLoadingPets(false); return; }
      const externalPets = (profileResult.pets || []).map((pet: Pet) => ({ ...pet, is_deceased: false }));
      setOwner({ id, clientCode: "", phone: "" }); setPets(externalPets);
      const requestedPetId = new URLSearchParams(window.location.search).get("petId");
      setPetId((old) => requestedPetId && externalPets.some((pet: Pet) => pet.id === requestedPetId) ? requestedPetId : externalPets.some((pet: Pet) => pet.id === old) ? old : externalPets[0]?.id || "");
      setLoadingPets(false); return;
    }
    const session = ownerCredentials();
    if (!session || session.id !== id) { setOwner(null); setPets([]); setLoadingPets(false); return; }
    setOwner(session); setLoadingPets(true); setError("");
    try {
      const response = await fetch(`/api/client-interface/${encodeURIComponent(id)}/match`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "load", clientCode: session.clientCode, phone: session.phone }), cache: "no-store",
      });
      const result = await response.json() as { pets?: Pet[]; error?: string };
      if (!response.ok) throw new Error(result.error || "Could not load pets");
      const owned = (result.pets || []).filter((pet) => !pet.is_deceased);
      const requestedPetId = new URLSearchParams(window.location.search).get("petId");
      setPets(owned); setPetId((old) => requestedPetId && owned.some((pet) => pet.id === requestedPetId) ? requestedPetId : owned.some((pet) => pet.id === old) ? old : owned[0]?.id || "");
    } catch (cause) { setError(cause instanceof Error ? cause.message : (ar ? "تعذر تحميل حيواناتك." : "Could not load your pets.")); }
    finally { setLoadingPets(false); }
  }, [ar, id]);

  const loadCandidates = useCallback(async (sourcePetId: string, session: Credentials) => {
    setLoading(true); setError(""); setCandidates([]);
    try {
      const response = await fetch(`/api/client-interface/${encodeURIComponent(id)}/match/breeding`, {
        method: "POST", headers: { "Content-Type": "application/json", ...(externalToken ? { Authorization: `Bearer ${externalToken}` } : {}) },
        body: JSON.stringify({ clientCode: session.clientCode, phone: session.phone, petId: sourcePetId }), cache: "no-store",
      });
      const result = await response.json() as { listings?: Candidate[]; error?: string };
      if (!response.ok) throw new Error(result.error || (ar ? "تعذر تحميل ملفات التزاوج." : "Could not load profiles."));
      setCandidates(result.listings || []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : (ar ? "تعذر تحميل الملفات." : "Could not load profiles.")); }
    finally { setLoading(false); }
  }, [ar, externalToken, id]);

  useEffect(() => {
    const saved = window.localStorage.getItem("vetra-language");
    // Restore the portal language after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved === "ar" || saved === "en") setLang(saved);
    void loadPets();
  }, [loadPets]);
  // Fetch the server-verified, same-species candidate list when the selected pet changes.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (owner && petId) void loadCandidates(petId, owner); }, [owner, petId, loadCandidates]);

  const selectedPet = pets.find((pet) => pet.id === petId) || null;
  const breeds = useMemo(() => [...new Set(candidates.map((item) => item.breed).filter((value): value is string => Boolean(value)))].sort(), [candidates]);
  const colors = useMemo(() => [...new Set(candidates.map((item) => item.color).filter((value): value is string => Boolean(value)))].sort(), [candidates]);
  const shown = useMemo(() => {
    const q = query.trim().toLocaleLowerCase(ar ? "ar" : "en");
    return candidates.filter((item) => (!q || [item.name, item.breed, item.color, item.city, item.description].some((value) => value?.toLocaleLowerCase(ar ? "ar" : "en").includes(q)))
      && (breed === "all" || item.breed === breed) && (color === "all" || item.color === color)
      && (photo === "all" || (photo === "yes" ? Boolean(item.photo_url) : !item.photo_url)));
  }, [ar, breed, candidates, color, photo, query]);
  const activeCandidate = shown.length ? shown[activeIndex % shown.length] : null;

  const t = ar ? {
    back: "العودة إلى VETRA Tinder", title: "التزاوج المسؤول", subtitle: "اختار حيوانك المسجل لعرض ملفات من النوع نفسه فقط.", choose: "حيوانك المسجل", search: "بحث بالاسم أو الفصيلة أو اللون أو المدينة…", breed: "الفصيلة", color: "اللون", photos: "الصور", all: "الكل", yes: "بصور", no: "بدون صور", demo: "بروفايل تجريبي", age: "العمر", city: "المدينة", empty: "لا توجد ملفات مطابقة منشورة لهذا النوع حاليًا.", loading: "جاري تحميل الملفات…", count: "ملف", noPhoto: "بدون صورة", noPets: "لا توجد حيوانات حية مسجلة على حسابك.", addPet: "إضافة حيوان", signIn: "سجّل الدخول بحساب العميل لعرض حيواناتك.", warning: "البروفايلات التجريبية للعرض واختبار الفلاتر فقط؛ ليست حيوانات حقيقية أو مؤهلة للتزاوج. لا تظهر توصيات أو وسائل تواصل قبل المراجعة البيطرية والتحقق من التوافق.", reviewed: "مراجعة بيطرية مكتملة — يلزم التحقق من التوافق قبل أي تواصل.",
  } : {
    back: "Back to VETRA Tinder", title: "Responsible breeding", subtitle: "Select your registered pet to see profiles of the same species only.", choose: "Your registered pet", search: "Search name, breed, color, or city…", breed: "Breed", color: "Color", photos: "Photos", all: "All", yes: "With photos", no: "Without photos", demo: "DEMO PROFILE", age: "Age", city: "City", empty: "No published profiles match this species yet.", loading: "Loading profiles…", count: "profiles", noPhoto: "No photo", noPets: "There are no living pets registered to your account.", addPet: "Add a pet", signIn: "Sign in to your client account to see your pets.", warning: "Demo profiles are for display and filter testing only; they are not real or breeding-eligible animals. No recommendations or contact details are shown before veterinary review and compatibility checks.", reviewed: "Veterinary review complete — compatibility checks are still required before contact.",
  };
  const loginHref = `/client-interface/login?next=${encodeURIComponent(`/client-interface/${id}/match/breeding`)}`;

  async function interact(action: "like" | "pass" | "report" | "block") {
    if (!activeCandidate) return;
    try {
      const { data } = await vetraCore.auth.getSession();
      const clientCode = window.localStorage.getItem("vetra-client-code") || window.sessionStorage.getItem("vetra-client-code") || "";
      const phone = window.localStorage.getItem("vetra-client-phone") || window.sessionStorage.getItem("vetra-client-phone") || "";
      const response = await fetch("/api/match/interactions", { method: "POST", headers: { "Content-Type": "application/json", ...(data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {}) }, body: JSON.stringify({ action, type: "breeding", listingId: activeCandidate.id, ...(action === "report" ? { reason: reportReason } : {}), clientCode, phone }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "تعذر تنفيذ الطلب.");
      setFeedback(action === "like" ? (result.matched ? "حصل توافق متبادل. راجع صندوق التواصل." : "تم حفظ اهتمامك. لن يتم التواصل قبل استيفاء المراجعات.") : action === "report" ? "تم استلام البلاغ للمراجعة." : action === "block" ? "تم حظر صاحب الملف." : "تم التخطي.");
      setReporting(false); setReportReason("");
    } catch (cause) { setFeedback(cause instanceof Error ? cause.message : "تعذر تنفيذ الطلب."); }
  }

  return <main dir={ar ? "rtl" : "ltr"} className="min-h-screen bg-[#FAF8F4] px-4 py-5 text-[#17324D] sm:px-6 sm:py-8"><div className="mx-auto max-w-6xl">
    <header className="mb-6 flex flex-wrap items-center justify-between gap-3"><Link href={`/client-interface/${id}/match`} className="inline-flex min-h-11 items-center rounded-full border border-[#E7EAE6] bg-white px-4 text-sm font-bold">{ar ? "→" : "←"} {t.back}</Link><button type="button" onClick={() => setLang(ar ? "en" : "ar")} className="min-h-11 rounded-full border border-[#E7EAE6] bg-white px-4 text-sm font-bold">{ar ? "English" : "العربية"}</button></header>
    <section className="rounded-[2rem] border border-[#E7EAE6] bg-white p-5 shadow-[0_18px_55px_rgba(23,50,77,.08)] sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4"><div className="flex items-center gap-3"><Image src="/vetra-tinder-logo.png" alt="VETRA Tinder" width={72} height={72} className="h-16 w-16 object-contain"/><div><p className="text-xs font-black uppercase tracking-[.18em] text-[#138780]">VETRA TINDER · BREEDING</p><h1 className="mt-2 text-3xl font-black sm:text-4xl">{t.title}</h1><p className="mt-2 text-sm text-[#657585]">{t.subtitle}</p></div></div><span className="rounded-full bg-[#E6F6F0] px-3 py-2 text-sm font-black text-[#138780]">{shown.length} {t.count}</span></div>
      <div role="note" className="mt-5 rounded-2xl border border-[#BFE8DB] bg-[#E6F6F0] p-3 text-xs leading-6 text-[#275A5B]">{t.warning}</div>
      {loadingPets ? <p className="py-10 text-center text-sm text-[#657585]">{t.loading}</p> : !owner ? <div className="mt-5 rounded-2xl border border-[#E7EAE6] bg-[#F4FBF8] p-5"><p className="text-sm text-[#657585]">{t.signIn}</p><Link href={loginHref} className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-[#138780] px-5 text-sm font-black text-white">{ar ? "تسجيل الدخول" : "Sign in"}</Link></div> : pets.length === 0 ? <div className="mt-5 rounded-2xl border border-dashed border-[#F0CCD4] p-7 text-center"><p className="text-sm text-[#657585]">{t.noPets}</p><Link href={`/client-interface/${id}?addPet=1`} className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-[#138780] px-5 text-sm font-black text-white">{t.addPet}</Link></div> : <>
        <label className="mt-5 block max-w-xl"><span className="mb-1 block text-xs font-bold text-[#657585]">{t.choose}</span><select value={petId} onChange={(event) => { setPetId(event.target.value); setBreed("all"); setColor("all"); }} className="min-h-12 w-full rounded-xl border border-[#E7EAE6] bg-[#F4FBF8] px-3 text-sm">{pets.map((pet) => <option key={pet.id} value={pet.id}>{pet.name} · {pet.species}{pet.breed ? ` · ${pet.breed}` : ""}</option>)}</select></label>
        {selectedPet && <p className="mt-2 text-xs text-[#657585]">{ar ? "سيتم عرض نوع مطابق لحيوانك فقط:" : "Only the same species as your pet is shown:"} <b>{selectedPet.species}</b></p>}
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="sm:col-span-2"><span className="mb-1 block text-xs font-bold text-[#657585]">{ar ? "بحث" : "Search"}</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.search} className="min-h-11 w-full rounded-xl border border-[#E7EAE6] bg-[#F4FBF8] px-3 text-sm outline-none focus:border-[#138780]" /></label>
          <label><span className="mb-1 block text-xs font-bold text-[#657585]">{t.breed}</span><select value={breed} onChange={(event) => setBreed(event.target.value)} className="min-h-11 w-full rounded-xl border border-[#E7EAE6] bg-[#F4FBF8] px-3 text-sm"><option value="all">{t.all}</option>{breeds.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label><span className="mb-1 block text-xs font-bold text-[#657585]">{t.color}</span><select value={color} onChange={(event) => setColor(event.target.value)} className="min-h-11 w-full rounded-xl border border-[#E7EAE6] bg-[#F4FBF8] px-3 text-sm"><option value="all">{t.all}</option>{colors.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label><span className="mb-1 block text-xs font-bold text-[#657585]">{t.photos}</span><select value={photo} onChange={(event) => setPhoto(event.target.value)} className="min-h-11 w-full rounded-xl border border-[#E7EAE6] bg-[#F4FBF8] px-3 text-sm"><option value="all">{t.all}</option><option value="yes">{t.yes}</option><option value="no">{t.no}</option></select></label>
        </div>
        {error && <p role="alert" className="mt-5 rounded-xl bg-[#C74646]/10 p-4 text-sm font-semibold text-[#A83232]">{error}</p>}
        {loading && <p className="py-10 text-center text-sm text-[#657585]">{t.loading}</p>}
        {!loading && !error && shown.length === 0 && <p className="py-12 text-center text-sm font-semibold text-[#657585]">{t.empty}</p>}
        {!loading && !error && activeCandidate && <div className="mx-auto mt-7 max-w-md">
          <article key={activeCandidate.id} className="relative h-[min(68vh,620px)] min-h-[440px] overflow-hidden rounded-[2rem] bg-[#138780] shadow-[0_28px_70px_rgba(23,50,77,.20)] ring-1 ring-white/70">
            {activeCandidate.photo_url ? <Image src={activeCandidate.photo_url} alt={activeCandidate.name} fill unoptimized sizes="(max-width: 640px) 100vw, 448px" className="object-cover" priority /> : <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#BFE8DB] via-[#138780] to-[#138780]"><span className="text-[8rem] drop-shadow-xl" aria-hidden="true">{activeCandidate.species === "cat" ? "🐱" : "🐶"}</span><span className="absolute bottom-36 rounded-full bg-white/20 px-3 py-1 text-xs font-bold text-white">{t.noPhoto}</span></div>}
            <div className="absolute inset-0 bg-gradient-to-t from-[#25151B]/90 via-[#25151B]/10 to-black/10" />
            {activeCandidate.is_demo && <span className="absolute start-5 top-5 rounded-full border border-white/40 bg-white/90 px-3 py-1.5 text-[10px] font-black tracking-wider text-[#275A5B]">{t.demo}</span>}
            <div className="absolute inset-x-0 bottom-0 p-6 text-white sm:p-7"><div className="mb-2 flex items-center gap-2"><span className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold backdrop-blur">{activeCandidate.species === "cat" ? (ar ? "قط" : "Cat") : (ar ? "كلب" : "Dog")}</span><span className="text-sm text-white/85">{activeCandidate.city}</span></div><h2 className="text-4xl font-black drop-shadow">{activeCandidate.name}<span className="ms-2 text-lg font-semibold">{activeCandidate.age_label}</span></h2><p className="mt-1 text-sm font-bold text-white/90">{activeCandidate.breed || t.all}{activeCandidate.color ? ` · ${activeCandidate.color}` : ""}</p><p className="mt-3 line-clamp-3 text-sm leading-6 text-white/90">{activeCandidate.description}</p></div>
          </article>
          <div className="mt-5 flex items-center justify-center gap-5"><button type="button" aria-label={ar ? "تخطي" : "Skip"} onClick={() => { void interact("pass"); setActiveIndex((index) => (index + 1) % shown.length); }} className="flex h-14 w-14 items-center justify-center rounded-full border border-[#E7EAE6] bg-white text-2xl font-bold text-[#8B7A82] shadow-lg transition hover:-translate-y-1 hover:text-[#138780]">×</button><span className="min-w-20 text-center text-sm font-black text-[#657585]">{activeIndex % shown.length + 1} / {shown.length}</span><button type="button" aria-label={ar ? "مهتم" : "Interested"} onClick={() => void interact("like")} className="flex h-16 w-16 items-center justify-center rounded-full bg-[#138780] text-3xl text-white shadow-[0_12px_28px_rgba(19,135,128,.28)] transition hover:-translate-y-1 hover:bg-[#0F716B]">♥</button></div>
          <div className="mt-3 flex justify-center gap-4 text-xs font-bold text-[#657585]"><button type="button" onClick={() => setReporting((value) => !value)} className="underline">{ar ? "الإبلاغ" : "Report"}</button><button type="button" onClick={() => { if (window.confirm(ar ? "حظر صاحب هذا الملف؟" : "Block this profile owner?")) void interact("block"); }} className="underline">{ar ? "حظر" : "Block"}</button><Link href={`/client-interface/${id}/match/inbox`} className="underline">{ar ? "صندوق التواصل" : "Inbox"}</Link></div>
          {reporting && <form onSubmit={(event) => { event.preventDefault(); void interact("report"); }} className="mt-3 flex gap-2"><input required minLength={5} maxLength={1000} value={reportReason} onChange={(event) => setReportReason(event.target.value)} placeholder={ar ? "سبب البلاغ" : "Reason"} className="min-h-10 min-w-0 flex-1 rounded-lg border border-[#E7EAE6] px-3 text-sm"/><button className="rounded-lg bg-[#138780] px-3 text-xs font-bold text-white">{ar ? "إرسال" : "Send"}</button></form>}
          {feedback && <p role="status" className="mt-3 rounded-xl bg-[#E6F6F0] p-3 text-center text-xs font-bold text-[#275A5B]">{feedback}</p>}
        </div>}
        {!loading && !error && shown.length > 0 && <div className="hidden mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{shown.map((candidate) => <article key={candidate.id} className="overflow-hidden rounded-2xl border border-[#E7EAE6] bg-white shadow-sm">
          <div className="relative flex h-52 items-center justify-center overflow-hidden bg-gradient-to-br from-[#E6F6F0] to-[#FAF8F4]">{candidate.photo_url ? <Image src={candidate.photo_url} alt={candidate.name} fill unoptimized sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" className="object-cover" /> : <div className="text-center text-[#657585]"><span className="block text-6xl" aria-hidden="true">{candidate.species === "cat" ? "🐱" : "🐶"}</span><span className="mt-2 block text-xs font-semibold">{t.noPhoto}</span></div>}{candidate.is_demo && <span className="absolute start-3 top-3 rounded-full bg-[#E6F6F0] px-3 py-1.5 text-[10px] font-black text-[#275A5B]">{t.demo}</span>}</div>
          <div className="p-4"><h2 className="text-lg font-black">{candidate.name}</h2><p className="mt-2 text-sm text-[#657585]">{candidate.breed || t.all}{candidate.color ? ` · ${candidate.color}` : ""}</p><p className="mt-1 text-xs text-[#657585]">{t.age}: {candidate.age_label} · {t.city}: {candidate.city}</p><p className="mt-3 text-sm leading-6 text-[#695960]">{candidate.description}</p>{!candidate.is_demo && <p className="mt-3 rounded-lg bg-[#E6F6F0] p-2 text-xs font-bold text-[#138780]">{t.reviewed}</p>}</div>
        </article>)}</div>}
      </>}
    </section>
  </div></main>;
}
