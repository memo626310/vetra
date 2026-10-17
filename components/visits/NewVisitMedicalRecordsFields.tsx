"use client";

export type MedicalRecordDraft = {
  labTests: string;
  labNotes: string;
  surgeryTitle: string;
  surgeryStatus: "planned" | "completed";
  surgeryDate: string;
  surgeryNotes: string;
};

export const emptyMedicalRecordDraft: MedicalRecordDraft = {
  labTests: "",
  labNotes: "",
  surgeryTitle: "",
  surgeryStatus: "planned",
  surgeryDate: "",
  surgeryNotes: "",
};

export default function NewVisitMedicalRecordsFields({
  value,
  onChange,
  language,
  darkMode,
}: {
  value: MedicalRecordDraft;
  onChange: (value: MedicalRecordDraft) => void;
  language: "ar" | "en";
  darkMode: boolean;
}) {
  const ar = language === "ar";
  const field = `w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:border-cyan-500 ${darkMode ? "border-slate-700 bg-slate-950 text-white placeholder:text-slate-500" : "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400"}`;
  const card = darkMode ? "rounded-2xl border border-slate-800 bg-slate-950/50 p-4" : "rounded-2xl border border-slate-200 bg-slate-50/70 p-4";
  const update = (patch: Partial<MedicalRecordDraft>) => onChange({ ...value, ...patch });

  return (
    <section className="space-y-3">
      <h3 className={`font-bold ${darkMode ? "text-white" : "text-slate-900"}`}>
        {ar ? "التحاليل والجراحة" : "Lab tests & surgery"}
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className={card}>
          <label className="mb-2 block text-sm font-semibold">{ar ? "طلب تحاليل" : "Order lab tests"}</label>
          <textarea className={field} rows={3} value={value.labTests} onChange={(event) => update({ labTests: event.target.value })} placeholder={ar ? "اكتب كل تحليل في سطر، مثال: صورة دم كاملة" : "One test per line, e.g. CBC"} />
          <input className={`${field} mt-2`} value={value.labNotes} onChange={(event) => update({ labNotes: event.target.value })} placeholder={ar ? "ملاحظات للمعمل (اختياري)" : "Lab notes (optional)"} />
        </div>
        <div className={card}>
          <label className="mb-2 block text-sm font-semibold">{ar ? "تسجيل جراحة" : "Surgery record"}</label>
          <input className={field} value={value.surgeryTitle} onChange={(event) => update({ surgeryTitle: event.target.value })} placeholder={ar ? "اسم الجراحة" : "Surgery name"} />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <select className={field} value={value.surgeryStatus} onChange={(event) => update({ surgeryStatus: event.target.value as MedicalRecordDraft["surgeryStatus"] })}>
              <option value="planned">{ar ? "مخططة" : "Planned"}</option><option value="completed">{ar ? "أُجريت" : "Completed"}</option>
            </select>
            <input className={field} type="date" value={value.surgeryDate} onChange={(event) => update({ surgeryDate: event.target.value })} aria-label={ar ? "تاريخ الجراحة" : "Surgery date"} />
          </div>
          <textarea className={`${field} mt-2`} rows={2} value={value.surgeryNotes} onChange={(event) => update({ surgeryNotes: event.target.value })} placeholder={ar ? "ملاحظات الجراحة (اختياري)" : "Surgery notes (optional)"} />
        </div>
      </div>
    </section>
  );
}
