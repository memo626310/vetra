import type { ReactNode } from "react";
import type { VisitTranslations } from "./new-visit-types";

type Props = {
  darkMode: boolean;
  t: VisitTranslations;
  saving: boolean;
  onSave: () => void;
  children: ReactNode;
};

export default function NewVisitEditorSection({ darkMode, t, saving, onSave, children }: Props) {
  return (
    <section
      className={`rounded-3xl border p-6 shadow-sm transition-colors duration-300 ${
        darkMode ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white"
      }`}
    >
      <div className="mb-6">
        <h2 className={`text-xl font-bold ${darkMode ? "text-white" : "text-slate-900"}`}>
          🩺 {t.examination}
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
          className="rounded-2xl bg-blue-600 px-7 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition-all duration-300 hover:-translate-y-1 hover:bg-blue-700 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? t.saving : `✓ ${t.saveVisit}`}
        </button>
      </div>
    </section>
  );
}
