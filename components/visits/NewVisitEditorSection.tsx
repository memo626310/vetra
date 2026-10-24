import type { ReactNode } from "react";
import type { VisitTranslations } from "./new-visit-types";

type Props = {
  darkMode: boolean;
  t: VisitTranslations;
  saving: boolean;
  onSave: () => void;
  onSaveWithBill?: () => void;
  billLabel?: string;
  saveLabel?: string;
  children: ReactNode;
};

export default function NewVisitEditorSection({ darkMode, t, saving, onSave, onSaveWithBill, billLabel, saveLabel, children }: Props) {
  return (
    <section
      className={`rounded-2xl border p-4 shadow-sm transition-colors duration-200 sm:p-6 ${
        darkMode ? "border-white/[0.07] bg-[#181B21]" : "border-slate-200 bg-white"
      }`}
    >
      <div className="mb-6">
        <h2 className={`text-xl font-bold ${darkMode ? "text-white" : "text-slate-900"}`}>
          {t.examination}
        </h2>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        {children}
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="rounded-lg bg-cyan-600 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-50 sm:px-7"
        >
          {saving ? t.saving : `✓ ${saveLabel || t.saveVisit}`}
        </button>
        {onSaveWithBill && <button
          type="button"
          onClick={onSaveWithBill}
          disabled={saving}
          className="rounded-2xl border border-cyan-500/40 bg-cyan-500/10 px-7 py-3.5 text-sm font-bold text-cyan-700 transition-colors hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50 dark:text-cyan-300"
        >
          {saving ? t.saving : billLabel || "Save visit & create bill"}
        </button>}
      </div>
    </section>
  );
}
