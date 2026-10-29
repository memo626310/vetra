"use client";

import { useEffect, useState } from "react";
import { getClinicContext, getClinicDb } from "@/lib/clinic-db";
import { humanPrescriptionDetails, humanPrescriptionFromRecord, type HumanPrescription } from "@/lib/human-prescriptions";

export type HumanMedicationEntry = { id: string; name: string; prescription: HumanPrescription };

export function HumanMedicationList({ entries, ar, darkMode = false, showBillingNote = false }: { entries: HumanMedicationEntry[]; ar: boolean; darkMode?: boolean; showBillingNote?: boolean }) {
  if (!entries.length) return null;
  return <section aria-label={ar ? "الأدوية البشرية" : "Human medications"} className={`my-4 break-inside-avoid rounded-xl border p-4 ${darkMode ? "border-slate-700 bg-slate-950/50" : "border-slate-200 bg-slate-50"}`}>
    <h3 className="mb-3 font-bold">{ar ? "الأدوية البشرية" : "Human medications"}</h3>
    {showBillingNote && <p className={`mb-3 text-xs ${darkMode ? "text-cyan-300" : "text-cyan-700"}`}>{ar ? "روشتة فقط — بدون سعر، ولا تُضاف إلى إجمالي الفاتورة." : "Prescription only — no charge; excluded from the invoice total."}</p>}
    <ol className="space-y-3">{entries.map((entry, index) => <li key={entry.id} className="break-inside-avoid text-sm">
      <div className="font-semibold">{index + 1}. {entry.name}</div>
      <p className={`mt-1 whitespace-pre-wrap text-xs leading-6 ${darkMode ? "text-slate-300" : "text-slate-600"}`}>{humanPrescriptionDetails(entry.prescription, ar)}</p>
    </li>)}</ol>
  </section>;
}

export default function VisitHumanMedications({ visitId, ar, darkMode = false }: { visitId: string; ar: boolean; darkMode?: boolean }) {
  const [loadedVisit, setLoadedVisit] = useState("");
  const [entries, setEntries] = useState<HumanMedicationEntry[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!visitId) return;
    let cancelled = false;
    void (async () => {
      try {
        const [db, context] = await Promise.all([getClinicDb(), getClinicContext()]);
        const { data, error: loadError } = await db.from("visit_prescriptions").select("id,medication_name,prescription,source")
          .eq("clinic_id", context.clinic_id).eq("visit_id", visitId).order("created_at", { ascending: true });
        if (loadError) throw loadError;
        if (!cancelled) {
          setEntries((data || []).flatMap((row) => {
            const prescription = humanPrescriptionFromRecord(row);
            return prescription ? [{ id: String(row.id), name: String(row.medication_name), prescription }] : [];
          }));
          setError("");
        }
      } catch (cause) {
        if (!cancelled) setError(ar ? "تعذر تحميل قائمة الأدوية البشرية." : "Could not load human medications.");
        console.error("INVOICE HUMAN MEDICATIONS:", cause);
      } finally { if (!cancelled) setLoadedVisit(visitId); }
    })();
    return () => { cancelled = true; };
  }, [visitId, ar]);

  if (!visitId) return null;
  if (loadedVisit !== visitId) return <p role="status" className="px-4 py-3 text-xs text-slate-500 print:hidden">{ar ? "جارٍ تحميل الأدوية البشرية..." : "Loading human medications..."}</p>;
  if (error) return <p role="alert" className="px-4 py-3 text-sm text-rose-600">{error}</p>;
  return <HumanMedicationList entries={entries} ar={ar} darkMode={darkMode} showBillingNote />;
}
