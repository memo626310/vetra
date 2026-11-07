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
      className={`rounded-2xl border border-s-4 border-s-cyan-400 p-4 pb-4 shadow-sm transition-colors duration-200 sm:p-6 sm:pb-28 ${
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
      <div className={`relative mt-8 border-t px-0 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-sm sm:fixed sm:inset-x-0 sm:bottom-0 sm:z-30 sm:mt-0 sm:px-4 sm:shadow-[0_-8px_24px_rgba(15,23,42,0.08)] sm:backdrop-blur-md ${darkMode ? "border-white/10 bg-[#181B21] sm:bg-[#181B21]/95" : "border-slate-200/90 bg-white sm:bg-white/95"}`}>
        <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-end sm:gap-3">
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="w-full rounded-lg bg-cyan-600 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:px-7"
          >
            {saving ? t.saving : `✓ ${saveLabel || t.saveVisit}`}
          </button>
          {onSaveWithBill && <button
            type="button"
            onClick={onSaveWithBill}
            disabled={saving}
            className="w-full rounded-2xl border border-cyan-500/40 bg-cyan-500/10 px-4 py-3 text-sm font-bold text-cyan-700 transition-colors hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50 dark:text-cyan-300 sm:w-auto sm:px-7 sm:py-3.5"
          >
            {saving ? t.saving : billLabel || "Save visit & create bill"}
          </button>}
        </div>
      </div>
    </section>
  );
}
