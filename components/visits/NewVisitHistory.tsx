import type { Language, Visit, VisitTranslations } from "./new-visit-types";
import { formatDate, formatTime } from "./new-visit-utils";

type Props = {
  visits: Visit[];
  darkMode: boolean;
  language: Language;
  t: VisitTranslations;
  onSelect: (visit: Visit) => void;
};

export default function NewVisitHistory({ visits, darkMode, language, t, onSelect }: Props) {
  const setSelectedOldVisit = onSelect;
  return (<>
            {/* VISIT HISTORY */}
            <section>
              <div className="mb-4">
                <h2
                  className={`text-xl font-bold ${
                    darkMode ? "text-white" : "text-slate-900"
                  }`}
                >
                  📋 {t.visitHistory}
                </h2>
              </div>

              {visits.length === 0 ? (
                <div
                  className={`rounded-2xl border p-8 text-center ${
                    darkMode
                      ? "border-slate-800 bg-slate-900 text-slate-500"
                      : "border-slate-200 bg-white text-slate-400"
                  }`}
                >
                  {t.noHistory}
                </div>
              ) : (
                <div className="space-y-3">
                  {visits.map((visit, index) => (
                    <div
                      key={visit.id}
                      className={`group rounded-2xl border p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg ${
                        darkMode
                          ? "border-slate-800 bg-slate-900 hover:border-slate-700"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex items-start gap-4">
                          <div
                            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl font-bold ${
                              index === 0
                                ? "bg-blue-600 text-white"
                                : darkMode
                                ? "bg-slate-800 text-slate-400"
                                : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {index === 0 ? "★" : index + 1}
                          </div>

                          <div>
                            <div
                              className={`font-semibold ${
                                darkMode
                                  ? "text-white"
                                  : "text-slate-900"
                              }`}
                            >
                              {formatDate(
                                visit.visit_date,
                                language
                              )}
                            </div>

                            <div
                              className={`mt-1 text-xs ${
                                darkMode
                                  ? "text-slate-500"
                                  : "text-slate-500"
                              }`}
                            >
                              {formatTime(
                                visit.visit_date,
                                language
                              )}
                            </div>

                            {visit.reason && (
                              <div
                                className={`mt-3 text-sm ${
                                  darkMode
                                    ? "text-slate-300"
                                    : "text-slate-600"
                                }`}
                              >
                                {visit.reason}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {visit.weight !== null && (
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                darkMode
                                  ? "bg-blue-950 text-blue-300"
                                  : "bg-blue-50 text-blue-700"
                              }`}
                            >
                              ⚖️ {visit.weight} {t.kg}
                            </span>
                          )}

                          {visit.temperature !== null && (
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                darkMode
                                  ? "bg-orange-950 text-orange-300"
                                  : "bg-orange-50 text-orange-700"
                              }`}
                            >
                              🌡️ {visit.temperature}
                              {t.celsius}
                            </span>
                          )}

                          {visit.heart_rate !== null && (
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                darkMode
                                  ? "bg-rose-950 text-rose-300"
                                  : "bg-rose-50 text-rose-700"
                              }`}
                            >
                              ❤️ {visit.heart_rate} {t.bpm}
                            </span>
                          )}

                          <button
                            type="button"
                            onClick={() =>
                              setSelectedOldVisit(visit)
                            }
                            className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-md"
                          >
                            {t.viewExamination}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
  </>);
}
