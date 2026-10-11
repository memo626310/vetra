"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getClientPortalDb } from "@/lib/client-portal-db";

type Language = "ar" | "en";
type VisitJoin = { id: string; client_id: string; pet_id: string; visit_date: string };
type MedicationJoin = { id: string; name: string };
type MedicationRow = {
  id: string;
  clinic_id: string;
  visit_id: string;
  medication_id: string;
  calculated_dose: number | null;
  calculated_dose_unit: string | null;
  calculated_volume: number | null;
  volume_unit: string | null;
  route: string | null;
  frequency: string | null;
  duration_days: number | null;
  instructions: string | null;
};
type DailyTask = {
  key: string;
  visitMedicationId: string;
  clinicId: string;
  medicationId: string;
  medicationName: string;
  doseText: string;
  route: string;
  frequency: string;
  instructions: string;
  durationDays: number | null;
  elapsedDays: number;
  doseSlot: number;
  doseCount: number;
  frequencyKnown: boolean;
  completed: boolean;
};
type MissingDuration = { id: string; name: string; frequency: string };

const DAY_MS = 24 * 60 * 60 * 1000;

function todayLocalDate() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateOrdinal(value: string) {
  // Date-only values stay as calendar dates; timestamps are converted to local time.
  let datePart = value.slice(0, 10);
  if (value.includes("T")) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      datePart = `${year}-${month}-${day}`;
    }
  }
  const [year, month, day] = datePart.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);
}

function dayDifference(from: string, to: string) {
  return dateOrdinal(to) - dateOrdinal(from);
}

function normalizedFrequency(frequency: string | null) {
  return (frequency || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function isFrequencyRecognized(frequency: string | null): boolean {
  const value = normalizedFrequency(frequency);
  return /\b(qid|four times|4 times|4x|every 6 hours|q6h|tid|three times|3 times|3x|every 8 hours|q8h|bid|twice|two times|2 times|2x|every 12 hours|q12h|sid|od|once daily|once a day|daily|every 24 hours|q24h|once)\b/.test(value);
}

function dosesPerDay(frequency: string | null): number {
  const value = normalizedFrequency(frequency);
  if (/\b(qid|four times|4 times|4x|every 6 hours|q6h)\b/.test(value)) return 4;
  if (/\b(tid|three times|3 times|3x|every 8 hours|q8h)\b/.test(value)) return 3;
  if (/\b(bid|twice|two times|2 times|2x|every 12 hours|q12h)\b/.test(value)) return 2;
  if (/\b(sid|od|once daily|once a day|daily|every 24 hours|q24h|once)\b/.test(value)) return 1;
  // Unknown frequency is shown verbatim and represented as one daily acknowledgement;
  // the client must follow the frequency instructions written by the veterinarian.
  return 1;
}

function text(lang: Language, ar: string, en: string) {
  return lang === "ar" ? ar : en;
}

function getErrorInfo(cause: unknown) {
  const value = cause && typeof cause === "object"
    ? cause as Record<string, unknown>
    : {};
  const message = cause instanceof Error
    ? cause.message
    : typeof value.message === "string"
      ? value.message
      : typeof cause === "string"
        ? cause
        : "Unknown database error";

  return {
    name: cause instanceof Error
      ? cause.name
      : typeof value.name === "string" ? value.name : undefined,
    message,
    code: typeof value.code === "string" ? value.code : undefined,
    details: typeof value.details === "string" ? value.details : undefined,
    hint: typeof value.hint === "string" ? value.hint : undefined,
    status: typeof value.status === "number" ? value.status : undefined,
  };
}

function errorMessage(cause: unknown, fallback: string) {
  const info = getErrorInfo(cause);
  return [
    info.message,
    info.details ? `Details: ${info.details}` : "",
    info.hint ? `Hint: ${info.hint}` : "",
    info.code ? `Code: ${info.code}` : "",
  ].filter(Boolean).join(" · ") || fallback;
}

export default function DailyMedicationTodo({
  clientId,
  petId,
  petName,
  lang = "ar",
  dark = true,
}: {
  clientId: string;
  petId: string;
  petName: string;
  lang?: Language;
  dark?: boolean;
}) {
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [missingDuration, setMissingDuration] = useState<MissingDuration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pendingKeys, setPendingKeys] = useState<string[]>([]);
  const [today, setToday] = useState(todayLocalDate);

  const surface = dark
    ? "border border-white/[.07] bg-white/[.035] text-white"
    : "border border-slate-200 bg-white text-slate-900";
  const inner = dark
    ? "border border-white/[.06] bg-white/[.025]"
    : "border border-slate-100 bg-slate-50";

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setError("");
    const currentDate = todayLocalDate();
    setToday(currentDate);

    try {
      const read = (storage: Storage) => ({
        id: storage.getItem("vetra-client-id"),
        code: storage.getItem("vetra-client-code"),
        phone: storage.getItem("vetra-client-phone"),
      });
      let owner = read(window.localStorage);
      if (!owner.id || !owner.code || !owner.phone) {
        const legacy = read(window.sessionStorage);
        if (legacy.id && legacy.code && legacy.phone) owner = legacy;
      }
      if (!owner.code || !owner.phone || owner.id !== clientId) {
        throw new Error(text(lang, "انتهت جلسة الدخول. سجّل الدخول مرة أخرى.", "Your session expired. Please sign in again."));
      }

      const db = await getClientPortalDb(owner.code, owner.phone);

      // Query visits and visit medications separately. This avoids relying on a
      // PostgREST relationship that may not exist in the clinic database schema.
      const { data: visitsData, error: visitsError } = await db
        .from("visits")
        .select("id, client_id, pet_id, visit_date")
        .eq("client_id", clientId)
        .eq("pet_id", petId);
      if (visitsError) throw visitsError;

      const visitRows = (visitsData || []) as VisitJoin[];
      const visitById = new Map(visitRows.map((visit) => [visit.id, visit]));
      const visitIds = visitRows.map((visit) => visit.id);

      let medicationRows: MedicationRow[] = [];
      if (visitIds.length > 0) {
        const { data: rowsData, error: rowsError } = await db
          .from("visit_medications")
          .select(`
            id, clinic_id, visit_id, medication_id, calculated_dose,
            calculated_dose_unit, calculated_volume, volume_unit, route,
            frequency, duration_days, instructions
          `)
          .in("visit_id", visitIds);
        if (rowsError) throw rowsError;
        medicationRows = (rowsData || []) as MedicationRow[];
      }

      const medicationIds = Array.from(new Set(medicationRows.map((row) => row.medication_id).filter(Boolean)));
      let medicationById = new Map<string, MedicationJoin>();
      if (medicationIds.length > 0) {
        const { data: medicationsData, error: medicationsError } = await db
          .from("medications")
          .select("id, name")
          .in("id", medicationIds);
        if (medicationsError) throw medicationsError;
        medicationById = new Map(
          ((medicationsData || []) as MedicationJoin[]).map((medication) => [medication.id, medication])
        );
      }

      const activeRows: Array<{
        row: MedicationRow;
        visit: VisitJoin;
        medication: MedicationJoin;
        elapsedDays: number;
      }> = [];
      const missing: MissingDuration[] = [];

      for (const raw of medicationRows) {
        const visit = visitById.get(raw.visit_id);
        const medication = medicationById.get(raw.medication_id);
        if (!visit || !medication) continue;
        const elapsedDays = dayDifference(visit.visit_date, currentDate);
        if (elapsedDays < 0) continue;

        if (raw.duration_days == null || Number(raw.duration_days) < 1) {
          missing.push({ id: raw.id, name: medication.name, frequency: raw.frequency || "" });
          continue;
        }

        if (elapsedDays >= Number(raw.duration_days)) continue;
        activeRows.push({ row: raw, visit, medication, elapsedDays });
      }

      const { data: logData, error: logError } = await db
        .from("owner_medication_checkins")
        .select("visit_medication_id, dose_slot, completed")
        .eq("client_id", clientId)
        .eq("pet_id", petId)
        .eq("scheduled_date", currentDate);
      if (logError) throw logError;

      const logMap = new Map<string, boolean>();
      for (const log of (logData || []) as Array<{ visit_medication_id: string; dose_slot: number; completed: boolean }>) {
        logMap.set(`${log.visit_medication_id}:${log.dose_slot}`, Boolean(log.completed));
      }

      const nextTasks: DailyTask[] = [];
      for (const item of activeRows) {
        const doseCount = dosesPerDay(item.row.frequency);
        const doseParts: string[] = [];
        if (item.row.calculated_dose != null) {
          doseParts.push(`${item.row.calculated_dose} ${item.row.calculated_dose_unit || ""}`.trim());
        }
        if (item.row.calculated_volume != null) {
          doseParts.push(`${item.row.calculated_volume} ${item.row.volume_unit || "mL"}`.trim());
        }
        const doseText = doseParts.join(" · ") || text(lang, "الجرعة حسب الوصفة", "Dose as prescribed");

        for (let slot = 1; slot <= doseCount; slot += 1) {
          const key = `${item.row.id}:${slot}`;
          nextTasks.push({
            key,
            visitMedicationId: item.row.id,
            clinicId: item.row.clinic_id,
            medicationId: item.row.medication_id,
            medicationName: item.medication.name,
            doseText,
            route: item.row.route || "",
            frequency: item.row.frequency || "",
            instructions: item.row.instructions || "",
            durationDays: Number(item.row.duration_days),
            elapsedDays: item.elapsedDays,
            doseSlot: slot,
            doseCount,
            frequencyKnown: isFrequencyRecognized(item.row.frequency),
            completed: logMap.get(key) || false,
          });
        }
      }

      setTasks(nextTasks);
      setMissingDuration(missing);
    } catch (cause) {
      const info = getErrorInfo(cause);
      console.error("DAILY MEDICATION TODO ERROR:", info, cause);
      setError(errorMessage(cause, text(lang, "تعذر تحميل متابعة الأدوية.", "Could not load medication tasks.")));
      setTasks([]);
      setMissingDuration([]);
    } finally {
      setLoading(false);
    }
  }, [clientId, petId, lang]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  const total = tasks.length;
  const completed = tasks.filter((task) => task.completed).length;
  const allDone = total > 0 && completed === total;
  const grouped = useMemo(() => {
    const map = new Map<string, DailyTask[]>();
    for (const task of tasks) {
      const current = map.get(task.visitMedicationId) || [];
      current.push(task);
      map.set(task.visitMedicationId, current);
    }
    return Array.from(map.values());
  }, [tasks]);

  async function toggleTask(task: DailyTask, checked: boolean) {
    const previous = tasks;
    setPendingKeys((current) => [...current, task.key]);
    setTasks((current) => current.map((item) => item.key === task.key ? { ...item, completed: checked } : item));

    try {
      const read = (storage: Storage) => ({
        id: storage.getItem("vetra-client-id"),
        code: storage.getItem("vetra-client-code"),
        phone: storage.getItem("vetra-client-phone"),
      });
      let owner = read(window.localStorage);
      if (!owner.id || !owner.code || !owner.phone) {
        const legacy = read(window.sessionStorage);
        if (legacy.id && legacy.code && legacy.phone) owner = legacy;
      }
      if (!owner.code || !owner.phone || owner.id !== clientId) {
        throw new Error(text(lang, "انتهت جلسة الدخول. سجّل الدخول مرة أخرى.", "Your session expired. Please sign in again."));
      }

      const db = await getClientPortalDb(owner.code, owner.phone);
      const { error: saveError } = await db.from("owner_medication_checkins").upsert({
        clinic_id: task.clinicId,
        client_id: clientId,
        pet_id: petId,
        visit_medication_id: task.visitMedicationId,
        scheduled_date: today,
        dose_slot: task.doseSlot,
        completed: checked,
        completed_at: checked ? new Date().toISOString() : null,
      }, { onConflict: "visit_medication_id,scheduled_date,dose_slot" });
      if (saveError) throw saveError;
    } catch (cause) {
      const info = getErrorInfo(cause);
      console.error("SAVE MEDICATION CHECKIN ERROR:", info, cause);
      setTasks(previous);
      setError(errorMessage(cause, text(lang, "لم يتم حفظ العلامة. حاول مرة أخرى.", "Could not save this check-in. Please try again.")));
    } finally {
      setPendingKeys((current) => current.filter((key) => key !== task.key));
    }
  }

  return (
    <section className={`mt-5 rounded-[2rem] p-5 sm:p-6 ${surface}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-cyan-400">{text(lang, "متابعة العلاج", "TREATMENT TRACKER")}</p>
          <h2 className="mt-1 text-2xl font-black">💊 {text(lang, "أدوية اليوم", "Today's medications")}</h2>
          <p className="mt-2 text-sm text-slate-500">
            {text(lang, `متابعة جرعات ${petName} اليومية. العلامات بتتحفظ وبتبدأ قائمة جديدة كل يوم.`, `Daily dose checklist for ${petName}. Check-ins are saved and the list resets each day.`)}
          </p>
        </div>
        <button type="button" onClick={() => void loadTasks()} disabled={loading} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold disabled:opacity-50">
          {loading ? text(lang, "جاري التحديث…", "Refreshing…") : text(lang, "تحديث", "Refresh")}
        </button>
      </div>

      {total > 0 && (
        <div className={`mt-5 rounded-2xl p-4 ${allDone ? "border border-emerald-400/20 bg-emerald-400/[.07]" : "border border-amber-400/20 bg-amber-400/[.06]"}`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className={`text-sm font-black ${allDone ? "text-emerald-400" : "text-amber-300"}`}>
                {allDone ? text(lang, "عاش! خلصت جرعات النهارده", "Great! Today's doses are complete") : text(lang, "متنساش تكمل جرعات النهارده", "Remember to complete today's doses")}
              </p>
              <p className="mt-1 text-xs text-slate-500">{completed} / {total} {text(lang, "جرعات مكتملة", "doses completed")}</p>
            </div>
            <div className="text-2xl font-black tabular-nums">{Math.round((completed / total) * 100)}%</div>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-500/20">
            <div className={`h-full rounded-full transition-all ${allDone ? "bg-emerald-400" : "bg-cyan-400"}`} style={{ width: `${(completed / total) * 100}%` }} />
          </div>
        </div>
      )}

      {error && <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-400/[.06] p-3 text-sm text-rose-300">{error}</div>}

      {loading ? (
        <div className="mt-5 rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-slate-500">{text(lang, "جاري تحميل أدوية اليوم…", "Loading today's medication tasks…")}</div>
      ) : grouped.length ? (
        <div className="mt-4 space-y-3">
          {grouped.map((doseTasks) => {
            const first = doseTasks[0];
            const medicationDone = doseTasks.every((task) => task.completed);
            return (
              <article key={first.visitMedicationId} className={`rounded-2xl p-4 ${inner}`}>
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cyan-400/10 text-xl">💊</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className={`font-black ${medicationDone ? "text-emerald-400" : ""}`}>{first.medicationName}</h3>
                      {medicationDone && <span className="rounded-full bg-emerald-400/10 px-2 py-1 text-[10px] font-bold text-emerald-400">{text(lang, "مكتمل", "Complete")}</span>}
                    </div>
                    <p className="mt-1 text-sm font-bold text-cyan-300">{first.doseText}</p>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                      {first.route && <span>{text(lang, "الطريقة", "Route")}: {first.route}</span>}
                      {first.frequency && <span>{text(lang, "التكرار", "Frequency")}: {first.frequency}</span>}
                      {first.durationDays != null && <span>{text(lang, "اليوم", "Day")} {first.elapsedDays + 1} / {first.durationDays}</span>}
                    </div>
                    {first.instructions && <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-500">{first.instructions}</p>}
                  </div>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {doseTasks.map((task) => (
                    <label key={task.key} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${task.completed ? "border-emerald-400/20 bg-emerald-400/[.06]" : "border-white/[.07] bg-white/[.02] hover:border-cyan-400/30"} ${pendingKeys.includes(task.key) ? "opacity-60" : ""}`}>
                      <input
                        type="checkbox"
                        checked={task.completed}
                        disabled={pendingKeys.includes(task.key)}
                        onChange={(event) => void toggleTask(task, event.target.checked)}
                        className="h-5 w-5 shrink-0 accent-emerald-400"
                      />
                      <span className={`text-sm font-bold ${task.completed ? "text-emerald-400 line-through" : ""}`}>
                        {task.doseCount > 1
                          ? text(lang, `الجرعة ${task.doseSlot}`, `Dose ${task.doseSlot}`)
                          : text(lang, "جرعة اليوم", "Today's dose")}
                      </span>
                      {pendingKeys.includes(task.key) && <span className="ms-auto text-xs text-slate-500">…</span>}
                    </label>
                  ))}
                </div>
                {!first.frequencyKnown && <p className="mt-2 text-xs text-amber-300">{text(lang, "صيغة تكرار الجرعات غير معروفة للنظام؛ اتبع الوصفة، وتم إظهار خانة متابعة واحدة فقط لهذا الدواء اليوم.", "This frequency format is not recognized by the tracker. Follow the prescription; only one daily acknowledgement is shown for this medicine.")}</p>}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="mt-5 rounded-2xl border border-dashed border-white/10 p-6 text-center">
          <div className="text-3xl">✅</div>
          <p className="mt-2 font-black">{text(lang, "مفيش جرعات مستحقة مسجلة لليوم", "No active medication doses are scheduled today")}</p>
          <p className="mt-1 text-sm text-slate-500">{text(lang, "الأدوية لازم يكون لها مدة علاج محددة من العيادة عشان تظهر في المتابعة اليومية.", "Medication prescriptions need a defined duration to appear in the daily checklist.")}</p>
        </div>
      )}

      {missingDuration.length > 0 && (
        <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-400/[.05] p-4">
          <p className="text-sm font-black text-amber-300">{text(lang, "في أدوية مدة علاجها مش محددة", "Some medications have no defined duration")}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">{text(lang, "الأدوية دي مش هتتحول لمهام يومية عشان ما نفضلش نفكّر العميل بدواء بعد انتهاء العلاج. راجع مدة العلاج في وصفة العيادة.", "These medicines are excluded from daily reminders so the checklist does not keep prompting after treatment should have ended. Confirm the duration in the clinic prescription.")}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {missingDuration.map((item) => <span key={item.id} className="rounded-full bg-amber-400/10 px-3 py-1 text-xs text-amber-200">{item.name}</span>)}
          </div>
        </div>
      )}

      <p className="mt-4 text-[11px] leading-5 text-slate-500">{text(lang, "التذكير ظاهر داخل صفحة VETRA. الإشعارات حتى لو الموقع مقفول تحتاج إعداد Push Notifications منفصل.", "Reminders appear inside VETRA. Notifications while the site is closed require a separate push-notification setup.")}</p>
    </section>
  );
}
