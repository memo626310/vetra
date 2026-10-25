"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { getClientPortalDb } from "@/lib/client-portal-db";
import { writeVetraThemeMode } from "@/lib/theme";

type Lang = "ar" | "en";
type Pet = { id: string; name: string; species: string; breed: string | null };
type Row = { test: string; result: string; unit: string; reference: string };
type RecordItem = {
  id: string;
  pet_id: string;
  title: string;
  status: string;
  result: string | null;
  notes: string | null;
  performed_at: string | null;
  created_at: string;
};
type Attachment = { id: string; record_id: string; pet_id: string; file_name: string; mime_type: string; size_bytes: number; created_at: string };

const copy = {
  ar: {
    title: "نتائج التحاليل", subtitle: "احتفظ بنتائج حيواناتك في ملف واضح وسهل الرجوع إليه.", back: "العودة للرئيسية", upload: "رفع نتيجة جديدة", selectedPet: "الحيوان المختار", choosePet: "اختار الحيوان", reportTitle: "اسم التحليل", reportTitleHint: "مثال: Complete Blood Picture (CBC)", date: "تاريخ التحليل", notes: "ملاحظات إضافية", notesHint: "أي تعليق من المعمل أو الطبيب...", file: "ملف النتيجة", chooseFile: "اختار PDF أو صورة", fileHint: "PDF أو JPG أو PNG أو WebP — حتى 10 ميجابايت", rows: "قيم التحليل", addRow: "إضافة صف", test: "اسم الاختبار", result: "النتيجة", unit: "الوحدة", reference: "المعدل المرجعي", save: "حفظ النتيجة", saving: "جاري الرفع...", cancel: "مسح", recent: "آخر النتائج", noResults: "لسه مفيش نتائج تحاليل مضافة.", noResultsHint: "ارفع أول نتيجة للحيوان علشان تظهر هنا بالشكل ده.", viewFile: "فتح الملف", noFile: "بدون ملف", status: "مرفوعة", uploaded: "تم حفظ النتيجة بنجاح", error: "تعذر حفظ نتيجة التحليل. حاول مرة أخرى.", loading: "جاري تحميل النتائج...", login: "العودة لتسجيل الدخول", emptyRows: "أضف قيم التحليل يدويًا لتظهر داخل التقرير.", language: "English", light: "الوضع الفاتح", dark: "الوضع الداكن", allPets: "كل الحيوانات", rowsHint: "اختياري — يمكنك رفع الملف فقط أو إضافة القيم في الجدول.", reportDate: "تاريخ التقرير", attachment: "المرفق",
  },
  en: {
    title: "Lab results", subtitle: "Keep every pet's laboratory report in one clear, private workspace.", back: "Back to home", upload: "Upload new result", selectedPet: "Selected pet", choosePet: "Choose a pet", reportTitle: "Test name", reportTitleHint: "Example: Complete Blood Picture (CBC)", date: "Test date", notes: "Additional notes", notesHint: "A note from the lab or veterinarian...", file: "Result file", chooseFile: "Choose PDF or image", fileHint: "PDF, JPG, PNG, or WebP — up to 10 MB", rows: "Result values", addRow: "Add row", test: "Test name", result: "Result", unit: "Unit", reference: "Reference range", save: "Save result", saving: "Uploading...", cancel: "Clear", recent: "Recent results", noResults: "No laboratory results yet.", noResultsHint: "Upload the first result for a pet and it will appear here.", viewFile: "Open file", noFile: "No file", status: "Uploaded", uploaded: "Result saved successfully", error: "Could not save the laboratory result. Please try again.", loading: "Loading results...", login: "Back to login", emptyRows: "Add result values to display them in the report.", language: "العربية", light: "Light mode", dark: "Dark mode", allPets: "All pets", rowsHint: "Optional — upload the file alone or add values to the table.", reportDate: "Report date", attachment: "Attachment",
  },
} as const;

const blankRow = (): Row => ({ test: "", result: "", unit: "", reference: "" });
const iconFor = (species: string) => /cat|قط/i.test(species) ? "🐱" : /dog|كلب/i.test(species) ? "🐶" : "🐾";
const formatDate = (value: string | null, lang: Lang) => value ? new Date(value).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US", { day: "numeric", month: "short", year: "numeric" }) : "—";
const formatSize = (bytes: number, lang: Lang) => `${(bytes / 1024 / 1024).toFixed(1)} ${lang === "ar" ? "ميجابايت" : "MB"}`;

function parseRows(value: string | null): Row[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((row) => row && typeof row === "object").map((row) => ({ test: String(row.test || ""), result: String(row.result || ""), unit: String(row.unit || ""), reference: String(row.reference || "") })).filter((row) => Object.values(row).some(Boolean));
  } catch { return []; }
}

export default function ClientAnalysesPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const clientId = params.id;
  const queryPet = searchParams.get("pet");
  const queryRecord = searchParams.get("record");
  const [lang, setLang] = useState<Lang>("ar");
  const [dark, setDark] = useState(true);
  const [pets, setPets] = useState<Pet[]>([]);
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [selectedPet, setSelectedPet] = useState("");
  const [activeRecord, setActiveRecord] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({ title: "", date: new Date().toISOString().slice(0, 10), notes: "" });
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<Row[]>([blankRow()]);
  const [openedRecord, setOpenedRecord] = useState<RecordItem | null>(null);
  const [openedAttachment, setOpenedAttachment] = useState<Attachment | null>(null);
  const [openedUrl, setOpenedUrl] = useState("");
  const [opening, setOpening] = useState(false);
  const autoOpenedRecord = useRef<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const savedLang = window.localStorage.getItem("vetra-language");
      const savedTheme = window.localStorage.getItem("vetra-theme");
      if (savedLang === "ar" || savedLang === "en") setLang(savedLang);
      setDark(savedTheme !== "light");
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    async function load() {
      setLoading(true); setError("");
      const id = localStorage.getItem("vetra-client-id") || sessionStorage.getItem("vetra-client-id");
      const code = localStorage.getItem("vetra-client-code") || sessionStorage.getItem("vetra-client-code");
      const phone = localStorage.getItem("vetra-client-phone") || sessionStorage.getItem("vetra-client-phone");
      if (!id || id !== clientId || !code || !phone) { router.replace("/client-interface/login"); return; }
      try {
        const db = await getClientPortalDb(code, phone);
        const petsResult = await db.from("pets").select("id,name,species,breed").eq("client_id", clientId).order("created_at", { ascending: false });
        if (petsResult.error) throw petsResult.error;
        const petRows = (petsResult.data || []) as Pet[];
        const loaded = await Promise.all(petRows.map(async (pet) => {
          const [recordsResult, attachmentsResult] = await Promise.all([
            db.rpc("vetra_get_pet_lab_records", { p_pet_id: pet.id }),
            db.rpc("vetra_get_pet_lab_attachments", { p_pet_id: pet.id }),
          ]);
          let records = recordsResult.data || [];
          if (recordsResult.error) {
            const fallback = await db.rpc("vetra_get_pet_medical_records", { p_pet_id: pet.id });
            records = (fallback.data || []).filter((record: { record_type?: string }) => record.record_type === "lab");
          }
          return { records, attachments: attachmentsResult.error ? [] : (attachmentsResult.data || []) };
        }));
        if (cancelled) return;
        setPets(petRows);
        setSelectedPet((current) => queryPet && petRows.some((pet) => pet.id === queryPet) ? queryPet : current && petRows.some((pet) => pet.id === current) ? current : petRows[0]?.id || "");
        setRecords(loaded.flatMap((item) => item.records as RecordItem[]).sort((a, b) => +new Date(b.performed_at || b.created_at) - +new Date(a.performed_at || a.created_at)));
        setAttachments(loaded.flatMap((item) => item.attachments as Attachment[]));
        if (queryRecord) setActiveRecord(queryRecord);
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load lab results"); }
      finally { if (!cancelled) setLoading(false); }
    }
    void load();
    return () => { cancelled = true; };
  }, [clientId, queryPet, queryRecord, router]);

  const t = copy[lang];
  const selected = pets.find((pet) => pet.id === selectedPet) || pets[0] || null;
  const visibleRecords = useMemo(() => selectedPet ? records.filter((record) => record.pet_id === selectedPet) : records, [records, selectedPet]);
  const currentRecord = visibleRecords.find((record) => record.id === activeRecord) || visibleRecords[0] || null;
  const currentRows = currentRecord ? parseRows(currentRecord.result) : [];
  const currentAttachment = currentRecord ? attachments.find((item) => item.record_id === currentRecord.id) : null;
  const openedPet = openedRecord ? pets.find((pet) => pet.id === openedRecord.pet_id) : null;

  function toggleLang() { const next = lang === "ar" ? "en" : "ar"; setLang(next); localStorage.setItem("vetra-language", next); }
  function toggleTheme() { const next = !dark; setDark(next); writeVetraThemeMode(next); }
  function updateRow(index: number, key: keyof Row, value: string) { setRows((current) => current.map((row, i) => i === index ? { ...row, [key]: value } : row)); }
  function resetForm() { setForm({ title: "", date: new Date().toISOString().slice(0, 10), notes: "" }); setRows([blankRow()]); setFile(null); }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage(""); setError("");
    if (!selectedPet || !form.title.trim() || !file) { setError(lang === "ar" ? "اختار الحيوان واكتب اسم التحليل وارفع الملف." : "Choose a pet, enter a test name, and select a file."); return; }
    setSaving(true);
    try {
      const clientCode = localStorage.getItem("vetra-client-code") || sessionStorage.getItem("vetra-client-code") || "";
      const phone = localStorage.getItem("vetra-client-phone") || sessionStorage.getItem("vetra-client-phone") || "";
      const body = new FormData();
      body.append("clientCode", clientCode); body.append("phone", phone); body.append("petId", selectedPet); body.append("title", form.title.trim()); body.append("performedAt", form.date); body.append("notes", form.notes.trim()); body.append("resultRows", JSON.stringify(rows.filter((row) => Object.values(row).some(Boolean)))); body.append("file", file);
      const response = await fetch(`/api/client-interface/${encodeURIComponent(clientId)}/analyses`, { method: "POST", body });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || t.error);
      const saved = payload.record as RecordItem;
      setRecords((current) => [saved, ...current]);
      if (payload.attachment) setAttachments((current) => [payload.attachment as Attachment, ...current]);
      setActiveRecord(saved.id); resetForm(); setMessage(t.uploaded);
    } catch (e) { setError(e instanceof Error ? e.message : t.error); }
    finally { setSaving(false); }
  }

  const openAttachment = useCallback(async (attachment: Attachment, petId: string) => {
    const clientCode = localStorage.getItem("vetra-client-code") || sessionStorage.getItem("vetra-client-code") || "";
    const phone = localStorage.getItem("vetra-client-phone") || sessionStorage.getItem("vetra-client-phone") || "";
    setOpening(true);
    const response = await fetch(`/api/client-interface/${encodeURIComponent(clientId)}/analyses`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "signed-url", clientCode, phone, attachmentId: attachment.id, petId }) });
    const payload = await response.json();
    setOpening(false);
    if (!response.ok || !payload.url) { setError(payload.error || t.error); return; }
    setOpenedRecord(records.find((record) => record.id === attachment.record_id) || null);
    setOpenedAttachment(attachment);
    setOpenedUrl(payload.url);
  }, [clientId, records, t.error]);

  useEffect(() => {
    if (!queryRecord || loading || autoOpenedRecord.current === queryRecord) return;
    const record = records.find((item) => item.id === queryRecord);
    const attachment = attachments.find((item) => item.record_id === queryRecord);
    if (!record || !attachment) return;
    autoOpenedRecord.current = queryRecord;
    window.setTimeout(() => { void openAttachment(attachment, record.pet_id); }, 0);
  }, [attachments, loading, openAttachment, queryRecord, records]);

  if (loading) return <main dir={lang === "ar" ? "rtl" : "ltr"} className="flex min-h-screen items-center justify-center bg-[#07131d] text-white"><div className="text-center"><div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-cyan-400/10 text-3xl">🧪</div><p className="text-sm font-bold text-slate-400">{t.loading}</p></div></main>;
  if (error && !pets.length) return <main dir={lang === "ar" ? "rtl" : "ltr"} className="flex min-h-screen items-center justify-center bg-[#07131d] px-6 text-white"><div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-white/[.04] p-8 text-center"><div className="text-5xl">🧪</div><h1 className="mt-4 text-2xl font-black">{t.error}</h1><p className="mt-3 text-sm text-slate-400">{error}</p><button onClick={() => router.replace("/client-interface/login")} className="mt-6 rounded-2xl bg-cyan-400 px-6 py-3 text-sm font-black text-slate-950">{t.login}</button></div></main>;

  const shell = dark ? "border-white/10 bg-[#111e2a]" : "border-slate-200 bg-white";
  const field = dark ? "border-white/10 bg-white/[.04] text-white placeholder:text-slate-500" : "border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400";
  const muted = dark ? "text-slate-400" : "text-slate-500";
  return <main dir={lang === "ar" ? "rtl" : "ltr"} className={dark ? "min-h-screen overflow-x-hidden bg-[#07131d] text-white" : "min-h-screen overflow-x-hidden bg-[#f4f7f8] text-slate-900"}>
    <div className="pointer-events-none fixed inset-0 overflow-hidden"><div className={dark ? "absolute -right-24 -top-24 h-80 w-80 rounded-full bg-cyan-400/10 blur-3xl" : "absolute -right-24 -top-24 h-80 w-80 rounded-full bg-cyan-300/25 blur-3xl"}/><div className={dark ? "absolute -left-24 top-1/3 h-96 w-96 rounded-full bg-violet-500/10 blur-3xl" : "absolute -left-24 top-1/3 h-96 w-96 rounded-full bg-violet-300/20 blur-3xl"}/></div>
    <div className="relative z-10 mx-auto max-w-7xl px-4 pb-14 pt-4 sm:px-6 lg:px-8">
      <header className="mb-5 flex items-center justify-between gap-3 py-3"><div className="flex items-center gap-3"><Link href={`/client-interface/${clientId}`} className={`flex h-11 w-11 items-center justify-center rounded-2xl border ${dark ? "border-white/10 bg-white/[.05]" : "border-slate-200 bg-white"}`} aria-label={t.back}>←</Link><div><div className="font-black tracking-[.18em]">VETRA</div><div className={`text-[10px] font-bold tracking-[.18em] ${muted}`}>LABORATORY</div></div></div><div className="flex items-center gap-2"><button onClick={toggleLang} className={`rounded-full border px-3 py-2 text-xs font-bold ${dark ? "border-white/10 bg-white/[.05]" : "border-slate-200 bg-white"}`}>{t.language}</button><button onClick={toggleTheme} className={`flex h-10 w-10 items-center justify-center rounded-full border ${dark ? "border-white/10 bg-white/[.05]" : "border-slate-200 bg-white"}`} aria-label={dark ? t.light : t.dark}>{dark ? "☀️" : "🌙"}</button></div></header>
      <section className={`rounded-[2rem] border p-5 shadow-2xl sm:p-7 ${dark ? "border-cyan-300/10 bg-gradient-to-br from-[#123244] via-[#102431] to-[#182044]" : "border-cyan-100 bg-gradient-to-br from-white via-cyan-50 to-violet-50"}`}><div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div><p className={`text-xs font-black tracking-[.16em] ${dark ? "text-cyan-300" : "text-cyan-800"}`}>VETRA CARE · REPORTS</p><h1 className="mt-2 text-3xl font-black sm:text-5xl">{t.title}</h1><p className={`mt-3 max-w-2xl text-sm leading-7 ${dark ? "text-slate-300" : "text-slate-600"}`}>{t.subtitle}</p></div><div className="rounded-2xl border border-white/10 bg-white/[.08] px-5 py-4"><div className={`text-[10px] font-bold ${muted}`}>{t.recent}</div><div className="mt-1 text-3xl font-black">{visibleRecords.length}</div></div></div></section>

      <section className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_390px]">
        <div className={`rounded-[2rem] border p-5 shadow-xl sm:p-6 ${shell}`}>
          <div className="flex flex-wrap items-center justify-between gap-3"><div><p className={`text-xs font-black ${dark ? "text-cyan-300" : "text-cyan-800"}`}>{t.recent}</p><h2 className="mt-1 text-2xl font-black">{currentRecord?.title || (selected ? `${t.selectedPet}: ${selected.name}` : t.title)}</h2></div><select value={selectedPet} onChange={(event) => { setSelectedPet(event.target.value); setActiveRecord(null); }} className={`rounded-xl border px-3 py-2 text-xs font-bold outline-none ${field}`}><option value="">{t.allPets}</option>{pets.map((pet) => <option key={pet.id} value={pet.id}>{iconFor(pet.species)} {pet.name}</option>)}</select></div>
          {pets.length > 1 && <div className="mt-4 flex gap-2 overflow-x-auto pb-1">{pets.map((pet) => <button type="button" key={pet.id} onClick={() => { setSelectedPet(pet.id); setActiveRecord(null); }} className={`shrink-0 rounded-2xl border px-4 py-2.5 text-sm font-black ${selectedPet === pet.id ? "border-cyan-400 bg-cyan-400/10 text-cyan-200" : dark ? "border-white/10 bg-white/[.03] text-slate-400" : "border-slate-200 bg-slate-50 text-slate-600"}`}>{iconFor(pet.species)} {pet.name}</button>)}</div>}
          {currentRecord && <div className={`mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 ${dark ? "border-white/10 bg-white/[.03]" : "border-slate-200 bg-slate-50"}`}><div><div className="text-lg font-black">{currentRecord.title}</div><div className={`mt-1 text-xs ${muted}`}>{selected?.name} · {t.reportDate}: {formatDate(currentRecord.performed_at || currentRecord.created_at, lang)}</div></div><div className="flex items-center gap-2"><span className="rounded-full bg-emerald-400/10 px-3 py-1.5 text-[10px] font-black text-emerald-300">✓ {t.status}</span>{currentAttachment ? <button type="button" disabled={opening} onClick={() => void openAttachment(currentAttachment, currentRecord.pet_id)} className="rounded-xl bg-cyan-400 px-3 py-2 text-xs font-black text-slate-950">{opening ? "…" : "↗ فتح التحليل"}</button> : <span className={`text-xs ${muted}`}>{t.noFile}</span>}</div></div>}
          {currentRecord && currentRows.length > 0 ? <div className="mt-5 overflow-x-auto rounded-xl border border-slate-300/50 bg-white text-slate-950"><table className="min-w-[650px] w-full border-collapse text-sm"><thead><tr className="border-b-2 border-slate-700 text-start text-xs font-black"><th className="px-4 py-3 text-start">{t.test}</th><th className="px-4 py-3 text-start">{t.result}</th><th className="px-4 py-3 text-start">{t.unit}</th><th className="px-4 py-3 text-start">{t.reference}</th></tr></thead><tbody><tr><td colSpan={4} className="border-b border-slate-300 bg-[#eee5e5] px-4 py-3 text-center text-base font-black">{currentRecord.title}</td></tr>{currentRows.map((row, index) => <tr key={`${row.test}-${index}`} className="border-b border-slate-200 last:border-0"><td className="px-4 py-3 font-bold">{row.test || "—"}</td><td className="px-4 py-3 font-black">{row.result || "—"}</td><td className="px-4 py-3 font-semibold">{row.unit || "—"}</td><td className="px-4 py-3 font-semibold">{row.reference || "—"}</td></tr>)}</tbody></table></div> : <div className={`mt-5 rounded-2xl border border-dashed p-8 text-center ${dark ? "border-white/15" : "border-slate-300"}`}><div className="text-4xl">🧾</div><p className={`mt-3 text-sm font-black ${muted}`}>{currentRecord ? t.emptyRows : t.noResults}</p><p className={`mt-2 text-xs ${muted}`}>{currentRecord ? t.rowsHint : t.noResultsHint}</p></div>}
          {visibleRecords.length > 0 && <div className="mt-5 grid gap-2 sm:grid-cols-2">{visibleRecords.map((record) => { const attachment = attachments.find((item) => item.record_id === record.id); return <button type="button" key={record.id} onClick={() => setActiveRecord(record.id)} className={`flex items-center justify-between gap-3 rounded-2xl border p-3 text-start ${record.id === currentRecord?.id ? "border-cyan-400/40 bg-cyan-400/[.08]" : dark ? "border-white/10 bg-white/[.025]" : "border-slate-200 bg-slate-50"}`}><span className="min-w-0"><span className="block truncate text-sm font-black">{record.title}</span><span className={`mt-1 block text-[10px] ${muted}`}>{formatDate(record.performed_at || record.created_at, lang)} · {pets.find((pet) => pet.id === record.pet_id)?.name || "—"}</span></span><span className="shrink-0 text-lg">{attachment ? "📎" : "🧪"}</span></button>; })}</div>}
        </div>

        <form onSubmit={submit} className={`rounded-[2rem] border p-5 shadow-xl sm:p-6 ${shell}`}><div className="flex items-start justify-between gap-3"><div><p className={`text-xs font-black ${dark ? "text-cyan-300" : "text-cyan-800"}`}>{t.upload}</p><h2 className="mt-1 text-2xl font-black">{t.file}</h2></div><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-400/10 text-2xl">🧪</div></div>
          <div className="mt-5 space-y-4"><div><label className={`mb-2 block text-xs font-black ${muted}`}>{t.choosePet}</label><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">{pets.map((pet) => <button type="button" key={pet.id} onClick={() => setSelectedPet(pet.id)} className={`flex items-center gap-3 rounded-2xl border p-3 text-start ${selectedPet === pet.id ? "border-cyan-400 bg-cyan-400/10" : dark ? "border-white/10 bg-white/[.03]" : "border-slate-200 bg-slate-50"}`}><span className="text-2xl">{iconFor(pet.species)}</span><span><span className="block text-sm font-black">{pet.name}</span><span className={`mt-0.5 block text-[10px] ${muted}`}>{pet.breed || pet.species}</span></span></button>)}</div></div>
            <div><label className={`mb-2 block text-xs font-black ${muted}`}>{t.reportTitle}</label><input required value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder={t.reportTitleHint} className={`w-full rounded-2xl border px-4 py-3 text-sm outline-none focus:border-cyan-400 ${field}`}/></div>
            <div><label className={`mb-2 block text-xs font-black ${muted}`}>{t.date}</label><input type="date" value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} className={`w-full rounded-2xl border px-4 py-3 text-sm outline-none focus:border-cyan-400 ${field}`}/></div>
            <label className={`flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed p-4 transition ${dark ? "border-cyan-300/30 bg-cyan-300/[.05]" : "border-cyan-700/30 bg-cyan-50"}`}><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => setFile(event.target.files?.[0] || null)}/><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-400/15 text-xl">📎</span><span className="min-w-0"><span className="block truncate text-sm font-black">{file?.name || t.chooseFile}</span><span className={`mt-1 block text-[10px] ${muted}`}>{file ? formatSize(file.size, lang) : t.fileHint}</span></span></label>
            <div><div className="mb-2 flex items-center justify-between gap-2"><label className={`text-xs font-black ${muted}`}>{t.rows}</label><button type="button" onClick={() => setRows((current) => [...current, blankRow()])} className="rounded-xl bg-cyan-400/10 px-3 py-1.5 text-[10px] font-black text-cyan-300">+ {t.addRow}</button></div><div className="space-y-2">{rows.map((row, index) => <div key={index} className="grid grid-cols-2 gap-2"><input value={row.test} onChange={(event) => updateRow(index, "test", event.target.value)} placeholder={t.test} className={`rounded-xl border px-3 py-2.5 text-xs outline-none ${field}`}/><input value={row.result} onChange={(event) => updateRow(index, "result", event.target.value)} placeholder={t.result} className={`rounded-xl border px-3 py-2.5 text-xs outline-none ${field}`}/><input value={row.unit} onChange={(event) => updateRow(index, "unit", event.target.value)} placeholder={t.unit} className={`rounded-xl border px-3 py-2.5 text-xs outline-none ${field}`}/><input value={row.reference} onChange={(event) => updateRow(index, "reference", event.target.value)} placeholder={t.reference} className={`rounded-xl border px-3 py-2.5 text-xs outline-none ${field}`}/></div>)}</div><p className={`mt-2 text-[10px] leading-5 ${muted}`}>{t.rowsHint}</p></div>
            <textarea rows={2} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder={t.notesHint} className={`w-full resize-none rounded-2xl border px-4 py-3 text-sm outline-none focus:border-cyan-400 ${field}`}/>
          </div>
          {message && <p className="mt-4 rounded-xl bg-emerald-400/10 px-3 py-2 text-xs font-bold text-emerald-300" role="status">{message}</p>}{error && <p className="mt-4 rounded-xl bg-rose-400/10 px-3 py-2 text-xs font-bold text-rose-300" role="alert">{error}</p>}
          <div className="mt-5 flex gap-2"><button type="button" onClick={resetForm} disabled={saving} className={`rounded-2xl border px-4 py-3 text-xs font-black ${dark ? "border-white/10 text-slate-300" : "border-slate-200 text-slate-600"}`}>{t.cancel}</button><button type="submit" disabled={saving} className="flex-1 rounded-2xl bg-gradient-to-r from-cyan-400 to-violet-500 px-4 py-3 text-xs font-black text-slate-950 disabled:opacity-50">{saving ? t.saving : t.save}</button></div>
        </form>
      </section>
    </div>
    {openedRecord && openedUrl && <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center"><section className={`max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-[2rem] border p-4 shadow-2xl sm:p-6 ${dark ? "border-white/10 bg-[#0b1622] text-white" : "border-slate-200 bg-white text-slate-900"}`}><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black tracking-[.16em] text-cyan-400">VETRA · LAB REPORT</p><h2 className="mt-1 text-2xl font-black">{openedRecord.title}</h2><p className={`mt-1 text-xs ${muted}`}>{openedPet?.name || "—"} · {t.reportDate}: {formatDate(openedRecord.performed_at || openedRecord.created_at, lang)}</p></div><button type="button" onClick={() => { setOpenedRecord(null); setOpenedAttachment(null); setOpenedUrl(""); }} className={`flex h-10 w-10 items-center justify-center rounded-full ${dark ? "bg-white/10" : "bg-slate-100"}`}>✕</button></div><div className="mt-5 overflow-x-auto rounded-xl border border-slate-300/60 bg-white text-slate-950"><table className="min-w-[680px] w-full border-collapse text-sm"><thead><tr className="border-b-2 border-slate-700 font-black"><th className="px-4 py-3 text-start">{t.test}</th><th className="px-4 py-3 text-start">{t.result}</th><th className="px-4 py-3 text-start">{t.unit}</th><th className="px-4 py-3 text-start">{t.reference}</th></tr></thead><tbody><tr><td colSpan={4} className="border-b border-slate-300 bg-[#eee5e5] px-4 py-3 text-center text-base font-black">{openedRecord.title}</td></tr>{parseRows(openedRecord.result).map((row, index) => <tr key={index} className="border-b border-slate-200 last:border-0"><td className="px-4 py-3 font-bold">{row.test || "—"}</td><td className="px-4 py-3 font-black">{row.result || "—"}</td><td className="px-4 py-3">{row.unit || "—"}</td><td className="px-4 py-3">{row.reference || "—"}</td></tr>)}</tbody></table></div><div className={`mt-5 rounded-2xl border p-3 ${dark ? "border-white/10 bg-white/[.03]" : "border-slate-200 bg-slate-50"}`}><div className="mb-3 flex items-center justify-between gap-3"><div><div className="text-sm font-black">{t.attachment}</div><div className={`mt-1 text-xs ${muted}`}>{openedAttachment?.file_name}</div></div><span className="text-xl">📎</span></div>{openedAttachment?.mime_type === "application/pdf" ? <iframe title={openedAttachment.file_name} src={openedUrl} className="h-[55vh] w-full rounded-xl bg-white" /> : <img src={openedUrl} alt={openedRecord.title} className="max-h-[55vh] w-full rounded-xl bg-white object-contain" />}</div></section></div>}
  </main>;
}
