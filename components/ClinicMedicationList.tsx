import type { ClinicMedicationEntry } from "@/lib/clinic-drawer-prescriptions";

export default function ClinicMedicationList({ entries, ar, darkMode = false }: { entries: ClinicMedicationEntry[]; ar: boolean; darkMode?: boolean }) {
  if (!entries.length) return null;
  return <section aria-label={ar ? "أدوية العيادة" : "Clinic medications"} className={`my-4 break-inside-avoid rounded-xl border p-4 ${darkMode ? "border-slate-700 bg-slate-950/50" : "border-slate-200 bg-slate-50"}`}>
    <h3 className="mb-3 font-bold">{ar ? "أدوية العيادة" : "Clinic medications"}</h3>
    <ol className="space-y-3">{entries.map((entry, index) => <li key={entry.id} className="break-inside-avoid text-sm">
      <div className="font-semibold">{index + 1}. {entry.name}</div>
      <p className={`mt-1 text-xs leading-6 ${darkMode ? "text-slate-300" : "text-slate-600"}`}>{ar ? "الكمية المصروفة" : "Dispensed quantity"}: {entry.quantity}{entry.unit ? ` ${entry.unit}` : ""}</p>
    </li>)}</ol>
  </section>;
}
