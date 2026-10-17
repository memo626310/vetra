import type { VisitTranslations } from "./new-visit-types";
import { WheelPicker } from "./NewVisitClinicalWidgets";

type Props = {
  darkMode: boolean;
  t: VisitTranslations;
  reason: string;
  setReason: (value: string) => void;
  examStatus: "normal" | "abnormal" | "";
  setExamStatus: (value: "normal" | "abnormal" | "") => void;
  examination: string;
  setExamination: (value: string) => void;
  weight: string;
  handleWeightChange: (value: string) => void;
  temperature: string;
  setTemperature: (value: string) => void;
  heartRate: string;
  setHeartRate: (value: string) => void;
  respiratoryRate: string;
  setRespiratoryRate: (value: string) => void;
  diagnosis: string;
  setDiagnosis: (value: string) => void;
};

export default function NewVisitClinicalFields(props: Props) {
  const {
    darkMode, t, reason, setReason, examStatus, setExamStatus,
    examination, setExamination, weight, handleWeightChange,
    temperature, setTemperature, heartRate, setHeartRate,
    respiratoryRate, setRespiratoryRate, diagnosis, setDiagnosis,
  } = props;
  return (<>

                <div className="lg:col-span-2">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <label
                      className={`block text-sm font-semibold ${
                        darkMode ? "text-slate-300" : "text-slate-700"
                      }`}
                    >
                      {t.reason}
                    </label>
                    <span className={`text-[11px] font-medium ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
                      {t.quickReasons}
                    </span>
                  </div>

                  <div className="mb-3 flex flex-wrap gap-2">
                    {t.reasons.map((label, index) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => setReason(label)}
                        className={`rounded-full border px-3 py-2 text-xs font-semibold transition-all ${
                          reason === label
                            ? "border-blue-500 bg-blue-600 text-white shadow-sm"
                            : darkMode
                            ? "border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-600"
                            : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:bg-white"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={t.reasonPlaceholder}
                    className={`w-full rounded-xl border px-4 py-3 outline-none transition-all duration-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 ${
                      darkMode
                        ? "border-slate-700 bg-slate-950 text-white placeholder:text-slate-500"
                        : "border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400"
                    }`}
                  />
                </div>

                <div className="lg:col-span-2">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <label
                      className={`block text-sm font-semibold ${
                        darkMode ? "text-slate-300" : "text-slate-700"
                      }`}
                    >
                      {t.examinationNotes}
                    </label>
                    <span className={`text-[11px] ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
                      {examStatus === "normal" ? t.examinationNormalHint : t.examinationDetails}
                    </span>
                  </div>

                  <div className="mb-4 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setExamStatus("normal");
                        setExamination("");
                      }}
                      className={`rounded-2xl border px-4 py-3 text-sm font-bold transition-all ${
                        examStatus === "normal"
                          ? "border-emerald-500 bg-emerald-600 text-white shadow-md"
                          : darkMode
                          ? "border-slate-700 bg-slate-950 text-slate-300 hover:border-emerald-500/50"
                          : "border-slate-200 bg-slate-50 text-slate-600 hover:border-emerald-300"
                      }`}
                    >
                      ✓ {t.examNormal}
                    </button>
                    <button
                      type="button"
                      onClick={() => setExamStatus("abnormal")}
                      className={`rounded-2xl border px-4 py-3 text-sm font-bold transition-all ${
                        examStatus === "abnormal"
                          ? "border-rose-500 bg-rose-600 text-white shadow-md"
                          : darkMode
                          ? "border-slate-700 bg-slate-950 text-slate-300 hover:border-rose-500/50"
                          : "border-slate-200 bg-slate-50 text-slate-600 hover:border-rose-300"
                      }`}
                    >
                      ! {t.examAbnormal}
                    </button>
                  </div>

                  {examStatus !== "normal" && (
                    <textarea
                      rows={5}
                      value={examination}
                      onChange={(e) => {
                        setExamination(e.target.value);
                        if (e.target.value.trim()) setExamStatus("abnormal");
                      }}
                      placeholder={t.examinationPlaceholder}
                      className={`w-full resize-none rounded-xl border px-4 py-3 outline-none transition-all duration-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 ${
                        darkMode
                          ? "border-slate-700 bg-slate-950 text-white placeholder:text-slate-500"
                          : "border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400"
                      }`}
                    />
                  )}

                  {examStatus === "normal" && (
                    <div
                      className={`rounded-2xl border px-4 py-4 text-sm ${
                        darkMode
                          ? "border-emerald-900/70 bg-emerald-950/30 text-emerald-300"
                          : "border-emerald-200 bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      ✓ {t.examinationNormalHint}
                    </div>
                  )}
                </div>

                <div className="grid min-w-0 grid-cols-2 gap-2 sm:gap-4">
                <div className="min-w-0">
                  <label
                    className={`mb-2 block text-sm font-semibold ${
                      darkMode ? "text-slate-300" : "text-slate-700"
                    }`}
                  >
                    {t.weight}
                  </label>
                  <WheelPicker
                    value={weight}
                    onChange={handleWeightChange}
                    min={0.1}
                    max={100}
                    step={0.1}
                    unit={t.kg}
                    defaultValue={5}
                    hint={t.wheelSwipeHint}
                    darkMode={darkMode}
                  />
                </div>

                <div className="min-w-0">
                  <label
                    className={`mb-2 block text-sm font-semibold ${
                      darkMode ? "text-slate-300" : "text-slate-700"
                    }`}
                  >
                    {t.temperature}
                  </label>
                  <WheelPicker
                    value={temperature}
                    onChange={setTemperature}
                    min={34}
                    max={42}
                    step={0.1}
                    unit={t.celsius}
                    defaultValue={38.5}
                    hint={t.wheelSwipeHint}
                    darkMode={darkMode}
                  />
                </div>
                </div>

                <div>
                  <label
                    className={`mb-2 block text-sm font-semibold ${
                      darkMode ? "text-slate-300" : "text-slate-700"
                    }`}
                  >
                    {t.heartRate}
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={heartRate}
                    onChange={(e) => setHeartRate(e.target.value)}
                    placeholder="120"
                    className={`w-full rounded-xl border px-4 py-3 outline-none transition-all duration-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 ${
                      darkMode
                        ? "border-slate-700 bg-slate-950 text-white placeholder:text-slate-500"
                        : "border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400"
                    }`}
                  />
                </div>

                <div>
                  <label
                    className={`mb-2 block text-sm font-semibold ${
                      darkMode ? "text-slate-300" : "text-slate-700"
                    }`}
                  >
                    {t.respiratoryRate}
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={respiratoryRate}
                    onChange={(e) => setRespiratoryRate(e.target.value)}
                    placeholder="30"
                    className={`w-full rounded-xl border px-4 py-3 outline-none transition-all duration-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 ${
                      darkMode
                        ? "border-slate-700 bg-slate-950 text-white placeholder:text-slate-500"
                        : "border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400"
                    }`}
                  />
                </div>

                <div>
                  <label
                    className={`mb-2 block text-sm font-semibold ${
                      darkMode
                        ? "text-slate-300"
                        : "text-slate-700"
                    }`}
                  >
                    {t.diagnosis}
                  </label>

                  <textarea
                    rows={4}
                    value={diagnosis}
                    onChange={(e) =>
                      setDiagnosis(e.target.value)
                    }
                    placeholder={t.diagnosisPlaceholder}
                    className={`w-full resize-none rounded-xl border px-4 py-3 outline-none transition-all duration-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 ${
                      darkMode
                        ? "border-slate-700 bg-slate-950 text-white placeholder:text-slate-500"
                        : "border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400"
                    }`}
                  />
                </div>

  </>);
}
