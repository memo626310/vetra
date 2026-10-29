"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getClinicDb } from "@/lib/clinic-db";
import { vetraCore } from "@/lib/vetra-core";

type PendingVisit = {
  id: string;
  client_id: string;
  pet_id: string;
  visit_date: string;
  created_at: string;
  reason: string | null;
  invoice_id?: string | null;
  invoice_status?: string | null;
  client: { name: string } | null;
  pet: { name: string } | null;
};

type Props = {
  clinicId: string;
  language: "ar" | "en";
  darkMode: boolean;
  canDismiss: boolean;
  canHideInvoice: boolean;
};

function isMissingTable(error: { code?: string; message?: string }) {
  return error.code === "42P01" || error.code === "PGRST205"
    || /relation .* does not exist|table .* not found|could not find the table/i.test(error.message || "");
}

export default function ReceptionCheckoutNotice({ clinicId, language, darkMode, canDismiss, canHideInvoice }: Props) {
  const router = useRouter();
  const [visits, setVisits] = useState<PendingVisit[]>([]);
  const [dismissedVisitId, setDismissedVisitId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const isAr = language === "ar";

  const loadPendingVisits = useCallback(async () => {
    try {
      const db = await getClinicDb();
      const [visitsResult, invoicesResult, dismissalsResult, queueResult] = await Promise.all([
        db.from("visits")
          .select("id,client_id,pet_id,visit_date,created_at,reason,client:clients(name),pet:pets(name)")
          .eq("clinic_id", clinicId)
          .order("created_at", { ascending: false })
          .limit(250),
        // Keep issued invoices in this lookup so they are not treated as missing.
        db.from("invoices")
          .select("id,visit_id,status,notes")
          .eq("clinic_id", clinicId)
          .not("visit_id", "is", null),
        db.from("clinic_checkout_dismissals")
          .select("visit_id")
          .eq("clinic_id", clinicId),
        db.from("clinic_reception_queue")
          .select("visit_id")
          .eq("clinic_id", clinicId),
      ]);
      if (visitsResult.error) throw visitsResult.error;
      if (invoicesResult.error) throw invoicesResult.error;
      if (dismissalsResult.error && !isMissingTable(dismissalsResult.error)) throw dismissalsResult.error;
      if (queueResult.error && !isMissingTable(queueResult.error)) throw queueResult.error;

      const invoiceByVisit = new Map<string, { id: string; status: string }>();
      const legacySentVisitIds = new Set<string>();
      for (const invoice of invoicesResult.data || []) {
        if (invoice.visit_id) {
          const visitId = String(invoice.visit_id);
          invoiceByVisit.set(visitId, { id: String(invoice.id), status: String(invoice.status) });
          if (invoice.notes === "فاتورة من الزيارة للاستقبال" || invoice.notes === "Invoice from visit for reception") {
            legacySentVisitIds.add(visitId);
          }
        }
      }
      const dismissedVisitIds = new Set((dismissalsResult.data || []).map((dismissal) => String(dismissal.visit_id)));
      const sentVisitIds = new Set([
        ...legacySentVisitIds,
        ...(queueResult.data || []).map((row) => String(row.visit_id)),
      ]);
      setVisits(((visitsResult.data || []) as unknown as PendingVisit[])
        .filter((visit) => {
          const invoice = invoiceByVisit.get(visit.id);
          return sentVisitIds.has(visit.id)
            && (!invoice || invoice.status === "draft")
            && !dismissedVisitIds.has(visit.id);
        })
        .map((visit) => ({
          ...visit,
          invoice_id: invoiceByVisit.get(visit.id)?.id || null,
          invoice_status: invoiceByVisit.get(visit.id)?.status || null,
        })));
    } catch (error) {
      const detail = error as { code?: string; message?: string; details?: string; hint?: string };
      console.error("RECEPTION CHECKOUT NOTICE ERROR:", {
        code: detail?.code,
        message: detail?.message || (error instanceof Error ? error.message : String(error)),
        details: detail?.details,
        hint: detail?.hint,
      });
    }
  }, [clinicId]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadPendingVisits(), 0);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadPendingVisits();
    }, 10000);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(interval);
    };
  }, [loadPendingVisits]);

  if (!visits.length) return null;

  const surface = darkMode
    ? "border-amber-400/25 bg-amber-400/[0.07] text-slate-100"
    : "border-amber-300 bg-amber-50 text-slate-900";
  const rowSurface = darkMode
    ? "border-white/10 bg-black/10 hover:bg-black/20"
    : "border-amber-200 bg-white/70 hover:bg-white";

  function openInvoice(visit: PendingVisit) {
    if (visit.invoice_id && visit.invoice_status === "draft") {
      editInvoice(visit);
      return;
    }
    router.push(visit.invoice_id ? `/invoices/${encodeURIComponent(visit.invoice_id)}` : `/invoices/new?visit=${encodeURIComponent(visit.id)}&client=${encodeURIComponent(visit.client_id)}&pet=${encodeURIComponent(visit.pet_id)}`);
  }

  function editInvoice(visit: PendingVisit) {
    if (!visit.invoice_id) return;
    router.push(`/invoices/new?draft=${encodeURIComponent(visit.invoice_id)}`);
  }

  async function dismissVisit(visitId: string) {
    setDismissedVisitId(visitId);
    setActionError("");
    try {
      const { data, error } = await vetraCore.auth.getSession();
      const token = data.session?.access_token;
      if (error || !token) throw new Error(isAr ? "انتهت الجلسة. سجّل الدخول مرة أخرى." : "Your session expired. Sign in again.");

      const response = await fetch("/api/reception/checkout-dismissals", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ visitId }),
      });
      const result = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(result?.error || (isAr ? "تعذر إزالة الزيارة من قائمة التحصيل." : "Could not remove the visit from checkout."));
      setVisits((current) => current.filter((visit) => visit.id !== visitId));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : (isAr ? "تعذر إزالة الزيارة." : "Could not remove the visit."));
    } finally {
      setDismissedVisitId(null);
    }
  }

  async function hideInvoice(visitId: string) {
    if (!canHideInvoice) return;
    const confirmed = window.confirm(isAr
      ? "سيتم إخفاء الفاتورة من الداشبورد والاستقبال مع الاحتفاظ بها في سجل الفواتير. هل تريد المتابعة؟"
      : "Hide this invoice from the dashboard and reception while keeping it in the invoice history?");
    if (!confirmed) return;

    setDismissedVisitId(visitId);
    setActionError("");
    try {
      const { data, error } = await vetraCore.auth.getSession();
      const token = data.session?.access_token;
      if (error || !token) throw new Error(isAr ? "انتهت الجلسة. سجّل الدخول مرة أخرى." : "Your session expired. Sign in again.");

      const response = await fetch("/api/reception/checkout-dismissals", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ visitId }),
      });
      const result = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(result?.error || (isAr ? "تعذر إخفاء الفاتورة من القوائم." : "Could not hide the invoice from the lists."));
      setVisits((current) => current.filter((visit) => visit.id !== visitId));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : (isAr ? "تعذر إخفاء الفاتورة." : "Could not hide the invoice."));
    } finally {
      setDismissedVisitId(null);
    }
  }

  return (
    <section role="status" aria-live="polite" className={`mb-5 border p-4 sm:p-5 ${surface}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-xl">🧾</span>
          <div>
            <h2 className="font-bold">{isAr ? "فواتير الزيارات بانتظار الاستقبال" : "Visit invoices waiting for reception"}</h2>
            <p className="mt-0.5 text-sm text-slate-500">{isAr ? `${visits.length} فاتورة بانتظار المراجعة والإصدار` : `${visits.length} invoices need review and issuance`}</p>
          </div>
        </div>
        <span className="flex h-8 min-w-8 items-center justify-center rounded-full bg-amber-500 px-2 text-sm font-black text-slate-950">{visits.length}</span>
      </div>

      {actionError && <p role="alert" className="mt-3 text-sm text-red-600">{actionError}</p>}

      <ul className={`mt-4 space-y-2 ${canDismiss ? "max-h-96 overflow-y-auto pe-1" : ""}`}>
        {(canDismiss ? visits : visits.slice(0, 5)).map((visit) => (
          <li key={visit.id} className={`flex items-center gap-2 border px-3 py-2 ${rowSurface}`}>
            <button type="button" onClick={() => openInvoice(visit)} className="flex min-h-12 min-w-0 flex-1 items-center justify-between gap-3 text-start transition">
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">
                  {visit.client?.name || (isAr ? "عميل" : "Client")}
                  {" · "}
                  {visit.pet?.name || (isAr ? "حيوان" : "Pet")}
                </span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  {visit.reason || (isAr ? "زيارة مكتملة" : "Visit completed")}
                  {" · "}
                  {new Date(visit.visit_date || visit.created_at).toLocaleString(isAr ? "ar-EG" : "en-EG", { dateStyle: "medium", timeStyle: "short" })}
                </span>
              </span>
              <span aria-hidden="true" className="shrink-0 text-lg font-bold text-amber-500">{isAr ? "←" : "→"}</span>
            </button>
            {visit.invoice_id && canDismiss && visit.invoice_status === "draft" && (
              <button type="button" onClick={() => editInvoice(visit)} className={`shrink-0 border px-3 py-2 text-xs font-bold ${darkMode ? "border-cyan-400/20 text-cyan-300" : "border-cyan-200 text-cyan-700"}`}>
                {isAr ? "تعديل" : "Edit"}
              </button>
            )}
            {canHideInvoice && visit.invoice_id && (
              <button
                type="button"
                onClick={() => void hideInvoice(visit.id)}
                disabled={dismissedVisitId !== null}
                title={isAr ? "إخفاء من الداشبورد والاستقبال" : "Hide from dashboard and reception"}
                aria-label={`${isAr ? "إخفاء الفاتورة" : "Hide invoice"}: ${visit.client?.name || visit.id}`}
                className={`flex h-9 w-9 shrink-0 items-center justify-center border text-lg font-semibold transition disabled:cursor-wait disabled:opacity-50 ${darkMode ? "border-white/10 text-slate-400 hover:border-red-400/40 hover:text-red-300" : "border-slate-200 text-slate-500 hover:border-red-300 hover:text-red-600"}`}
              >
                {dismissedVisitId === visit.id ? "…" : "×"}
              </button>
            )}
            {canDismiss && !visit.invoice_id && (
              <button
                type="button"
                onClick={() => void dismissVisit(visit.id)}
                disabled={dismissedVisitId !== null}
                title={isAr ? "إزالة من قائمة التحصيل" : "Remove from checkout list"}
                aria-label={`${isAr ? "إزالة من قائمة التحصيل" : "Remove from checkout list"}: ${visit.client?.name || visit.id}`}
                className={`flex h-9 w-9 shrink-0 items-center justify-center border text-lg font-semibold transition disabled:cursor-wait disabled:opacity-50 ${darkMode ? "border-white/10 text-slate-400 hover:border-red-400/40 hover:text-red-300" : "border-slate-200 text-slate-500 hover:border-red-300 hover:text-red-600"}`}
              >
                {dismissedVisitId === visit.id ? "…" : "×"}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
