"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getClinicDb } from "@/lib/clinic-db";
import { openWhatsAppTemplate } from "@/lib/clinic-message-templates";

type VisitRow = {
  id: string; client_id: string; pet_id: string; visit_date: string; reason: string | null;
  examination: string | null; diagnosis: string | null; treatment: string | null; notes: string | null;
  weight: number | null; temperature: number | null; heart_rate: number | null; respiratory_rate: number | null;
};
type Attachment = { id: string; file_name: string; storage_path: string; mime_type: string; category: "analysis" | "xray"; url: string };
type Invoice = { id: string; invoice_number: number; status: string; total: number; paid_amount: number; subtotal: number };
type InvoiceItem = { id: string; service_name: string | null; description: string | null; quantity: number; unit_price: number; total: number };

export default function VisitDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const [language, setLanguage] = useState<"en" | "ar">("en");
  const [darkMode, setDarkMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [visit, setVisit] = useState<VisitRow | null>(null);
  const [petName, setPetName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
  const [message, setMessage] = useState("");
  const ar = language === "ar";

  useEffect(() => {
    const savedLanguage = localStorage.getItem("vetra-language");
    const savedTheme = localStorage.getItem("vetra-dark-mode");
    setLanguage(savedLanguage === "ar" ? "ar" : "en");
    setDarkMode(savedTheme === "true");
  }, []);

  const loadVisit = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const db = await getClinicDb();
      const { data, error } = await db.from("visits").select("*").eq("id", id).single();
      if (error || !data) throw error || new Error(ar ? "الزيارة غير موجودة" : "Visit not found");
      const row = data as VisitRow;
      setVisit(row);
      const [{ data: pet }, { data: owner }, { data: invoiceData }, attachmentsResult] = await Promise.all([
        db.from("pets").select("name").eq("id", row.pet_id).maybeSingle(),
        db.from("clients").select("name,phone").eq("id", row.client_id).maybeSingle(),
        db.from("invoices").select("id,invoice_number,status,total,paid_amount,subtotal")
          .eq("visit_id", row.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        db.from("visit_attachments").select("id,file_name,storage_path,mime_type,category").eq("visit_id", row.id).order("created_at", { ascending: false }),
      ]);
      setPetName(pet?.name || "");
      setOwnerName(owner?.name || "");
      setOwnerPhone(owner?.phone || "");
      if (attachmentsResult.error) {
        setMessage(ar ? "شغّل إعدادات المرفقات على قاعدة بيانات العيادة لعرض الملفات." : "Run the visit-attachments tenant SQL to enable file attachments.");
      } else {
        const linked = await Promise.all((attachmentsResult.data || []).map(async (file) => {
          const { data: signed } = await db.storage.from("visit-attachments").createSignedUrl(file.storage_path, 3600);
          return { ...file, url: signed?.signedUrl || "" } as Attachment;
        }));
        setAttachments(linked.filter((file) => file.url));
      }
      if (invoiceData) {
        const bill = invoiceData as Invoice;
        setInvoice(bill);
        const { data: rows } = await db.from("invoice_items").select("id,service_name,description,quantity,unit_price,total").eq("invoice_id", bill.id);
        setInvoiceItems((rows || []) as InvoiceItem[]);
      } else {
        setInvoice(null);
        setInvoiceItems([]);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : (ar ? "تعذر تحميل الزيارة" : "Could not load visit"));
    } finally {
      setLoading(false);
    }
  }, [ar, id]);

  useEffect(() => {
    if (!id) return;
    void loadVisit();
  }, [id, loadVisit]);

  const page = darkMode ? "min-h-screen bg-[#0F1115] text-slate-100" : "min-h-screen bg-[#F7F8FA] text-slate-900";
  const surface = darkMode ? "border-white/[0.07] bg-[#181B21]" : "border-slate-200 bg-white";
  const field = darkMode ? "border-white/[0.08] bg-[#111419] text-slate-100" : "border-slate-200 bg-white text-slate-900";
  const money = (amount: number) => new Intl.NumberFormat(ar ? "ar-EG" : "en-EG", { style: "currency", currency: "EGP" }).format(amount || 0);
  const label = (value: string | null) => value?.replaceAll("_", " ") || (ar ? "غير محدد" : "Not specified");
  const shareFollowup = () => {
    if (!visit || !ownerPhone) {
      setMessage(ar ? "رقم هاتف المالك غير متاح." : "Owner phone number is not available.");
      return;
    }
    void openWhatsAppTemplate(ownerPhone, "followup_reminder", ar ? "ar" : "en", {
      customer_name: ownerName,
      pet_name: petName,
      follow_up_date: new Date(visit.visit_date).toLocaleDateString(ar ? "ar-EG" : "en-US"),
      notes: visit.notes || "",
      brand_name: "VETRA",
    });
  };

  return <main dir={ar ? "rtl" : "ltr"} data-vetra-visit-theme={darkMode ? "dark" : "light"} className={page}>
    <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-8">
      <header className={`mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 ${surface}`}>
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-600 text-xs font-bold text-white">V</div>
          <div><p className="text-xs font-semibold uppercase text-cyan-700 dark:text-cyan-300">VETRA / {ar ? "الزيارات" : "Visits"}</p><h1 className="mt-1 text-lg font-bold">{ar ? "تفاصيل الزيارة" : "Visit details"}</h1></div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={shareFollowup} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white">{ar ? "إرسال متابعة واتساب" : "Send follow-up on WhatsApp"}</button>
          <Link href={`/prescriptions/${id}`} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${field}`}>{ar ? "عرض الروشتة" : "View prescription"}</Link>
          <Link href="/dashboard" className={`rounded-lg border px-3 py-2 text-sm font-semibold ${field}`}>{ar ? "الرئيسية" : "Dashboard"}</Link>
          <button type="button" onClick={() => { const next = !darkMode; setDarkMode(next); localStorage.setItem("vetra-dark-mode", String(next)); }} aria-label={darkMode ? "Light mode" : "Dark mode"} className={`h-10 w-10 rounded-lg border ${field}`}><span className={`mx-auto block h-4 w-4 rounded-full border-2 ${darkMode ? "border-amber-400 bg-amber-400" : "border-slate-500"}`} /></button>
        </div>
      </header>

      {message && <div className={`mb-4 rounded-lg border px-4 py-3 text-sm ${darkMode ? "border-amber-400/20 bg-amber-400/10 text-amber-200" : "border-amber-200 bg-amber-50 text-amber-800"}`}>{message}</div>}
      {loading ? <div className={`rounded-xl border p-8 text-center ${surface}`}>{ar ? "جاري تحميل الزيارة..." : "Loading visit..."}</div> : !visit ? <div className={`rounded-xl border p-8 text-center ${surface}`}>{message}</div> : <>
        <section className={`mb-5 grid gap-4 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-4 ${surface}`}>
          <Info label={ar ? "الحيوان" : "Pet"} value={petName} />
          <Info label={ar ? "المالك" : "Owner"} value={ownerName} />
          <Info label={ar ? "السبب" : "Reason"} value={label(visit.reason)} />
          <Info label={ar ? "التاريخ" : "Date"} value={new Date(visit.visit_date).toLocaleString(ar ? "ar-EG" : "en-US")} />
        </section>

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-5">
            <section className={`rounded-xl border p-5 ${surface}`}>
              <h2 className="text-base font-bold">{ar ? "السجل الطبي" : "Clinical record"}</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Record label={ar ? "الأعراض والفحص" : "Symptoms and examination"} value={visit.examination} />
                <Record label={ar ? "التشخيص" : "Diagnosis"} value={visit.diagnosis} />
                <Record label={ar ? "العلاج والخدمات" : "Treatment and services"} value={visit.treatment} />
                <Record label={ar ? "ملاحظات الطبيب" : "Doctor notes"} value={visit.notes} />
              </div>
            </section>
            <section className={`rounded-xl border p-5 ${surface}`}>
              <h2 className="text-base font-bold">{ar ? "المرفقات الطبية" : "Medical attachments"}</h2>
              {attachments.length ? <ul className="mt-3 divide-y divide-slate-200 dark:divide-white/10">{attachments.map((file) => <li key={file.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><span className="min-w-0 flex-1"><span className="block truncate font-semibold">{file.file_name}</span><span className="text-xs text-slate-500">{file.category === "xray" ? (ar ? "أشعة" : "X-ray") : (ar ? "تحليل" : "Analysis")}</span></span><a href={file.url} target="_blank" rel="noreferrer" className="rounded-lg bg-cyan-600 px-3 py-2 font-semibold text-white">{ar ? "فتح" : "Open"}</a></li>)}</ul> : <p className="mt-3 text-sm text-slate-500">{ar ? "لا توجد مرفقات." : "No attachments."}</p>}
            </section>
          </div>

          <aside className={`overflow-hidden rounded-xl border lg:sticky lg:top-5 ${surface}`}>
            <div className="border-b border-slate-200 p-4 dark:border-white/10"><h2 className="font-bold text-cyan-700 dark:text-cyan-300">{ar ? "فاتورة الزيارة" : "Visit bill"}</h2></div>
            {invoice ? <>
              <div className="divide-y divide-slate-200 dark:divide-white/10">{invoiceItems.map((item) => <div key={item.id} className="flex justify-between gap-3 px-4 py-3 text-sm"><span className="min-w-0"><span className="block font-semibold">{item.service_name || item.description || (ar ? "خدمة" : "Service")}</span><span className="text-xs text-slate-500">{item.quantity} × {money(Number(item.unit_price))}</span></span><span className="shrink-0 font-semibold">{money(Number(item.total))}</span></div>)}</div>
              <div className="space-y-2 p-4 text-sm"><div className="flex justify-between"><span className="text-slate-500">{ar ? "الإجمالي" : "Total"}</span><b>{money(Number(invoice.total))}</b></div><div className="flex justify-between"><span className="text-slate-500">{ar ? "المدفوع" : "Paid"}</span><b>{money(Number(invoice.paid_amount))}</b></div><div className="flex justify-between border-t border-slate-200 pt-2 font-bold dark:border-white/10"><span>{ar ? "المتبقي" : "Balance"}</span><span className="text-cyan-700 dark:text-cyan-300">{money(Math.max(0, Number(invoice.total) - Number(invoice.paid_amount)))}</span></div>
                <p className="pt-1 text-xs text-slate-500">{ar ? `فاتورة #${invoice.invoice_number} · ${label(invoice.status)}` : `Invoice #${invoice.invoice_number} · ${label(invoice.status)}`}</p>
                <Link href={`/invoices/${invoice.id}`} className="mt-2 block rounded-lg bg-cyan-600 px-4 py-3 text-center text-sm font-bold text-white">{ar ? "فتح الفاتورة" : "Open bill"}</Link>
              </div>
            </> : <div className="p-4"><p className="text-sm text-slate-500">{ar ? "لا توجد فاتورة مرتبطة بهذه الزيارة." : "No bill is linked to this visit."}</p><Link href={`/invoices/new?visit=${id}`} className="mt-3 block rounded-lg bg-cyan-600 px-4 py-3 text-center text-sm font-bold text-white">{ar ? "إنشاء فاتورة" : "Create bill"}</Link></div>}
          </aside>
        </div>
      </>}
    </div>
  </main>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><div className="text-xs font-medium text-slate-500">{label}</div><div className="mt-1 break-words text-sm font-semibold">{value || "—"}</div></div>;
}

function Record({ label, value }: { label: string; value: string | null }) {
  return <div className="min-w-0"><h3 className="text-xs font-semibold text-slate-500">{label}</h3><p className="mt-2 min-h-6 whitespace-pre-wrap break-words text-sm leading-6">{value || "—"}</p></div>;
}
