"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getClinicContext, getClinicDb } from "@/lib/clinic-db";
import {
  DEFAULT_MESSAGE_TEMPLATES,
  MESSAGE_TEMPLATE_KEYS,
  TEMPLATE_LABELS,
  TEMPLATE_PLACEHOLDERS,
  loadClinicMessageTemplates,
  openWhatsApp,
  renderMessageTemplate,
  type MessageLanguage,
  type MessageTemplateKey,
  type MessageTemplatePair,
} from "@/lib/clinic-message-templates";
import { loadClinicProfile } from "@/lib/clinic-profile";
import { writeVetraThemeMode } from "@/lib/theme";

type Client = { id: string; client_code: string | null; name: string; phone: string | null };
type Pet = { id: string; client_id: string; name: string };
type TemplateRecord = Record<MessageTemplateKey, MessageTemplatePair>;
type Tab = "compose" | "templates";

const examples: Record<string, string> = {
  customer_name: "Mona",
  phone_number: "01000000000",
  client_id: "010001",
  pet_name: "Luna",
  appointment_date: "28 Aug 2026",
  appointment_time: "6:30 PM",
  doctor_name: "Dr. VETRA",
  brand_name: "VETRA Clinic",
  follow_up_date: "30 Aug 2026",
  notes: "Please bring the latest test results.",
  vaccine_name: "Rabies vaccine",
  due_date: "2 Sep 2026",
  share_url: "https://vetra.example/record",
  prescription_summary: "Prescription details are available in the link above.",
  invoice_number: "1042",
  total: "EGP 800",
  paid: "EGP 300",
  balance: "EGP 500",
};

export default function MessagesPage() {
  const [language, setLanguage] = useState<MessageLanguage>("ar");
  const [darkMode, setDarkMode] = useState(true);
  const [tab, setTab] = useState<Tab>("compose");
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [clinicId, setClinicId] = useState("");
  const [clinicName, setClinicName] = useState("VETRA");
  const [doctorName, setDoctorName] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [pets, setPets] = useState<Pet[]>([]);
  const [templates, setTemplates] = useState<TemplateRecord>(DEFAULT_MESSAGE_TEMPLATES);
  const [clientId, setClientId] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [petId, setPetId] = useState("");
  const [templateKey, setTemplateKey] = useState<MessageTemplateKey | "custom">("custom");
  const [customMessage, setCustomMessage] = useState("");
  const [variables, setVariables] = useState<Record<string, string>>({});

  const ar = language === "ar";
  const dark = darkMode;
  const client = clients.find((item) => item.id === clientId) || null;
  const pet = pets.find((item) => item.id === petId) || null;
  const clientPets = pets.filter((item) => item.client_id === clientId);
  const previewVariables = useMemo(() => ({
    ...examples,
    customer_name: client?.name || "",
    phone_number: client?.phone || "",
    client_id: client?.client_code || "",
    pet_name: pet?.name || (clientPets.length ? clientPets.map((item) => item.name).join(", ") : ""),
    brand_name: clinicName,
    doctor_name: doctorName,
    ...variables,
  }), [client?.client_code, client?.name, client?.phone, clientPets, clinicName, doctorName, pet?.name, variables]);
  const filteredClients = useMemo(() => {
    const query = clientSearch.trim().toLocaleLowerCase();
    if (!query) return clients.slice(0, 8);
    return clients.filter((item) => `${item.name} ${item.phone || ""} ${item.client_code || ""}`.toLocaleLowerCase().includes(query)).slice(0, 8);
  }, [clientSearch, clients]);
  const composedText = templateKey === "custom"
    ? customMessage
    : renderMessageTemplate(templates[templateKey][language], previewVariables);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const context = await getClinicContext();
        const db = await getClinicDb();
        const [clientResult, petResult, loadedTemplates, clinicProfile] = await Promise.all([
          db.from("clients").select("id,client_code,name,phone").order("name"),
          db.from("pets").select("id,client_id,name,is_deceased").order("name"),
          loadClinicMessageTemplates(db, context.clinic_id),
          loadClinicProfile(db, context.clinic_id),
        ]);
        if (clientResult.error) throw clientResult.error;
        if (petResult.error) throw petResult.error;
        if (!active) return;
        setClinicId(context.clinic_id);
        setClinicName(clinicProfile?.display_name || context.clinic_name || "VETRA");
        setDoctorName(clinicProfile?.doctor_name || context.doctor_name || "");
        setClients((clientResult.data || []) as Client[]);
        setPets((petResult.data || []).filter((item) => !item.is_deceased) as Pet[]);
        setTemplates(loadedTemplates);
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Could not load message center.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  function updateTemplate(key: MessageTemplateKey, lang: MessageLanguage, value: string) {
    setTemplates((current) => ({ ...current, [key]: { ...current[key], [lang]: value } }));
  }

  async function saveTemplate(key: MessageTemplateKey, reset = false) {
    if (!clinicId) return;
    setSavingKey(key);
    setNotice("");
    setError("");
    try {
      const db = await getClinicDb();
      const pair = reset ? DEFAULT_MESSAGE_TEMPLATES[key] : templates[key];
      const rows = (["en", "ar"] as const).map((lang) => ({
        clinic_id: clinicId,
        template_key: key,
        language: lang,
        message: pair[lang],
        updated_at: new Date().toISOString(),
      }));
      const { error: saveError } = await db.from("clinic_message_templates")
        .upsert(rows, { onConflict: "clinic_id,template_key,language" });
      if (saveError) throw saveError;
      if (reset) setTemplates((current) => ({ ...current, [key]: DEFAULT_MESSAGE_TEMPLATES[key] }));
      setNotice(ar ? "تم حفظ القالب." : "Template saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : (ar ? "تعذر حفظ القالب." : "Could not save template."));
    } finally {
      setSavingKey("");
    }
  }

  function selectTemplate(value: MessageTemplateKey | "custom") {
    setTemplateKey(value);
    setVariables({});
  }

  function sendWhatsApp() {
    if (!client) {
      setError(ar ? "اختر عميلًا أولًا." : "Select a customer first.");
      return;
    }
    if (!client.phone) {
      setError(ar ? "لا يوجد رقم هاتف محفوظ لهذا العميل." : "This customer has no saved phone number.");
      return;
    }
    if (!composedText.trim()) {
      setError(ar ? "اكتب الرسالة أولًا." : "Write a message first.");
      return;
    }
    if (!openWhatsApp(client.phone, composedText)) {
      setError(ar ? "اسمح بفتح نافذة واتساب لإكمال المشاركة." : "Allow the WhatsApp tab to open to continue.");
    } else {
      setError("");
    }
  }

  const page = dark ? "min-h-screen bg-[#0F1115] text-slate-100" : "min-h-screen bg-[#F7F8FA] text-slate-900";
  const surface = dark ? "border-white/[0.07] bg-[#181B21]" : "border-slate-200 bg-white";
  const input = dark ? "border-white/[0.09] bg-[#111419] text-white placeholder:text-slate-500" : "border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400";
  const labelFor = (key: MessageTemplateKey) => TEMPLATE_LABELS[key][language];

  return <main dir={ar ? "rtl" : "ltr"} className={page}>
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
      <header className={`mb-5 flex flex-wrap items-center justify-between gap-4 rounded-xl border p-4 ${surface}`}>
        <div>
          <p className="text-[11px] font-bold uppercase text-cyan-500">{ar ? "تواصل العملاء" : "Customer communication"}</p>
          <h1 className="mt-1 text-xl font-bold">{ar ? "رسائل واتساب" : "WhatsApp messages"}</h1>
          <p className="mt-1 text-sm text-slate-500">{ar ? "قوالب العيادة ومشاركة الرسائل من مكان واحد." : "Clinic templates and customer messages in one place."}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard" className={`rounded-lg border px-3 py-2 text-sm font-semibold ${input}`}>{ar ? "الرئيسية" : "Dashboard"}</Link>
          <button type="button" onClick={() => setLanguage(ar ? "en" : "ar")} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${input}`}>{ar ? "English" : "العربية"}</button>
          <button type="button" onClick={() => { const next = !dark; setDarkMode(next); writeVetraThemeMode(next); }} aria-label={dark ? "Light mode" : "Dark mode"} className={`h-10 w-10 rounded-lg border ${input}`}><span className={`mx-auto block h-4 w-4 rounded-full border-2 ${dark ? "border-amber-400 bg-amber-400" : "border-slate-500"}`} /></button>
        </div>
      </header>

      <div className={`mb-5 flex gap-1 border-b ${dark ? "border-white/10" : "border-slate-200"}`} role="tablist">
        {(["compose", "templates"] as const).map((value) => <button key={value} role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={`border-b-2 px-4 py-3 text-sm font-bold ${tab === value ? "border-cyan-500 text-cyan-500" : "border-transparent text-slate-500"}`}>{value === "compose" ? (ar ? "إرسال رسالة" : "Send a message") : (ar ? "قوالب الرسائل" : "Message templates")}</button>)}
      </div>

      {notice && <p role="status" className="mb-4 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600">{notice}</p>}
      {error && <p role="alert" className="mb-4 rounded-lg border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-500">{error}</p>}
      {loading ? <section className={`rounded-xl border p-10 text-center text-sm text-slate-500 ${surface}`}>{ar ? "جاري تحميل الرسائل..." : "Loading messages..."}</section> : tab === "compose" ? (
        <section className={`rounded-xl border p-4 sm:p-6 ${surface}`}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="relative text-sm font-semibold">{ar ? "بحث عن العميل" : "Search customer"}
              <input value={clientSearch} onChange={(event) => { const value = event.target.value; setClientSearch(value); setClientId(""); setPetId(""); if (!value.trim()) setError(""); }} autoComplete="off" placeholder={ar ? "ابحث بالاسم أو الهاتف أو Client ID..." : "Search name, phone, or Client ID..."} className={`mt-2 w-full rounded-lg border px-3 py-3 ${input}`} />
              {clientSearch && !client && <div className={`absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border shadow-xl ${dark ? "border-white/10 bg-[#181B21]" : "border-slate-200 bg-white"}`}>
                {filteredClients.length ? filteredClients.map((item) => <button key={item.id} type="button" onClick={() => { setClientId(item.id); setClientSearch(item.name); setPetId(""); setError(""); }} className={`block w-full border-b px-3 py-3 text-start last:border-0 ${dark ? "border-white/5 hover:bg-white/5" : "border-slate-100 hover:bg-slate-50"}`}>
                  <span className="block font-semibold">{item.name}</span><span className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-500"><span dir="ltr">{item.phone || (ar ? "لا يوجد هاتف" : "No phone")}</span><span dir="ltr">{ar ? "Client ID" : "Client ID"}: {item.client_code || "—"}</span></span>
                </button>) : <p className="px-3 py-3 text-sm text-slate-500">{ar ? "لا يوجد عميل مطابق." : "No matching customer."}</p>}
              </div>}
              {client && <p className="mt-2 text-xs text-slate-500"><span dir="ltr">{client.phone || (ar ? "لا يوجد هاتف محفوظ" : "No saved phone")}</span> · <span dir="ltr">Client ID: {client.client_code || "—"}</span><button type="button" onClick={() => { setClientId(""); setClientSearch(""); setPetId(""); }} className="ms-2 font-semibold text-cyan-600">{ar ? "تغيير" : "Change"}</button></p>}
            </label>
            <label className="text-sm font-semibold">{ar ? "الحيوان" : "Pet"}
              <select value={petId} onChange={(event) => setPetId(event.target.value)} disabled={!clientId} className={`mt-2 w-full rounded-lg border px-3 py-3 disabled:opacity-50 ${input}`}>
                <option value="">{ar ? "كل حيوانات العميل" : "All customer's pets"}</option>
                {clientPets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label className="text-sm font-semibold md:col-span-2">{ar ? "نوع الرسالة" : "Message type"}
              <select value={templateKey} onChange={(event) => selectTemplate(event.target.value as MessageTemplateKey | "custom")} className={`mt-2 w-full rounded-lg border px-3 py-3 ${input}`}>
                <option value="custom">{ar ? "رسالة مخصصة" : "Custom message"}</option>
                {MESSAGE_TEMPLATE_KEYS.map((key) => <option key={key} value={key}>{labelFor(key)}</option>)}
              </select>
            </label>
          </div>

          {templateKey !== "custom" && <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {TEMPLATE_PLACEHOLDERS[templateKey].filter((key) => !["customer_name", "phone_number", "client_id", "pet_name", "brand_name", "doctor_name"].includes(key)).map((key) => <label key={key} className="text-xs font-semibold text-slate-500">{`{${key}}`}
              <input value={variables[key] || ""} onChange={(event) => setVariables((current) => ({ ...current, [key]: event.target.value }))} placeholder={key.replaceAll("_", " ")} className={`mt-1 w-full rounded-lg border px-3 py-2.5 text-sm ${input}`} />
            </label>)}
          </div>}

          <label className="mt-5 block text-sm font-semibold">{ar ? "نص الرسالة" : "Message text"}
            {templateKey === "custom" ? <textarea value={customMessage} onChange={(event) => setCustomMessage(event.target.value)} rows={8} maxLength={6000} placeholder={ar ? "اكتب الرسالة التي تريد مشاركتها..." : "Write the message you want to share..."} className={`mt-2 w-full resize-y rounded-lg border p-3 text-sm leading-6 outline-none focus:border-cyan-500 ${input}`} /> : <div className={`mt-2 min-h-40 whitespace-pre-wrap rounded-lg border p-4 text-sm leading-7 ${dark ? "border-white/10 bg-[#111419]" : "border-slate-200 bg-slate-50"}`}>{composedText}</div>}
          </label>
          {templateKey !== "custom" && <p className="mt-2 text-xs text-slate-500">{ar ? "يمكن تعديل القالب من تبويب قوالب الرسائل." : "Edit this text in the Message templates tab."}</p>}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-slate-500">{ar ? "سيتم فتح محادثة واتساب بالرسالة جاهزة للمراجعة والإرسال." : "WhatsApp opens with the message ready for review and sending."}</span>
            <button type="button" onClick={sendWhatsApp} disabled={loading} className="rounded-lg bg-emerald-600 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50">{ar ? "فتح واتساب" : "Open WhatsApp"}</button>
          </div>
        </section>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-slate-500">{ar ? "عدّل الرسائل العربية والإنجليزية. المتغيرات بين الأقواس تُستبدل ببيانات العميل عند تجهيز الرسالة." : "Edit English and Arabic messages. Braced placeholders are filled from customer details when a message is prepared."}</p>
          {MESSAGE_TEMPLATE_KEYS.map((key) => <TemplateEditor key={key} templateKey={key} language={language} dark={dark} surface={surface} input={input} templates={templates} onChange={updateTemplate} onSave={saveTemplate} saving={savingKey === key} />)}
        </div>
      )}
    </div>
  </main>;
}

function TemplateEditor({
  templateKey, language, dark, surface, input, templates, onChange, onSave, saving,
}: {
  templateKey: MessageTemplateKey;
  language: MessageLanguage;
  dark: boolean;
  surface: string;
  input: string;
  templates: TemplateRecord;
  onChange: (key: MessageTemplateKey, language: MessageLanguage, value: string) => void;
  onSave: (key: MessageTemplateKey, reset?: boolean) => void;
  saving: boolean;
}) {
  const title = TEMPLATE_LABELS[templateKey][language];
  const placeholders = TEMPLATE_PLACEHOLDERS[templateKey];
  const preview = renderMessageTemplate(templates[templateKey][language], examples);
  return <article className={`overflow-hidden rounded-xl border ${surface}`}>
    <div className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-base font-bold">{title}</h2><p className="mt-1 text-xs text-slate-500">{templateKey.replaceAll("_", " ")}</p></div>
        <span className="rounded-full bg-cyan-500/10 px-2.5 py-1 text-[10px] font-bold text-cyan-600">{language === "ar" ? "قالب العيادة" : "Clinic template"}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">{placeholders.map((placeholder) => <code key={placeholder} className={`rounded border px-2 py-1 text-[11px] ${dark ? "border-white/10 bg-black/20 text-slate-300" : "border-slate-200 bg-slate-50 text-slate-600"}`}>{`{${placeholder}}`}</code>)}</div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {(["en", "ar"] as const).map((lang) => <label key={lang} className="text-xs font-semibold">{lang === "en" ? "English message" : "Arabic message"}
          <textarea dir={lang === "ar" ? "rtl" : "ltr"} value={templates[templateKey][lang]} onChange={(event) => onChange(templateKey, lang, event.target.value)} maxLength={6000} rows={6} className={`mt-2 w-full resize-y rounded-lg border p-3 text-sm leading-6 outline-none focus:border-cyan-500 ${input}`} />
        </label>)}
      </div>
      <div className={`mt-4 rounded-lg p-4 ${dark ? "bg-[#111419]" : "bg-slate-50"}`}>
        <p className="text-[10px] font-bold uppercase text-cyan-600">{language === "ar" ? "معاينة مثال" : "Example preview"}</p>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{preview}</p>
      </div>
    </div>
    <footer className={`flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 ${dark ? "border-white/[0.07]" : "border-slate-100"}`}>
      <button type="button" onClick={() => onSave(templateKey, true)} disabled={saving} className="text-xs font-semibold text-slate-500 hover:text-slate-800 disabled:opacity-50">{language === "ar" ? "إعادة للوضع الافتراضي" : "Reset to default"}</button>
      <button type="button" onClick={() => onSave(templateKey)} disabled={saving} className="rounded-lg bg-cyan-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-cyan-700 disabled:opacity-50">{saving ? (language === "ar" ? "جارٍ الحفظ..." : "Saving...") : (language === "ar" ? "حفظ القالب" : "Save template")}</button>
    </footer>
  </article>;
}
