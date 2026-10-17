"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { vetraCore } from "@/lib/vetra-core";

type Language = "ar" | "en";
type Pet = {
  id: string;
  name: string;
  species: string;
  breed: string | null;
  gender: string | null;
  birth_date: string | null;
  ageYears: number | null;
  photo_url: string | null;
  is_deceased: boolean | null;
};
type OwnerCredentials = { id: string; clientCode: string; phone: string };
type ExternalProfile = { user_id: string; display_name: string };

function getOwnerCredentials(): OwnerCredentials | null {
  for (const storage of [window.localStorage, window.sessionStorage]) {
    const id = storage.getItem("vetra-client-id");
    const clientCode = storage.getItem("vetra-client-code");
    const phone = storage.getItem("vetra-client-phone");
    if (id && clientCode && phone) return { id, clientCode, phone };
  }
  return null;
}

function CheckIcon() {
  return <svg aria-hidden="true" viewBox="0 0 20 20" className="mt-0.5 h-4 w-4 shrink-0 text-[#138780]" fill="none" stroke="currentColor" strokeWidth="2"><path d="m4 10 4 4 8-8" /></svg>;
}

export default function VetraTinderWelcomePage() {
  const { id: clientId } = useParams<{ id: string }>();
  const [language, setLanguage] = useState<Language>("ar");
  const [credentials, setCredentials] = useState<OwnerCredentials | null>(null);
  const [externalProfile, setExternalProfile] = useState<ExternalProfile | null>(null);
  const [pets, setPets] = useState<Pet[]>([]);
  const [selectedPetId, setSelectedPetId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showExternalInfo, setShowExternalInfo] = useState(false);

  const ar = language === "ar";
  const loginHref = `/client-interface/login?next=${encodeURIComponent(`/client-interface/${clientId}/match`)}`;

  const loadPets = useCallback(async () => {
    const current = getOwnerCredentials();
    if (!current || current.id !== clientId) {
      setCredentials(null);
      setPets([]);
      setLoading(true);
      try {
        const { data: sessionData } = await vetraCore.auth.getSession();
        const session = sessionData.session;
        if (session?.user.email_confirmed_at) {
          const response = await fetch("/api/match/profile", { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
          const result = await response.json() as { profile?: ExternalProfile | null; pets?: Array<Pet & { city?: string }> ; error?: string };
          if (response.ok && result.profile) {
            setExternalProfile(result.profile);
            const externalPets = result.pets || [];
            setPets(externalPets.map((pet) => ({ ...pet, ageYears: pet.birth_date ? Math.max(0, Math.floor((Date.now() - new Date(pet.birth_date).getTime()) / (365.2425 * 86_400_000))) : null, is_deceased: false })));
            setSelectedPetId((previous) => externalPets.some((pet) => pet.id === previous) ? previous : externalPets[0]?.id || "");
          } else setExternalProfile(null);
        } else setExternalProfile(null);
      } catch { setExternalProfile(null); }
      finally { setLoading(false); }
      return;
    }

    setExternalProfile(null);
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/client-interface/${encodeURIComponent(clientId)}/match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "load", clientCode: current.clientCode, phone: current.phone }),
        cache: "no-store",
      });
      const result = await response.json() as { pets?: Pet[]; error?: string };
      if (response.status === 401 || response.status === 403) {
        setCredentials(null);
        setPets([]);
        if (response.status === 403) setError(ar ? "جلسة العميل لا تطابق هذا الحساب. سجّل الدخول إلى حسابك الصحيح." : "This session does not match this client profile. Sign in to the correct account.");
        return;
      }
      if (!response.ok) throw new Error(result.error || (ar ? "تعذر تحميل حيواناتك." : "Could not load your pets."));
      const ownedPets = result.pets || [];
      setCredentials(current);
      setPets(ownedPets);
      setSelectedPetId((previous) => ownedPets.some((pet) => pet.id === previous) ? previous : ownedPets[0]?.id || "");
    } catch (loadError) {
      setCredentials(null);
      setError(loadError instanceof Error ? loadError.message : (ar ? "تعذر التحقق من حسابك." : "Could not verify your account."));
    } finally {
      setLoading(false);
    }
  }, [ar, clientId]);

  useEffect(() => {
    const savedLanguage = window.localStorage.getItem("vetra-language");
    // Keep the initial server and client renders aligned, then restore the portal locale.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (savedLanguage === "en" || savedLanguage === "ar") setLanguage(savedLanguage);
    void loadPets();
  }, [loadPets]);

  const copy = ar ? {
    back: "العودة إلى VETRA", language: "English", title: "مرحبًا بك في VETRA Tinder",
    intro: "تعارف، تواصل، ورعاية في كل خطوة. اكتشف فرص التزاوج المسؤول أو التبني المناسب لحيوانك.",
    tagline: "MEET · MATCH · CARE", heroLine: "تعارف، تواصل، ورعاية في كل خطوة.",
    trusted: "تعارف مسؤول", community: "مجتمع موثوق", welfare: "رعاية وصحة الحيوان أولًا",
    linkedTitle: "الدخول بحساب VETRA", linkedDesc: "استخدم حسابك الحالي للوصول إلى حيواناتك المسجلة ومعلوماتك المرتبطة بحسابك.",
    linkedBadge: "حساب مرتبط بـ VETRA", login: "الدخول الآن", linkedBenefits: ["الوصول لحيواناتك المسجلة وفق صلاحيات الحساب.", "استخدام البيانات الموجودة دون إعادة إدخالها.", "تجربة متكاملة مع بوابة VETRA."],
    newTitle: "إنشاء حساب جديد", newDesc: "أنشئ حسابًا مستقلًا موثقًا بالبريد وأضف حيواناتك إلى مجتمع VETRA Tinder.",
    newBadge: "حساب مستقل", register: "إنشاء حساب", newBenefits: ["تسجيل بسيط وآمن.", "إنشاء ملفات للحيوانات.", "ميزات VETRA Tinder وفق قواعد الأمان."],
    reassurance: "نلتزم بخصوصية أصحاب الحيوانات، وإرشادات المجتمع، ومتطلبات الرفق بالحيوان.",
    linked: "حساب VETRA مرتبط", linkedNotice: "تم التحقق من ارتباط حساب العميل. هذا لا يعني التحقق من السجل الطبي أو الحالة التناسلية للحيوانات.",
    choosePet: "اختار الحيوان الذي تريد استخدامه", noPets: "لا توجد حيوانات مسجلة على حسابك بعد.", addPet: "إضافة حيوان من بوابة VETRA",
    adoption: "التبني", adoptionText: "تعرّف على حيوانات تبحث عن بيت آمن.", breeding: "التزاوج المسؤول", breedingText: "ملفات من النوع نفسه بعد مراجعة بيطرية وشروط رعاية واضحة.", browse: "استكشاف", loading: "نتحقق من حساب VETRA وحيواناتك…", tryAgain: "إعادة المحاولة",
    externalTitle: "حساب VETRA Tinder مستقل", externalBody: "أنشئ حسابًا مستقلًا بالبريد الإلكتروني الموثق، منفصلًا عن السجلات الطبية للعيادات.", externalNeed: "سيُطلب تأكيد البريد والموافقة على شروط الاستخدام والخصوصية. تسجيل الهاتف غير متاح حتى إعداد مزود رسائل موثوق.", externalClose: "إغلاق", externalExisting: "استخدم حساب عميل VETRA؟ سجّل الدخول",
  } : {
    back: "Back to VETRA", language: "العربية", title: "Welcome to VETRA Tinder",
    intro: "Meet, connect, and care at every step. Discover responsible breeding or an adoption companion for your family.",
    tagline: "MEET · MATCH · CARE", heroLine: "Meet, connect, and care at every step.",
    trusted: "Responsible introductions", community: "A trusted community", welfare: "Animal welfare comes first",
    linkedTitle: "Continue with your VETRA account", linkedDesc: "Use your current account to access your registered pets and information linked to your profile.",
    linkedBadge: "VETRA-linked account", login: "Sign in now", linkedBenefits: ["Access pets allowed for your account.", "Use existing information without entering it again.", "A connected VETRA experience."],
    newTitle: "Create a new account", newDesc: "Create an independent account verified by email and add pets to VETRA Tinder.",
    newBadge: "Independent account", register: "Create account", newBenefits: ["Simple, secure registration.", "Create pet profiles.", "VETRA Tinder features with safety rules."],
    reassurance: "We respect pet-owner privacy, community guidelines, and animal-welfare requirements.",
    linked: "VETRA account linked", linkedNotice: "Your client account relationship has been verified. This does not verify medical records or reproductive health.",
    choosePet: "Choose the pet you want to use", noPets: "There are no pets registered to your account yet.", addPet: "Add a pet in VETRA",
    adoption: "Adoption", adoptionText: "Meet animals looking for a safe home.", breeding: "Responsible breeding", breedingText: "Same-species profiles, subject to veterinary review and welfare rules.", browse: "Explore", loading: "Verifying your VETRA account and pets…", tryAgain: "Try again",
    externalTitle: "Independent VETRA Tinder account", externalBody: "Create an independent account with verified email, separate from clinic medical records.", externalNeed: "You will verify your email and accept the terms and privacy policy. Phone verification is unavailable until an SMS provider is configured.", externalClose: "Close", externalExisting: "Use a VETRA client account? Sign in",
  };

  return (
    <main dir={ar ? "rtl" : "ltr"} className="min-h-screen bg-[#FAF8F4] px-3 py-4 font-[Tahoma,Arial,sans-serif] text-[#17324D] sm:px-6 sm:py-7">
      <div className="mx-auto max-w-[1320px]">
        <header className="mb-4 flex items-center justify-between gap-3 px-1 sm:mb-6">
          <Link href={`/client-interface/${clientId}`} className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-bold text-[#17324D] transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#138780]">
            <span aria-hidden="true">{ar ? "→" : "←"}</span>{copy.back}
          </Link>
          <button type="button" onClick={() => setLanguage(ar ? "en" : "ar")} className="min-h-11 rounded-full border border-[#E7EAE6] bg-white px-4 text-sm font-bold text-[#17324D] transition hover:border-[#138780] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#138780]">
            {copy.language}
          </button>
        </header>

        <section className="grid overflow-hidden rounded-[2rem] border border-[#E7EAE6] bg-white shadow-[0_20px_70px_rgba(23,50,77,.08)] lg:min-h-[780px] lg:grid-cols-[.92fr_1.08fr]">
          <aside className="relative min-h-[300px] overflow-hidden bg-[#E6F6F0] sm:min-h-[380px] lg:min-h-full">
            <Image src="/vetra-tinder-hero.webp" alt={ar ? "كلب سعيد وقط أليف يجلسان معًا" : "A happy dog and a friendly cat sitting together"} fill priority sizes="(max-width: 1024px) 100vw, 46vw" className="object-cover object-center" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#17324D]/75 via-transparent to-[#17324D]/5" />
            <div aria-hidden="true" className="absolute -end-10 -top-12 h-48 w-48 rounded-full border-[28px] border-[#E6F6F0]/35" />
            <div aria-hidden="true" className="absolute end-7 top-7 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/90 text-[#F45B70] shadow-sm">♥</div>
            <div className="absolute inset-x-0 bottom-0 p-6 text-white sm:p-8 lg:p-9">
              <p className="text-xs font-black tracking-[.24em] text-[#D4F2E8]">{copy.tagline}</p>
              <h2 className="mt-3 max-w-md text-2xl font-black leading-tight sm:text-3xl">{copy.heroLine}</h2>
              <div className="mt-5 flex items-center gap-2 text-xs font-semibold text-white/90"><span className="h-2 w-2 rounded-full bg-[#8CD8C3]" />{ar ? "مساحة تجمع أصحاب الحيوانات حول الرفق والرعاية" : "A community built around kindness and care"}</div>
            </div>
          </aside>

          <div className="flex min-w-0 flex-col p-5 sm:p-8 lg:p-10 xl:p-12">
            <div className="flex items-center gap-3">
              <Image src="/vetra-tinder-logo.png" alt="VETRA Tinder" width={88} height={88} className="h-[68px] w-[68px] shrink-0 object-contain sm:h-[78px] sm:w-[78px]" />
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[.2em] text-[#138780]">VETRA · PET COMMUNITY</p>
                <h1 className="mt-1 text-2xl font-black leading-tight sm:text-[2rem]">{copy.title}</h1>
              </div>
            </div>

            <p className="mt-4 max-w-2xl text-sm leading-7 text-[#657585] sm:text-[15px]">{copy.intro}</p>

            <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {[copy.trusted, copy.community, copy.welfare].map((item, index) => <div key={item} className="flex min-h-10 items-center gap-2 rounded-xl bg-[#E6F6F0] px-3 py-2 text-xs font-bold text-[#275A5B]">
                <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-[#138780]">{index === 0 ? "♡" : index === 1 ? "✓" : "✦"}</span><span>{item}</span>
              </div>)}
            </div>

            {loading ? <div role="status" className="mt-7 rounded-2xl border border-[#E7EAE6] bg-[#FAF8F4] p-6 text-center text-sm font-semibold text-[#657585]">{copy.loading}</div> : externalProfile ? (
              <div className="mt-7 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#BFE8DB] bg-[#E6F6F0] p-4"><div><p className="font-black">{ar ? `مرحبًا ${externalProfile.display_name}` : `Welcome, ${externalProfile.display_name}`}</p><p className="mt-1 text-xs text-[#657585]">{ar ? "حساب Tinder مستقل موثق بالبريد" : "Independent email-verified Tinder account"}</p></div><span className="rounded-full bg-white px-3 py-1.5 text-[11px] font-black text-[#138780]">MATCH ACCOUNT</span></div>
                {pets.length ? <div><h2 className="text-sm font-black">{copy.choosePet}</h2><div className="mt-3 flex gap-2 overflow-x-auto pb-2">{pets.map((pet) => <button key={pet.id} type="button" aria-pressed={selectedPetId === pet.id} onClick={() => setSelectedPetId(pet.id)} className={`flex min-w-[170px] items-center gap-3 rounded-2xl border p-3 text-start ${selectedPetId === pet.id ? "border-[#138780] bg-[#E6F6F0]" : "border-[#E7EAE6] bg-white"}`}><span className="relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-[#F4F7F4] text-2xl">{pet.photo_url ? <Image src={pet.photo_url} alt="" fill unoptimized sizes="48px" className="object-cover"/> : "🐾"}</span><span><span className="block text-sm font-black">{pet.name}</span><span className="text-xs text-[#657585]">{pet.species}{pet.breed ? ` · ${pet.breed}` : ""}</span></span></button>)}</div></div> : <div className="rounded-2xl border border-dashed border-[#BFE8DB] bg-[#F4FBF8] p-4"><p className="text-sm font-bold text-[#657585]">{copy.noPets}</p><Link href={`/client-interface/${clientId}/match/pets/new`} className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-[#138780] px-4 text-sm font-black text-white">{ar ? "إضافة أول حيوان" : "Add your first pet"}</Link></div>}
                <div className="grid gap-3 sm:grid-cols-2"><Link href={`/client-interface/${clientId}/match/pets/new`} className="rounded-2xl border border-[#E7EAE6] p-4 text-sm font-black text-[#138780]">{ar ? "إضافة حيوان آخر" : "Add another pet"}</Link><Link href={`/client-interface/${clientId}/match/listings/new${selectedPetId ? `?petId=${encodeURIComponent(selectedPetId)}` : ""}`} className="rounded-2xl border border-[#E7EAE6] p-4 text-sm font-black text-[#138780]">{ar ? "نشر حيوان للتبني أو التزاوج" : "List a pet for adoption or breeding"}</Link><Link href={`/client-interface/${clientId}/match/inbox`} className="rounded-2xl border border-[#E7EAE6] p-4 text-sm font-black text-[#138780]">{ar ? "صندوق التواصل" : "Messages and requests"}</Link><Link href={`/client-interface/${clientId}/match/settings`} className="rounded-2xl border border-[#E7EAE6] p-4 text-sm font-black text-[#657585]">{ar ? "إعدادات الحساب" : "Account settings"}</Link></div>
                <div className="grid gap-3 sm:grid-cols-2"><Link href={`/client-interface/${clientId}/match/adoption`} className="rounded-2xl border border-[#E7EAE6] bg-white p-4"><h2 className="font-black">{copy.adoption}</h2><p className="mt-1 text-xs text-[#657585]">{copy.adoptionText}</p></Link><Link href={`/client-interface/${clientId}/match/breeding`} className="rounded-2xl border border-[#E7EAE6] bg-white p-4"><h2 className="font-black">{copy.breeding}</h2><p className="mt-1 text-xs text-[#657585]">{copy.breedingText}</p></Link></div>
              </div>
            ) : credentials ? (
              <div className="mt-7 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#BFE8DB] bg-[#E6F6F0] p-4">
                  <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[#138780]">✓</span><div><p className="font-black">{copy.linked}</p><p className="mt-1 text-xs text-[#657585]">{copy.linkedNotice}</p></div></div>
                  <span className="rounded-full border border-[#BFE8DB] bg-white px-3 py-1.5 text-[11px] font-black text-[#138780]">VETRA LINKED</span>
                </div>

                {error && <p role="alert" className="rounded-xl border border-[#F3C8CE] bg-[#FFF0F1] p-3 text-sm font-semibold text-[#9D4351]">{error}<button type="button" onClick={() => void loadPets()} className="ms-2 underline">{copy.tryAgain}</button></p>}

                {pets.length > 0 ? <div>
                  <h2 className="text-sm font-black">{copy.choosePet}</h2>
                  <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
                    {pets.map((pet) => <button key={pet.id} type="button" aria-pressed={selectedPetId === pet.id} onClick={() => setSelectedPetId(pet.id)} className={`flex min-w-[170px] items-center gap-3 rounded-2xl border p-3 text-start transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#138780] ${selectedPetId === pet.id ? "border-[#138780] bg-[#E6F6F0] shadow-sm" : "border-[#E7EAE6] bg-white hover:border-[#BFE8DB]"}`}>
                      <span className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#F4F7F4] text-2xl">{pet.photo_url ? <Image src={pet.photo_url} alt="" fill unoptimized sizes="48px" className="object-cover" /> : pet.species.toLowerCase().includes("cat") ? "🐱" : pet.species.toLowerCase().includes("dog") ? "🐶" : "🐾"}</span>
                      <span className="min-w-0"><span className="block truncate text-sm font-black">{pet.name}</span><span className="mt-1 block truncate text-[11px] text-[#657585]">{pet.species}{pet.breed ? ` · ${pet.breed}` : ""}</span></span>
                    </button>)}
                  </div>
                </div> : <div className="rounded-2xl border border-dashed border-[#DCE7E1] bg-[#FAF8F4] p-4"><p className="text-sm font-bold text-[#657585]">{copy.noPets}</p><Link href={`/client-interface/${clientId}?addPet=1`} className="mt-3 inline-flex min-h-11 items-center justify-center rounded-xl bg-[#138780] px-4 text-sm font-black text-white transition hover:bg-[#0F716B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#138780]">{copy.addPet}</Link></div>}

                <div className="grid gap-3 sm:grid-cols-2">
                  <Link href={`/client-interface/${clientId}/match/listings/new${selectedPetId ? `?petId=${encodeURIComponent(selectedPetId)}` : ""}`} className="rounded-2xl border border-[#BFE8DB] bg-[#F4FBF8] p-4 text-sm font-black text-[#138780]">{ar ? "نشر حيوان للتبني أو التزاوج" : "List a pet for adoption or breeding"}</Link>
                  <Link href={`/client-interface/${clientId}/match/inbox`} className="rounded-2xl border border-[#E7EAE6] bg-white p-4 text-sm font-black text-[#138780]">{ar ? "طلبات التواصل والمحادثات" : "Messages and requests"}</Link>
                  <Link href={`/client-interface/${clientId}/match/settings`} className="rounded-2xl border border-[#E7EAE6] bg-white p-4 text-sm font-black text-[#657585]">{ar ? "إدارة بيانات VETRA Tinder" : "Manage VETRA Tinder data"}</Link>
                  <Link href={`/client-interface/${clientId}/match/adoption`} className="group rounded-2xl border border-[#E7EAE6] bg-white p-4 transition hover:-translate-y-0.5 hover:border-[#F3C8CE] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F45B70] motion-reduce:transform-none">
                    <div className="flex items-center justify-between gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFF0F1] text-[#F45B70]">🐾</span><span className="text-sm font-black text-[#F45B70]">{copy.browse} <span aria-hidden="true">{ar ? "←" : "→"}</span></span></div>
                    <h2 className="mt-3 font-black">{copy.adoption}</h2><p className="mt-1 text-xs leading-5 text-[#657585]">{copy.adoptionText}</p>
                  </Link>
                  <Link href={`/client-interface/${clientId}/match/breeding${selectedPetId ? `?petId=${encodeURIComponent(selectedPetId)}` : ""}`} className="group rounded-2xl border border-[#E7EAE6] bg-white p-4 transition hover:-translate-y-0.5 hover:border-[#BFE8DB] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#138780] motion-reduce:transform-none">
                    <div className="flex items-center justify-between gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#E6F6F0] text-[#138780]">♡</span><span className="text-sm font-black text-[#138780]">{copy.browse} <span aria-hidden="true">{ar ? "←" : "→"}</span></span></div>
                    <h2 className="mt-3 font-black">{copy.breeding}</h2><p className="mt-1 text-xs leading-5 text-[#657585]">{copy.breedingText}</p>
                  </Link>
                </div>
              </div>
            ) : (
              <div className="mt-7 grid gap-3 xl:grid-cols-2">
                <section className="flex flex-col rounded-2xl border border-[#BFE8DB] bg-[#F4FBF8] p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-black">{copy.linkedTitle}</h2><p className="mt-2 text-xs leading-5 text-[#657585]">{copy.linkedDesc}</p></div><span className="shrink-0 rounded-full bg-white px-2.5 py-1.5 text-[10px] font-black text-[#138780]">{copy.linkedBadge}</span></div>
                  <ul className="mt-4 space-y-2">{copy.linkedBenefits.map((benefit) => <li key={benefit} className="flex gap-2 text-xs leading-5 text-[#42596A]"><CheckIcon />{benefit}</li>)}</ul>
                  <Link href={loginHref} className="mt-5 inline-flex min-h-12 items-center justify-center rounded-xl bg-[#138780] px-4 text-sm font-black text-white transition hover:bg-[#0F716B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#138780]">{copy.login}</Link>
                </section>

                <section className="flex flex-col rounded-2xl border border-[#F2D1D5] bg-[#FFFAFA] p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-black">{copy.newTitle}</h2><p className="mt-2 text-xs leading-5 text-[#657585]">{copy.newDesc}</p></div><span className="shrink-0 rounded-full bg-white px-2.5 py-1.5 text-[10px] font-black text-[#B64D60]">{copy.newBadge}</span></div>
                  <ul className="mt-4 space-y-2">{copy.newBenefits.map((benefit) => <li key={benefit} className="flex gap-2 text-xs leading-5 text-[#42596A]"><CheckIcon />{benefit}</li>)}</ul>
                  <Link href={`/client-interface/${clientId}/match/auth`} className="mt-5 inline-flex min-h-12 items-center justify-center rounded-xl bg-[#F45B70] px-4 text-sm font-black text-white transition hover:bg-[#DC4A60] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#F45B70]">{copy.register}</Link>
                </section>
              </div>
            )}

            <footer className="mt-auto border-t border-[#E7EAE6] pt-5 text-xs leading-6 text-[#657585]">{copy.reassurance}</footer>
          </div>
        </section>
      </div>

      {showExternalInfo && <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#17324D]/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowExternalInfo(false); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="external-account-title" className="w-full max-w-lg rounded-3xl border border-[#E7EAE6] bg-white p-6 shadow-2xl sm:p-8">
          <div className="flex items-start gap-4"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#FFF0F1] text-xl text-[#F45B70]">＋</span><div><h2 id="external-account-title" className="text-xl font-black">{copy.externalTitle}</h2><p className="mt-3 text-sm leading-7 text-[#657585]">{copy.externalBody}</p></div></div>
          <p className="mt-4 rounded-2xl bg-[#FAF8F4] p-4 text-xs leading-6 text-[#42596A]">{copy.externalNeed}</p>
          <div className="mt-6 flex flex-wrap justify-end gap-2"><button type="button" onClick={() => setShowExternalInfo(false)} className="min-h-11 rounded-xl border border-[#E7EAE6] px-4 text-sm font-bold">{copy.externalClose}</button><Link href={loginHref} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#138780] px-4 text-sm font-black text-white">{copy.externalExisting}</Link></div>
        </section>
      </div>}
    </main>
  );
}
