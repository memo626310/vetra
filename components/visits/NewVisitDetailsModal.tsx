import type { Language, Visit, VisitTranslations } from "./new-visit-types";
import { formatDate, formatTime } from "./new-visit-utils";

type Props = {
  selectedOldVisit: Visit | null;
  onClose: () => void;
  darkMode: boolean;
  language: Language;
  t: VisitTranslations;
};

export default function NewVisitDetailsModal({ selectedOldVisit, onClose, darkMode, language, t }: Props) {
  return (
    <>
        {/* OLD VISIT MODAL */}
        {selectedOldVisit && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
            onClick={onClose}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className={`max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl border p-6 shadow-2xl ${
                darkMode
                  ? "border-slate-800 bg-slate-900"
                  : "border-slate-200 bg-white"
              }`}
            >
              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <h2
                    className={`text-xl font-bold ${
                      darkMode ? "text-white" : "text-slate-900"
                    }`}
                  >
                    {t.visitDetails}
                  </h2>

                  <p
                    className={`mt-1 text-sm ${
                      darkMode
                        ? "text-slate-500"
                        : "text-slate-500"
                    }`}
                  >
                    {formatDate(
                      selectedOldVisit.visit_date,
                      language
                    )}{" "}
                    •{" "}
                    {formatTime(
                      selectedOldVisit.visit_date,
                      language
                    )}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={onClose}
                  className={`flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-200 hover:scale-105 ${
                    darkMode
                      ? "bg-slate-800 text-slate-300 hover:bg-slate-700"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  ✕
                </button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div
                  className={`rounded-2xl p-4 ${
                    darkMode
                      ? "bg-slate-800/70"
                      : "bg-slate-50"
                  }`}
                >
                  <div className="mb-1 text-xs text-slate-500">
                    {t.reason}
                  </div>

                  <div
                    className={`whitespace-pre-wrap text-sm font-medium ${
                      darkMode
                        ? "text-slate-200"
                        : "text-slate-800"
                    }`}
                  >
                    {selectedOldVisit.reason || "—"}
                  </div>
                </div>

                <div
                  className={`rounded-2xl p-4 ${
                    darkMode
                      ? "bg-slate-800/70"
                      : "bg-slate-50"
                  }`}
                >
                  <div className="mb-1 text-xs text-slate-500">
                    {t.weight}
                  </div>

                  <div
                    className={`text-sm font-medium ${
                      darkMode
                        ? "text-slate-200"
                        : "text-slate-800"
                    }`}
                  >
                    {selectedOldVisit.weight !== null
                      ? `${selectedOldVisit.weight} ${t.kg}`
                      : "—"}
                  </div>
                </div>

                <div
                  className={`rounded-2xl p-4 ${
                    darkMode
                      ? "bg-slate-800/70"
                      : "bg-slate-50"
                  }`}
                >
                  <div className="mb-1 text-xs text-slate-500">
                    {t.temperature}
                  </div>

                  <div
                    className={`text-sm font-medium ${
                      darkMode
                        ? "text-slate-200"
                        : "text-slate-800"
                    }`}
                  >
                    {selectedOldVisit.temperature !== null
                      ? `${selectedOldVisit.temperature}${t.celsius}`
                      : "—"}
                  </div>
                </div>

                <div
                  className={`rounded-2xl p-4 ${
                    darkMode
                      ? "bg-slate-800/70"
                      : "bg-slate-50"
                  }`}
                >
                  <div className="mb-1 text-xs text-slate-500">
                    {t.heartRate}
                  </div>

                  <div
                    className={`text-sm font-medium ${
                      darkMode
                        ? "text-slate-200"
                        : "text-slate-800"
                    }`}
                  >
                    {selectedOldVisit.heart_rate !== null
                      ? `${selectedOldVisit.heart_rate} ${t.bpm}`
                      : "—"}
                  </div>
                </div>

                <div
                  className={`rounded-2xl p-4 ${
                    darkMode
                      ? "bg-slate-800/70"
                      : "bg-slate-50"
                  }`}
                >
                  <div className="mb-1 text-xs text-slate-500">
                    {t.respiratoryRate}
                  </div>

                  <div
                    className={`text-sm font-medium ${
                      darkMode
                        ? "text-slate-200"
                        : "text-slate-800"
                    }`}
                  >
                    {selectedOldVisit.respiratory_rate !==
                    null
                      ? `${selectedOldVisit.respiratory_rate} ${t.rpm}`
                      : "—"}
                  </div>
                </div>
              </div>

              <div className="mt-5 space-y-4">
                <div>
                  <div
                    className={`mb-2 text-sm font-bold ${
                      darkMode
                        ? "text-slate-200"
                        : "text-slate-800"
                    }`}
                  >
                    {t.examinationNotes}
                  </div>

                  <div
                    className={`whitespace-pre-wrap rounded-2xl p-4 text-sm leading-7 ${
                      darkMode
                        ? "bg-slate-800/70 text-slate-300"
                        : "bg-slate-50 text-slate-700"
                    }`}
                  >
                    {selectedOldVisit.examination || "—"}
                  </div>
                </div>

                <div>
                  <div
                    className={`mb-2 text-sm font-bold ${
                      darkMode
                        ? "text-slate-200"
                        : "text-slate-800"
                    }`}
                  >
                    {t.diagnosis}
                  </div>

                  <div
                    className={`whitespace-pre-wrap rounded-2xl p-4 text-sm leading-7 ${
                      darkMode
                        ? "bg-slate-800/70 text-slate-300"
                        : "bg-slate-50 text-slate-700"
                    }`}
                  >
                    {selectedOldVisit.diagnosis || "—"}
                  </div>
                </div>

                <div>
                  <div
                    className={`mb-2 text-sm font-bold ${
                      darkMode
                        ? "text-slate-200"
                        : "text-slate-800"
                    }`}
                  >
                    {t.treatment}
                  </div>

                  <div
                    className={`whitespace-pre-wrap rounded-2xl p-4 text-sm leading-7 ${
                      darkMode
                        ? "bg-slate-800/70 text-slate-300"
                        : "bg-slate-50 text-slate-700"
                    }`}
                  >
                    {selectedOldVisit.treatment || "—"}
                  </div>
                </div>

                <div>
                  <div
                    className={`mb-2 text-sm font-bold ${
                      darkMode
                        ? "text-slate-200"
                        : "text-slate-800"
                    }`}
                  >
                    {t.visitNotes}
                  </div>

                  <div
                    className={`whitespace-pre-wrap rounded-2xl p-4 text-sm leading-7 ${
                      darkMode
                        ? "bg-slate-800/70 text-slate-300"
                        : "bg-slate-50 text-slate-700"
                    }`}
                  >
                    {selectedOldVisit.notes || "—"}
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
                    darkMode
                      ? "bg-slate-800 text-slate-200 hover:bg-slate-700"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {t.close}
                </button>
              </div>
            </div>
          </div>
        )}

    </>
  );
}
