import { useMemo } from "react";
import type { Language, PetDetails, Visit, VisitTranslations } from "./new-visit-types";
import { VitalCard } from "./NewVisitClinicalWidgets";
import { calculateAge, formatDate, genderLabel, speciesLabel } from "./new-visit-utils";

type VitalReading = { value: number; visit: Visit };
type VitalData = {
  weight: VitalReading[];
  temperature: VitalReading[];
  heartRate: VitalReading[];
  respiratoryRate: VitalReading[];
};

type Props = {
  petDetails: PetDetails;
  visits: Visit[];
  language: Language;
  darkMode: boolean;
  t: VisitTranslations;
  resetSelection: () => void;
  onOldVisitSelect: (visit: Visit) => void;
};

export default function NewVisitPatientOverview({
  petDetails, visits, language, darkMode, t, resetSelection, onOldVisitSelect,
}: Props) {
  const latestVisit = visits[0] || null;
  const setSelectedOldVisit = onOldVisitSelect;
  const vitalData = useMemo<VitalData>(() => ({
    weight: visits.filter((visit) => visit.weight !== null).map((visit) => ({ value: Number(visit.weight), visit })),
    temperature: visits.filter((visit) => visit.temperature !== null).map((visit) => ({ value: Number(visit.temperature), visit })),
    heartRate: visits.filter((visit) => visit.heart_rate !== null).map((visit) => ({ value: Number(visit.heart_rate), visit })),
    respiratoryRate: visits.filter((visit) => visit.respiratory_rate !== null).map((visit) => ({ value: Number(visit.respiratory_rate), visit })),
  }), [visits]);
  const latestWeight = vitalData.weight[0]?.value ?? null;
  const previousWeight = vitalData.weight[1]?.value ?? null;
  const latestTemperature = vitalData.temperature[0]?.value ?? null;
  const previousTemperature = vitalData.temperature[1]?.value ?? null;
  const latestHeartRate = vitalData.heartRate[0]?.value ?? null;
  const previousHeartRate = vitalData.heartRate[1]?.value ?? null;
  const latestRespiratoryRate = vitalData.respiratoryRate[0]?.value ?? null;
  const previousRespiratoryRate = vitalData.respiratoryRate[1]?.value ?? null;

  return (<>
            {/* PATIENT HEADER */}
            <section
              className={`overflow-hidden rounded-2xl border shadow-sm transition-colors duration-200 ${
                darkMode
                  ? "border-white/[0.07] bg-[#181B21]"
                  : "border-slate-200 bg-white"
              }`}
            >
              <div className="flex flex-col gap-5 p-6 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-500/10 text-sm font-bold text-cyan-700 dark:text-cyan-300">
                    {petDetails.species?.slice(0, 1).toUpperCase() || "P"}
                  </div>

                  <div>
                    <div
                      className={`mb-1 text-2xl font-bold ${
                        darkMode ? "text-white" : "text-slate-900"
                      }`}
                    >
                      {petDetails.name}
                    </div>

                    <div
                      className={`text-sm ${
                        darkMode
                          ? "text-slate-400"
                          : "text-slate-500"
                      }`}
                    >
                      {speciesLabel(petDetails.species, t)}
                      {petDetails.breed
                        ? ` • ${petDetails.breed}`
                        : ""}
                      {petDetails.gender
                        ? ` • ${genderLabel(
                            petDetails.gender,
                            t
                          )}`
                        : ""}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={resetSelection}
                  className={`rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
                    darkMode
                      ? "border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  ← {t.changeSelection}
                </button>
              </div>
            </section>

            {/* PATIENT SUMMARY */}
            <section>
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2
                    className={`text-xl font-bold ${
                      darkMode ? "text-white" : "text-slate-900"
                    }`}
                  >
                    {t.patientSummary}
                  </h2>

                  <p
                    className={`mt-1 text-sm ${
                      darkMode
                        ? "text-slate-500"
                        : "text-slate-500"
                    }`}
                  >
                    {t.previousVisits}: {visits.length}
                  </p>
                </div>
              </div>

              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-4">
                <div
                  className={`min-w-[148px] shrink-0 rounded-2xl border p-3 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg sm:min-w-0 sm:p-5 ${
                    darkMode
                      ? "border-slate-800 bg-slate-900"
                      : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="mb-1 flex h-7 w-7 items-center justify-center rounded-md bg-cyan-500/10 text-xs font-bold text-cyan-700 dark:text-cyan-300">O</div>

                  <div
                    className={`text-xs ${
                      darkMode
                        ? "text-slate-500"
                        : "text-slate-400"
                    }`}
                  >
                    {t.owner}
                  </div>

                  <div
                    className={`mt-1 font-semibold ${
                      darkMode ? "text-white" : "text-slate-900"
                    }`}
                  >
                    {petDetails.client?.name || "—"}
                  </div>

                  {petDetails.client?.phone && (
                    <div
                      className={`mt-1 text-xs ${
                        darkMode
                          ? "text-slate-500"
                          : "text-slate-500"
                      }`}
                    >
                      {petDetails.client.phone}
                    </div>
                  )}
                </div>

                <div
                  className={`min-w-[148px] shrink-0 rounded-2xl border p-3 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg sm:min-w-0 sm:p-5 ${
                    darkMode
                      ? "border-slate-800 bg-slate-900"
                      : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="mb-1 flex h-7 w-7 items-center justify-center rounded-md bg-cyan-500/10 text-xs font-bold text-cyan-700 dark:text-cyan-300">P</div>

                  <div
                    className={`text-xs ${
                      darkMode
                        ? "text-slate-500"
                        : "text-slate-400"
                    }`}
                  >
                    {t.breed}
                  </div>

                  <div
                    className={`mt-1 font-semibold ${
                      darkMode ? "text-white" : "text-slate-900"
                    }`}
                  >
                    {petDetails.breed || "—"}
                  </div>
                </div>

                <div
                  className={`min-w-[148px] shrink-0 rounded-2xl border p-3 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg sm:min-w-0 sm:p-5 ${
                    darkMode
                      ? "border-slate-800 bg-slate-900"
                      : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="mb-1 flex h-7 w-7 items-center justify-center rounded-md bg-cyan-500/10 text-xs font-bold text-cyan-700 dark:text-cyan-300">A</div>

                  <div
                    className={`text-xs ${
                      darkMode
                        ? "text-slate-500"
                        : "text-slate-400"
                    }`}
                  >
                    {t.birthDate}
                  </div>

                  <div
                    className={`mt-1 font-semibold ${
                      darkMode ? "text-white" : "text-slate-900"
                    }`}
                  >
                    {petDetails.birth_date
                      ? calculateAge(
                          petDetails.birth_date,
                          language
                        )
                      : "—"}
                  </div>

                  {petDetails.birth_date && (
                    <div
                      className={`mt-1 text-xs ${
                        darkMode
                          ? "text-slate-500"
                          : "text-slate-500"
                      }`}
                    >
                      {formatDate(
                        petDetails.birth_date,
                        language
                      )}
                    </div>
                  )}
                </div>

                <div
                  className={`min-w-[148px] shrink-0 rounded-2xl border p-3 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg sm:min-w-0 sm:p-5 ${
                    darkMode
                      ? "border-slate-800 bg-slate-900"
                      : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="mb-1 text-xs font-bold uppercase text-cyan-600 sm:mb-3">ID</div>

                  <div
                    className={`text-xs ${
                      darkMode
                        ? "text-slate-500"
                        : "text-slate-400"
                    }`}
                  >
                    {t.microchip}
                  </div>

                  <div
                    className={`mt-1 break-all font-semibold ${
                      darkMode ? "text-white" : "text-slate-900"
                    }`}
                  >
                    {petDetails.microchip || "—"}
                  </div>
                </div>
              </div>
            </section>

            {/* IMPORTANT NOTES */}
            <section
              className={`rounded-2xl border p-5 transition-all duration-300 ${
                darkMode
                  ? "border-amber-900/50 bg-amber-950/20"
                  : "border-amber-200 bg-amber-50"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="text-xs font-bold uppercase">!</div>

                <div>
                  <h3
                    className={`font-bold ${
                      darkMode
                        ? "text-amber-300"
                        : "text-amber-900"
                    }`}
                  >
                    {t.importantNotes}
                  </h3>

                  <p
                    className={`mt-1 whitespace-pre-wrap text-sm ${
                      darkMode
                        ? "text-amber-200/70"
                        : "text-amber-800/80"
                    }`}
                  >
                    {petDetails.notes || t.noNotes}
                  </p>
                </div>
              </div>
            </section>

            {/* LAST VISIT SUMMARY */}
            <section className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-3">
              <div
                className={`min-w-[210px] shrink-0 rounded-2xl border p-3 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg sm:min-w-0 sm:p-5 ${
                  darkMode
                    ? "border-slate-800 bg-slate-900"
                    : "border-slate-200 bg-white"
                }`}
              >
                <div className="mb-1 flex items-center gap-2 sm:mb-3">
                  <span className="text-xs font-bold text-cyan-700 dark:text-cyan-300">DATE</span>

                  <h3
                    className={`font-bold ${
                      darkMode ? "text-white" : "text-slate-900"
                    }`}
                  >
                    {t.lastVisit}
                  </h3>
                </div>

                <div
                  className={`text-sm ${
                    darkMode
                      ? "text-slate-400"
                      : "text-slate-600"
                  }`}
                >
                  {latestVisit
                    ? formatDate(
                        latestVisit.visit_date,
                        language
                      )
                    : t.noPreviousVisits}
                </div>
              </div>

              <div
                className={`min-w-[210px] shrink-0 rounded-2xl border p-3 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg sm:min-w-0 sm:p-5 ${
                  darkMode
                    ? "border-slate-800 bg-slate-900"
                    : "border-slate-200 bg-white"
                }`}
              >
                <div className="mb-1 flex items-center gap-2 sm:mb-3">
                  <span className="text-xs font-bold text-cyan-700 dark:text-cyan-300">DX</span>

                  <h3
                    className={`font-bold ${
                      darkMode ? "text-white" : "text-slate-900"
                    }`}
                  >
                    {t.lastDiagnosis}
                  </h3>
                </div>

                <div
                  className={`line-clamp-3 text-sm ${
                    darkMode
                      ? "text-slate-400"
                      : "text-slate-600"
                  }`}
                >
                  {latestVisit?.diagnosis ||
                    t.noDiagnosis}
                </div>
              </div>

              <div
                className={`min-w-[210px] shrink-0 rounded-2xl border p-3 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg sm:min-w-0 sm:p-5 ${
                  darkMode
                    ? "border-slate-800 bg-slate-900"
                    : "border-slate-200 bg-white"
                }`}
              >
                <div className="mb-1 flex items-center gap-2 sm:mb-3">
                  <span className="text-xs font-bold text-cyan-700 dark:text-cyan-300">RX</span>

                  <h3
                    className={`font-bold ${
                      darkMode ? "text-white" : "text-slate-900"
                    }`}
                  >
                    {t.lastTreatment}
                  </h3>
                </div>

                <div
                  className={`line-clamp-3 text-sm ${
                    darkMode
                      ? "text-slate-400"
                      : "text-slate-600"
                  }`}
                >
                  {latestVisit?.treatment ||
                    t.noTreatment}
                </div>
              </div>
            </section>

            {/* VITAL GRAPHS */}
            <section>
              <div className="mb-4">
                <h2
                  className={`text-xl font-bold ${
                    darkMode ? "text-white" : "text-slate-900"
                  }`}
                >
                  {t.trends}
                </h2>

                <p
                  className={`mt-1 text-sm ${
                    darkMode
                      ? "text-slate-500"
                      : "text-slate-500"
                  }`}
                >
                  Click any point to open that examination.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:gap-4 xl:grid-cols-4">
                <VitalCard
                  title={t.weight}
                  icon="KG"
                  latest={latestWeight}
                  previous={previousWeight}
                  unit={t.kg}
                  color="#3b82f6"
                  values={vitalData.weight}
                  onPointClick={setSelectedOldVisit}
                  darkMode={darkMode}
                  compact
                />

                <VitalCard
                  title={t.temperature}
                  icon="°C"
                  latest={latestTemperature}
                  previous={previousTemperature}
                  unit={t.celsius}
                  color="#f97316"
                  values={vitalData.temperature}
                  onPointClick={setSelectedOldVisit}
                  darkMode={darkMode}
                  compact
                />

                <VitalCard
                  title={t.heartRate}
                  icon="HR"
                  latest={latestHeartRate}
                  previous={previousHeartRate}
                  unit={t.bpm}
                  color="#ef4444"
                  values={vitalData.heartRate}
                  onPointClick={setSelectedOldVisit}
                  darkMode={darkMode}
                  compact
                />

                <VitalCard
                  title={t.respiratoryRate}
                  icon="RR"
                  latest={latestRespiratoryRate}
                  previous={previousRespiratoryRate}
                  unit={t.rpm}
                  color="#8b5cf6"
                  values={vitalData.respiratoryRate}
                  onPointClick={setSelectedOldVisit}
                  darkMode={darkMode}
                  compact
                />
              </div>
            </section>


  </>);
}
