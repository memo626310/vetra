"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getClinicDb } from "@/lib/clinic-db";

type Pet = {
  id: string;
  client_id: string;
  name: string;
  species: string;
  breed: string | null;
  gender: string | null;
  birth_date: string | null;
  color: string | null;
  microchip: string | null;
  notes: string | null;
  photo_url: string | null;
  is_deceased: boolean;
};

type Client = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
};

type Visit = {
  id: string;
  visit_date: string;
  reason: string | null;
  examination: string | null;
  diagnosis: string | null;
  treatment: string | null;
  weight: number | null;
  temperature: number | null;
  fee: number | null;
  notes: string | null;
};

type Vaccination = {
  id: string;
  pet_id: string;
  vaccine_name: string | null;
  vaccine_type: string | null;
  administered_at: string | null;
  next_dose_at: string | null;
  dose: string | null;
  route: string | null;
  batch_number: string | null;
  manufacturer: string | null;
  notes: string | null;
};

type VaccineCircle = {
  id: string;
  name: string;
  record: Vaccination | null;
  due: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export default function PetPage() {
  const [pet, setPet] = useState<Pet | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [vaccinations, setVaccinations] = useState<Vaccination[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [deletingPet, setDeletingPet] = useState(false);

  const [darkMode, setDarkMode] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  // =========================
  // DARK MODE
  // =========================

  useEffect(() => {
    const savedMode = localStorage.getItem("vetra-dark-mode");

    if (savedMode === "true") {
      setDarkMode(true);
    }
  }, []);

  function toggleDarkMode() {
    const nextMode = !darkMode;

    setDarkMode(nextMode);
    localStorage.setItem("vetra-dark-mode", String(nextMode));
  }

  // =========================
  // LIVE COUNTDOWN REFRESH
  // =========================

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentTime(Date.now());
    }, 60_000);

    return () => window.clearInterval(timer);
  }, []);

  // =========================
  // LOAD PET
  // =========================

  useEffect(() => {
    async function loadPet() {
      setLoading(true);
      setError("");

      try {
        const parts = window.location.pathname.split("/");
        const petId = parts[parts.length - 1];

        if (!petId) {
          setError("رقم الحيوان غير موجود.");
          setLoading(false);
          return;
        }

        const db = await getClinicDb();

        // =========================
        // GET PET
        // =========================

        const {
          data: petData,
          error: petError,
        } = await db
          .from("pets")
          .select("*")
          .eq("id", petId)
          .single();

        if (petError || !petData) {
          console.error("PET LOAD ERROR:", petError);

          setError(
            petError?.message || "الحيوان غير موجود في قاعدة بيانات العيادة."
          );

          setLoading(false);
          return;
        }

        setPet(petData as Pet);

        // =========================
        // GET OWNER
        // =========================

        const {
          data: clientData,
          error: clientError,
        } = await db
          .from("clients")
          .select("id, name, phone, email")
          .eq("id", petData.client_id)
          .single();

        if (clientError) {
          console.error("CLIENT LOAD ERROR:", clientError);
        }

        if (clientData) {
          setClient(clientData as Client);
        }

        // =========================
        // GET MEDICAL HISTORY
        // =========================

        const {
          data: visitsData,
          error: visitsError,
        } = await db
          .from("visits")
          .select("*")
          .eq("pet_id", petId)
          .order("visit_date", {
            ascending: false,
          });

        if (visitsError) {
          console.error("VISITS LOAD ERROR:", visitsError);

          setError(
            "تم تحميل الحيوان لكن تعذر تحميل التاريخ الطبي: " +
              visitsError.message
          );

          setVisits([]);
        } else {
          setVisits((visitsData || []) as Visit[]);
        }

        // =========================
        // GET VACCINATIONS
        // =========================

        const {
          data: vaccinationsData,
          error: vaccinationsError,
        } = await db
          .from("vaccinations")
          .select(
            "id, pet_id, vaccine_name, vaccine_type, administered_at, next_dose_at, dose, route, batch_number, manufacturer, notes"
          )
          .eq("pet_id", petId)
          .order("administered_at", {
            ascending: false,
          });

        if (vaccinationsError) {
          console.error(
            "VACCINATIONS LOAD ERROR:",
            vaccinationsError
          );

          setVaccinations([]);
        } else {
          setVaccinations(
            (vaccinationsData || []) as Vaccination[]
          );
        }

        setLoading(false);
      } catch (err) {
        console.error("PET PAGE ERROR:", err);

        setError(
          err instanceof Error
            ? err.message
            : "حصل خطأ أثناء تحميل الملف الطبي."
        );

        setLoading(false);
      }
    }

    void loadPet();
  }, []);

  // =========================
  // HELPERS
  // =========================

  function getSpeciesIcon(species: string) {
    const value = species.toLowerCase();

    if (value.includes("cat") || value.includes("قط")) {
      return "🐱";
    }

    if (value.includes("dog") || value.includes("كلب")) {
      return "🐶";
    }

    return "🐾";
  }

  function getSpeciesName(species: string) {
    const value = species.toLowerCase();

    if (value.includes("cat") || value.includes("قط")) {
      return "قط";
    }

    if (value.includes("dog") || value.includes("كلب")) {
      return "كلب";
    }

    if (value.includes("other")) {
      return "أخرى";
    }

    return species;
  }

  function calculateAge(date: string | null) {
    if (!date) return "غير محدد";

    const birth = new Date(date);
    const today = new Date();

    let years = today.getFullYear() - birth.getFullYear();
    let months = today.getMonth() - birth.getMonth();

    if (today.getDate() < birth.getDate()) {
      months--;
    }

    if (months < 0) {
      years--;
      months += 12;
    }

    if (years > 0) {
      return `${years} سنة`;
    }

    if (months > 0) {
      return `${months} شهر`;
    }

    return "أقل من شهر";
  }

  function formatDate(date: string) {
    return new Date(date).toLocaleDateString("ar-EG", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  function formatVaccinationDate(date: string) {
    const parts = date.slice(0, 10).split("-").map(Number);

    if (parts.length === 3 && parts.every(Number.isFinite)) {
      const [year, month, day] = parts;

      return new Date(year, month - 1, day).toLocaleDateString(
        "ar-EG",
        {
          year: "numeric",
          month: "short",
          day: "numeric",
        }
      );
    }

    return new Date(date).toLocaleDateString("ar-EG", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function formatTime(date: string) {
    return new Date(date).toLocaleTimeString("ar-EG", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function dateOnly(date: string) {
    const parts = date.slice(0, 10).split("-").map(Number);

    if (parts.length === 3 && parts.every(Number.isFinite)) {
      const [year, month, day] = parts;
      return new Date(year, month - 1, day).getTime();
    }

    const d = new Date(date);

    return new Date(
      d.getFullYear(),
      d.getMonth(),
      d.getDate()
    ).getTime();
  }

  function daysUntil(date: string, now = currentTime) {
    const today = new Date(now);

    const todayStart = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    ).getTime();

    const dueStart = dateOnly(date);

    return Math.ceil((dueStart - todayStart) / DAY_MS);
  }

  function addDays(date: string, days: number) {
    const d = new Date(date);

    d.setDate(d.getDate() + days);

    return d.toISOString();
  }

  function addYears(date: string, years: number) {
    const d = new Date(date);

    d.setFullYear(d.getFullYear() + years);

    return d.toISOString();
  }

  function recordText(vaccine: Vaccination) {
    return `${vaccine.vaccine_name || ""} ${
      vaccine.vaccine_type || ""
    } ${vaccine.notes || ""}`.toLowerCase();
  }

  function isViral(vaccine: Vaccination) {
    const value = recordText(vaccine);

    return [
      "ثلاثي",
      "رباعي",
      "فيروسي",
      "فيروسى",
      "viral",
      "triple",
      "quad",
      "fvr",
      "fvrcp",
      "f3",
      "f4",
    ].some((key) => value.includes(key));
  }

  function isRabies(vaccine: Vaccination) {
    const value = recordText(vaccine);

    return ["سعار", "rabies", "rabis"].some((key) =>
      value.includes(key)
    );
  }

  function isDeworm(vaccine: Vaccination) {
    const value = recordText(vaccine);

    return [
      "ديدان",
      "deworm",
      "worm",
      "internal parasite",
      "anthelmint",
    ].some((key) => value.includes(key));
  }

  function isParasite(vaccine: Vaccination) {
    const value = recordText(vaccine);

    return [
      "حشرات",
      "flea",
      "fleas",
      "tick",
      "ticks",
      "ecto",
      "external parasite",
      "براغيث",
      "قراد",
    ].some((key) => value.includes(key));
  }

  function latestRecord(
    records: Vaccination[],
    matcher: (vaccine: Vaccination) => boolean
  ) {
    return (
      records
        .filter(
          (vaccine) =>
            matcher(vaccine) && vaccine.administered_at
        )
        .sort(
          (a, b) =>
            +new Date(b.administered_at as string) -
            +new Date(a.administered_at as string)
        )[0] || null
    );
  }

  function getVaccinationDue(vaccine: Vaccination) {
    if (vaccine.next_dose_at) {
      return vaccine.next_dose_at;
    }

    if (!vaccine.administered_at) {
      return null;
    }

    if (isViral(vaccine)) {
      return addYears(vaccine.administered_at, 1);
    }

    if (isRabies(vaccine)) {
      return addYears(vaccine.administered_at, 1);
    }

    if (isDeworm(vaccine)) {
      return addDays(vaccine.administered_at, 60);
    }

    return null;
  }

  function getVaccineCircles(): VaccineCircle[] {
    const circles: VaccineCircle[] = [];

    const viral = latestRecord(vaccinations, isViral);
    const rabies = latestRecord(vaccinations, isRabies);
    const deworm = latestRecord(vaccinations, isDeworm);
    const parasite = latestRecord(vaccinations, isParasite);

    circles.push({
      id: "viral",
      name: "الفيروسي",
      record: viral,
      due: viral ? getVaccinationDue(viral) : null,
    });

    circles.push({
      id: "rabies",
      name: "السعار",
      record: rabies,
      due: rabies ? getVaccinationDue(rabies) : null,
    });

    circles.push({
      id: "deworm",
      name: "الديدان",
      record: deworm,
      due: deworm ? getVaccinationDue(deworm) : null,
    });

    circles.push({
      id: "parasite",
      name: "الحشرات",
      record: parasite,
      due: parasite ? getVaccinationDue(parasite) : null,
    });

    const knownIds = new Set(
      [viral, rabies, deworm, parasite]
        .filter(Boolean)
        .map((item) => item!.id)
    );

    vaccinations
      .filter((vaccine) => !knownIds.has(vaccine.id))
      .forEach((vaccine) => {
        circles.push({
          id: `extra-${vaccine.id}`,
          name:
            vaccine.vaccine_name ||
            vaccine.vaccine_type ||
            "تطعيم",
          record: vaccine,
          due: getVaccinationDue(vaccine),
        });
      });

    return circles;
  }

  function getCircleState(due: string | null) {
    if (!due) {
      return "none";
    }

    const days = daysUntil(due);

    if (days < 0) {
      return "overdue";
    }

    if (days === 0) {
      return "today";
    }

    if (days === 1) {
      return "tomorrow";
    }

    return "upcoming";
  }

  function VaccinationCircle({
    item,
  }: {
    item: VaccineCircle;
  }) {
    const state = getCircleState(item.due);
    const days = item.due ? daysUntil(item.due) : null;

    const radius = 42;
    const circumference = 2 * Math.PI * radius;

    let progress = 0.08;

    if (days !== null) {
      if (days <= 0) {
        progress = 1;
      } else {
        progress = Math.max(
          0.08,
          Math.min(1, days / 365)
        );
      }
    }

    const dashOffset =
      circumference * (1 - progress);

    let ringColor = "stroke-emerald-400";
    let numberColor = "text-emerald-400";

    if (state === "today") {
      ringColor = "stroke-amber-400";
      numberColor = "text-amber-400";
    }

    if (state === "tomorrow") {
      ringColor = "stroke-cyan-400";
      numberColor = "text-cyan-400";
    }

    if (state === "overdue") {
      ringColor = "stroke-rose-400";
      numberColor = "text-rose-400";
    }

    let value = "—";
    let label = "لا يوجد موعد";

    if (state === "upcoming" && days !== null) {
      value = String(days);
      label = "يوم متبقي";
    }

    if (state === "tomorrow") {
      value = "1";
      label = "بكرة";
    }

    if (state === "today") {
      value = "💉";
      label = "اليوم";
    }

    if (state === "overdue" && days !== null) {
      value = String(Math.abs(days));
      label = "يوم متأخر";
    }

    return (
      <div
        className={`min-w-[170px] shrink-0 rounded-[1.7rem] border p-4 ${
          darkMode
            ? "border-white/[.06] bg-white/[.035]"
            : "border-slate-100 bg-slate-50"
        }`}
      >
        <div className="flex flex-col items-center">
          <div className="relative h-32 w-32">
            <svg
              viewBox="0 0 100 100"
              className="absolute inset-0 h-full w-full -rotate-90"
            >
              <circle
                cx="50"
                cy="50"
                r={radius}
                fill="none"
                strokeWidth="7"
                className={
                  darkMode
                    ? "stroke-slate-700"
                    : "stroke-slate-200"
                }
              />

              <circle
                cx="50"
                cy="50"
                r={radius}
                fill="none"
                strokeWidth="7"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
                className={ringColor}
              />
            </svg>

            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <div
                className={`text-2xl font-black ${numberColor}`}
              >
                {value}
              </div>

              <div
                className={`mt-1 text-[10px] font-bold ${
                  darkMode
                    ? "text-slate-300"
                    : "text-slate-600"
                }`}
              >
                {label}
              </div>
            </div>
          </div>

          <div className="mt-3 text-center">
            <div className="truncate text-sm font-black">
              {item.name}
            </div>

            {item.record && (
              <div
                className={`mt-1 text-[10px] ${
                  darkMode
                    ? "text-slate-400"
                    : "text-slate-500"
                }`}
              >
                آخر جرعة:{" "}
                {item.record.administered_at
                  ? formatVaccinationDate(
                      item.record.administered_at
                    )
                  : "—"}
              </div>
            )}

            {item.due && (
              <div
                className={`mt-1 text-[10px] font-bold ${
                  state === "overdue"
                    ? "text-rose-400"
                    : darkMode
                    ? "text-slate-300"
                    : "text-slate-600"
                }`}
              >
                {state === "overdue"
                  ? "موعد الجرعة عدى"
                  : "الجرعة القادمة"}
              </div>
            )}

            {item.due && (
              <div
                className={`mt-0.5 text-[10px] ${
                  darkMode
                    ? "text-slate-500"
                    : "text-slate-400"
                }`}
              >
                {formatVaccinationDate(item.due)}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // =========================
  // TOGGLE DECEASED
  // =========================

  async function handleToggleDeceased() {
    if (!pet) return;

    const nextStatus = !pet.is_deceased;

    const confirmed = window.confirm(
      nextStatus
        ? `هل أنت متأكد من تسجيل "${pet.name}" كحيوان متوفى؟`
        : `هل تريد إعادة تفعيل "${pet.name}"؟`
    );

    if (!confirmed) return;

    setUpdatingStatus(true);
    setError("");

    try {
      const db = await getClinicDb();

      const { data, error: updateError } = await db
        .from("pets")
        .update({
          is_deceased: nextStatus,
        })
        .eq("id", pet.id)
        .select("*")
        .single();

      if (updateError) {
        console.error(
          "DECEASED UPDATE ERROR:",
          updateError
        );

        setError(updateError.message);
        return;
      }

      setPet(data as Pet);
    } catch (err) {
      console.error("DECEASED UPDATE ERROR:", err);

      setError(
        err instanceof Error
          ? err.message
          : "حصل خطأ أثناء تحديث حالة الحيوان."
      );
    } finally {
      setUpdatingStatus(false);
    }
  }

  // =========================
  // DELETE PET
  // =========================

  async function handleDeletePet() {
    if (!pet) return;

    const confirmed = window.confirm(
      `⚠️ حذف نهائي للحيوان\n\n` +
        `أنت على وشك حذف "${pet.name}" نهائيًا.\n\n` +
        `سيتم حذف الحيوان وكل الكشوفات والتطعيمات والأدوية المرتبطة به، ` +
        `وأي فواتير مرتبطة بالزيارات المحذوفة.\n\n` +
        `لا يمكن التراجع عن هذا الإجراء.\n\n` +
        `هل تريد المتابعة؟`
    );

    if (!confirmed) return;

    setDeletingPet(true);
    setError("");

    try {
      const db = await getClinicDb();

      // =========================
      // GET VISITS
      // =========================

      const {
        data: visitRows,
        error: visitsLoadError,
      } = await db
        .from("visits")
        .select("id")
        .eq("pet_id", pet.id);

      if (visitsLoadError) {
        throw visitsLoadError;
      }

      const visitIds = (visitRows || [])
        .map((row) => row.id)
        .filter(Boolean);

      // =========================
      // GET INVOICES
      // =========================

      const invoiceIdSet = new Set<string>();

      const {
        data: petInvoices,
        error: petInvoicesError,
      } = await db
        .from("invoices")
        .select("id")
        .eq("pet_id", pet.id);

      if (petInvoicesError) {
        throw petInvoicesError;
      }

      for (const invoice of petInvoices || []) {
        if (invoice.id) {
          invoiceIdSet.add(invoice.id);
        }
      }

      if (visitIds.length > 0) {
        const {
          data: visitInvoices,
          error: visitInvoicesError,
        } = await db
          .from("invoices")
          .select("id")
          .in("visit_id", visitIds);

        if (visitInvoicesError) {
          throw visitInvoicesError;
        }

        for (const invoice of visitInvoices || []) {
          if (invoice.id) {
            invoiceIdSet.add(invoice.id);
          }
        }
      }

      const invoiceIds = [...invoiceIdSet];

      // =========================
      // DELETE INVOICE ITEMS
      // =========================

      if (invoiceIds.length > 0) {
        const {
          error: invoiceItemsDeleteError,
        } = await db
          .from("invoice_items")
          .delete()
          .in("invoice_id", invoiceIds);

        if (invoiceItemsDeleteError) {
          throw invoiceItemsDeleteError;
        }

        // =========================
        // DELETE INVOICES
        // =========================

        const {
          error: invoicesDeleteError,
        } = await db
          .from("invoices")
          .delete()
          .in("id", invoiceIds);

        if (invoicesDeleteError) {
          throw invoicesDeleteError;
        }
      }

      // =========================
      // DELETE VISIT MEDICATIONS
      // =========================

      if (visitIds.length > 0) {
        const {
          error: visitMedicationsDeleteError,
        } = await db
          .from("visit_medications")
          .delete()
          .in("visit_id", visitIds);

        if (visitMedicationsDeleteError) {
          throw visitMedicationsDeleteError;
        }

        // =========================
        // DELETE VACCINES BY VISIT
        // =========================

        const {
          error: vaccinationsByVisitDeleteError,
        } = await db
          .from("vaccinations")
          .delete()
          .in("visit_id", visitIds);

        if (vaccinationsByVisitDeleteError) {
          throw vaccinationsByVisitDeleteError;
        }
      }

      // =========================
      // DELETE VACCINES BY PET
      // =========================

      const {
        error: vaccinationsByPetDeleteError,
      } = await db
        .from("vaccinations")
        .delete()
        .eq("pet_id", pet.id);

      if (vaccinationsByPetDeleteError) {
        throw vaccinationsByPetDeleteError;
      }

      // =========================
      // DELETE VISITS
      // =========================

      if (visitIds.length > 0) {
        const {
          error: visitsDeleteError,
        } = await db
          .from("visits")
          .delete()
          .in("id", visitIds);

        if (visitsDeleteError) {
          throw visitsDeleteError;
        }
      }

      // =========================
      // DELETE PET
      // =========================

      const { error: deleteError } = await db
        .from("pets")
        .delete()
        .eq("id", pet.id);

      if (deleteError) {
        throw deleteError;
      }

      window.location.href = "/pets";
    } catch (err) {
      console.error(
        "PET CASCADE DELETE ERROR:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "حصل خطأ أثناء حذف الحيوان وبياناته المرتبطة."
      );
    } finally {
      setDeletingPet(false);
    }
  }

  // =========================
  // LOADING
  // =========================

  if (loading) {
    return (
      <main
        dir="rtl"
        className={`min-h-screen p-6 ${
          darkMode
            ? "bg-slate-950 text-slate-100"
            : "bg-[#f7f9fc] text-slate-900"
        }`}
      >
        <div
          className={`mx-auto max-w-6xl rounded-3xl p-10 text-center shadow-sm ${
            darkMode
              ? "bg-slate-900"
              : "bg-white"
          }`}
        >
          <div className="mb-3 text-4xl">
            🐾
          </div>

          <p
            className={`font-semibold ${
              darkMode
                ? "text-slate-400"
                : "text-slate-500"
            }`}
          >
            جاري تحميل الملف الطبي...
          </p>
        </div>
      </main>
    );
  }

  // =========================
  // ERROR
  // =========================

  if (error && !pet) {
    return (
      <main
        dir="rtl"
        className={`min-h-screen p-6 ${
          darkMode
            ? "bg-slate-950 text-slate-100"
            : "bg-[#f7f9fc] text-slate-900"
        }`}
      >
        <div className="mx-auto max-w-6xl">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <Link
              href="/pets"
              className={`text-sm font-semibold ${
                darkMode
                  ? "text-slate-400 hover:text-white"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              ← العودة للحيوانات
            </Link>

            <div className="flex gap-2">
              <Link
                href="/"
                className={`rounded-2xl px-4 py-2 text-sm font-semibold ${
                  darkMode
                    ? "bg-slate-800 text-white"
                    : "bg-white text-slate-700 shadow-sm"
                }`}
              >
                🏠 Dashboard
              </Link>

              <button
                type="button"
                onClick={toggleDarkMode}
                className={`rounded-2xl px-4 py-2 text-sm font-semibold ${
                  darkMode
                    ? "bg-slate-800 text-yellow-300"
                    : "bg-white text-slate-700 shadow-sm"
                }`}
              >
                {darkMode ? "☀️" : "🌙"}
              </button>
            </div>
          </div>

          <div
            className={`rounded-3xl p-10 text-center shadow-sm ${
              darkMode
                ? "bg-slate-900"
                : "bg-white"
            }`}
          >
            <div className="mb-4 text-5xl">
              ❌
            </div>

            <h1 className="text-2xl font-bold">
              تعذر فتح الملف الطبي
            </h1>

            <p className="mt-3 text-sm text-red-500">
              {error}
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (!pet) {
    return null;
  }

  const cardClass = darkMode
    ? "bg-slate-900 border border-slate-800"
    : "bg-white";

  const mutedText = darkMode
    ? "text-slate-400"
    : "text-slate-500";

  const softCard = darkMode
    ? "bg-slate-800"
    : "bg-slate-50";

  const vaccineCircles = getVaccineCircles();

  return (
    <main
      dir="rtl"
      className={`min-h-screen px-4 py-6 transition-colors sm:px-5 sm:py-8 ${
        darkMode
          ? "bg-slate-950 text-slate-100"
          : "bg-[#f7f9fc] text-slate-900"
      }`}
    >
      <div className="mx-auto max-w-6xl">

        {/* =========================
            TOP NAVIGATION
        ========================= */}

        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/pets"
            className={`text-sm font-semibold transition ${
              darkMode
                ? "text-slate-400 hover:text-white"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            ← العودة للحيوانات
          </Link>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/"
              className={`rounded-2xl px-4 py-2.5 text-sm font-semibold transition ${
                darkMode
                  ? "bg-slate-800 text-white hover:bg-slate-700"
                  : "bg-white text-slate-700 shadow-sm hover:shadow-md"
              }`}
            >
              🏠 Dashboard
            </Link>

            <button
              type="button"
              onClick={toggleDarkMode}
              className={`rounded-2xl px-4 py-2.5 text-sm font-semibold transition ${
                darkMode
                  ? "bg-slate-800 text-yellow-300 hover:bg-slate-700"
                  : "bg-white text-slate-700 shadow-sm hover:shadow-md"
              }`}
              title={
                darkMode
                  ? "الوضع الفاتح"
                  : "الوضع الداكن"
              }
            >
              {darkMode ? "☀️" : "🌙"}
            </button>
          </div>
        </div>

        {/* =========================
            PET HEADER
        ========================= */}

        <section
          className={`mb-6 rounded-3xl p-5 shadow-sm sm:p-6 ${cardClass}`}
        >
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-4 sm:gap-5">

              <div
                className={`flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-3xl text-6xl sm:h-28 sm:w-28 ${
                  darkMode
                    ? "bg-slate-800"
                    : "bg-slate-100"
                }`}
              >
                {pet.photo_url ? (
                  <img
                    src={pet.photo_url}
                    alt={pet.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  getSpeciesIcon(pet.species)
                )}
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold sm:text-3xl">
                    {pet.name}
                  </h1>

                  {pet.is_deceased && (
                    <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                      🕊️ متوفى
                    </span>
                  )}
                </div>

                <p className={`mt-2 ${mutedText}`}>
                  {getSpeciesName(pet.species)}
                  {pet.breed
                    ? ` • ${pet.breed}`
                    : ""}
                </p>

                {client && (
                  <p
                    className={`mt-2 text-sm ${mutedText}`}
                  >
                    المالك:{" "}
                    <Link
                      href={`/clients/${client.id}`}
                      className={`font-semibold hover:underline ${
                        darkMode
                          ? "text-white"
                          : "text-slate-800"
                      }`}
                    >
                      {client.name}
                    </Link>
                  </p>
                )}

                {pet.is_deceased && (
                  <p className="mt-2 text-sm font-semibold text-slate-400">
                    هذا الحيوان مسجل كمتوفى ولا يمكن تسجيل زيارات جديدة له.
                  </p>
                )}
              </div>
            </div>

            <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto lg:flex-wrap">
              <Link
                href={`/pets/${pet.id}/edit`}
                className={`rounded-2xl px-5 py-3 text-center text-sm font-semibold transition ${
                  darkMode
                    ? "bg-slate-800 text-white hover:bg-slate-700"
                    : "bg-slate-100 text-slate-800 hover:bg-slate-200"
                }`}
              >
                ✏️ تعديل البيانات
              </Link>

              {!pet.is_deceased && (
                <Link
                  href={`/visits/new?pet=${pet.id}`}
                  className="rounded-2xl bg-slate-900 px-5 py-3 text-center text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:shadow-lg dark:bg-white dark:text-slate-900"
                >
                  🩺 زيارة جديدة
                </Link>
              )}
            </div>
          </div>
        </section>

        {/* =========================
            STATUS
        ========================= */}

        <section
          className={`mb-6 rounded-3xl p-5 shadow-sm ${cardClass}`}
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-bold">
                حالة الحيوان
              </h2>

              <p
                className={`mt-1 text-sm ${mutedText}`}
              >
                {pet.is_deceased
                  ? "الحيوان مسجل كمتوفى. تظل بياناته وتاريخه الطبي محفوظين."
                  : "الحيوان نشط ويمكن تسجيل زيارات جديدة له."}
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={handleToggleDeceased}
                disabled={updatingStatus}
                className={`rounded-2xl px-5 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  pet.is_deceased
                    ? darkMode
                      ? "bg-emerald-900 text-emerald-200 hover:bg-emerald-800"
                      : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                    : darkMode
                    ? "bg-slate-800 text-slate-200 hover:bg-slate-700"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {updatingStatus
                  ? "جاري التحديث..."
                  : pet.is_deceased
                  ? "♻️ إعادة تفعيل الحيوان"
                  : "🕊️ تسجيل كمتوفى"}
              </button>

              <button
                type="button"
                onClick={handleDeletePet}
                disabled={deletingPet}
                className="rounded-2xl bg-red-50 px-5 py-3 text-sm font-semibold text-red-600 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900"
              >
                {deletingPet
                  ? "جاري الحذف..."
                  : "🗑️ حذف الحيوان"}
              </button>
            </div>
          </div>
        </section>

        {/* =========================
            ERROR
        ========================= */}

        {error && (
          <div className="mb-6 rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {error}
          </div>
        )}

        {/* =========================
            BASIC INFORMATION
        ========================= */}

        <section className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className={`rounded-3xl p-5 shadow-sm ${cardClass}`}>
            <p className={`text-sm ${mutedText}`}>
              الجنس
            </p>

            <p className="mt-2 text-lg font-bold">
              {pet.gender === "Male"
                ? "ذكر"
                : pet.gender === "Female"
                ? "أنثى"
                : "غير محدد"}
            </p>
          </div>

          <div className={`rounded-3xl p-5 shadow-sm ${cardClass}`}>
            <p className={`text-sm ${mutedText}`}>
              العمر
            </p>

            <p className="mt-2 text-lg font-bold">
              {calculateAge(pet.birth_date)}
            </p>
          </div>

          <div className={`rounded-3xl p-5 shadow-sm ${cardClass}`}>
            <p className={`text-sm ${mutedText}`}>
              اللون
            </p>

            <p className="mt-2 text-lg font-bold">
              {pet.color || "غير محدد"}
            </p>
          </div>

          <div className={`rounded-3xl p-5 shadow-sm ${cardClass}`}>
            <p className={`text-sm ${mutedText}`}>
              Microchip
            </p>

            <p
              dir="ltr"
              className="mt-2 truncate text-left text-lg font-bold"
            >
              {pet.microchip || "غير موجود"}
            </p>
          </div>
        </section>

        {/* =========================
            VACCINATIONS
        ========================= */}

        <section
          className={`mb-6 rounded-[2rem] p-5 shadow-sm sm:p-6 ${cardClass}`}
        >
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-bold">
                💉 التطعيمات
              </h2>

              <p
                className={`mt-1 text-sm ${mutedText}`}
              >
                مواعيد الجرعات القادمة للحيوان
              </p>
            </div>

            <div
              className={`w-fit rounded-2xl px-4 py-2 text-sm font-semibold ${
                darkMode
                  ? "bg-slate-800 text-slate-200"
                  : "bg-slate-100 text-slate-700"
              }`}
            >
              {vaccinations.length} تطعيم
            </div>
          </div>

          {vaccinations.length === 0 ? (
            <div
              className={`rounded-3xl border border-dashed p-8 text-center ${
                darkMode
                  ? "border-slate-700 bg-slate-800/40"
                  : "border-slate-200 bg-slate-50"
              }`}
            >
              <div className="mb-3 text-5xl">
                💉
              </div>

              <h3 className="font-bold">
                مفيش تطعيمات مسجلة
              </h3>

              <p
                className={`mt-2 text-sm ${mutedText}`}
              >
                أول تطعيم للحيوان هيظهر هنا.
              </p>
            </div>
          ) : (
            <div className="-mx-1 flex gap-4 overflow-x-auto px-1 pb-2">
              {vaccineCircles.map((item) => (
                <VaccinationCircle
                  key={item.id}
                  item={item}
                />
              ))}
            </div>
          )}
        </section>

        {/* =========================
            OWNER
        ========================= */}

        {client && (
          <section
            className={`mb-6 rounded-3xl p-6 shadow-sm ${cardClass}`}
          >
            <h2 className="mb-5 text-xl font-bold">
              👤 بيانات المالك
            </h2>

            <div className="grid gap-5 sm:grid-cols-3">
              <div>
                <p className={`text-sm ${mutedText}`}>
                  الاسم
                </p>

                <p className="mt-1 font-semibold">
                  {client.name}
                </p>
              </div>

              <div>
                <p className={`text-sm ${mutedText}`}>
                  الهاتف
                </p>

                <p
                  dir="ltr"
                  className="mt-1 text-right font-semibold"
                >
                  {client.phone || "غير موجود"}
                </p>
              </div>

              <div>
                <p className={`text-sm ${mutedText}`}>
                  البريد الإلكتروني
                </p>

                <p className="mt-1 break-all font-semibold">
                  {client.email || "غير موجود"}
                </p>
              </div>
            </div>
          </section>
        )}

        {/* =========================
            NOTES
        ========================= */}

        {pet.notes && (
          <section
            className={`mb-6 rounded-3xl p-6 shadow-sm ${cardClass}`}
          >
            <h2 className="mb-3 text-xl font-bold">
              📝 ملاحظات
            </h2>

            <p
              className={`leading-7 ${
                darkMode
                  ? "text-slate-300"
                  : "text-slate-600"
              }`}
            >
              {pet.notes}
            </p>
          </section>
        )}

        {/* =========================
            MEDICAL HISTORY
        ========================= */}

        <section
          className={`rounded-3xl p-5 shadow-sm sm:p-6 ${cardClass}`}
        >
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-bold">
                التاريخ الطبي
              </h2>

              <p
                className={`mt-1 text-sm ${mutedText}`}
              >
                جميع الزيارات المسجلة للحيوان
              </p>
            </div>

            <div
              className={`w-fit rounded-2xl px-4 py-2 text-sm font-semibold ${
                darkMode
                  ? "bg-slate-800 text-slate-200"
                  : "bg-slate-100 text-slate-700"
              }`}
            >
              {visits.length} زيارة
            </div>
          </div>

          {visits.length === 0 ? (
            <div
              className={`rounded-2xl p-8 text-center ${softCard}`}
            >
              <div className="mb-3 text-5xl">
                🩺
              </div>

              <h3 className="font-bold">
                مفيش زيارات مسجلة
              </h3>

              <p
                className={`mt-2 text-sm ${mutedText}`}
              >
                أول زيارة للحيوان هتظهر هنا.
              </p>

              {!pet.is_deceased && (
                <Link
                  href={`/visits/new?pet=${pet.id}`}
                  className="mt-5 inline-block rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white dark:bg-white dark:text-slate-900"
                >
                  تسجيل أول زيارة
                </Link>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              {visits.map((visit, index) => (
                <div
                  key={visit.id}
                  className={`relative border-r-2 pr-5 sm:pr-6 ${
                    darkMode
                      ? "border-slate-700"
                      : "border-slate-200"
                  }`}
                >
                  <div
                    className={`absolute -right-[9px] top-1 h-4 w-4 rounded-full border-4 ${
                      darkMode
                        ? "border-slate-900 bg-white"
                        : "border-white bg-slate-900"
                    }`}
                  />

                  <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-bold">
                        زيارة #{visits.length - index}
                      </p>

                      <p
                        className={`text-sm ${mutedText}`}
                      >
                        {formatDate(
                          visit.visit_date
                        )}
                        {" • "}
                        {formatTime(
                          visit.visit_date
                        )}
                      </p>
                    </div>

                    {visit.fee !== null && (
                      <div className="font-bold">
                        {visit.fee} ج.م
                      </div>
                    )}
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    {visit.reason && (
                      <div
                        className={`rounded-2xl p-4 ${softCard}`}
                      >
                        <p
                          className={`text-xs ${mutedText}`}
                        >
                          سبب الزيارة
                        </p>

                        <p className="mt-1 font-semibold">
                          {visit.reason}
                        </p>
                      </div>
                    )}

                    {visit.examination && (
                      <div
                        className={`rounded-2xl p-4 ${softCard}`}
                      >
                        <p
                          className={`text-xs ${mutedText}`}
                        >
                          الفحص
                        </p>

                        <p className="mt-1 font-semibold">
                          {visit.examination}
                        </p>
                      </div>
                    )}

                    {visit.diagnosis && (
                      <div
                        className={`rounded-2xl p-4 ${softCard}`}
                      >
                        <p
                          className={`text-xs ${mutedText}`}
                        >
                          التشخيص
                        </p>

                        <p className="mt-1 font-semibold">
                          {visit.diagnosis}
                        </p>
                      </div>
                    )}

                    {visit.treatment && (
                      <div
                        className={`rounded-2xl p-4 ${softCard}`}
                      >
                        <p
                          className={`text-xs ${mutedText}`}
                        >
                          العلاج
                        </p>

                        <p className="mt-1 font-semibold">
                          {visit.treatment}
                        </p>
                      </div>
                    )}

                    {visit.weight !== null && (
                      <div
                        className={`rounded-2xl p-4 ${softCard}`}
                      >
                        <p
                          className={`text-xs ${mutedText}`}
                        >
                          الوزن
                        </p>

                        <p className="mt-1 font-semibold">
                          {visit.weight} kg
                        </p>
                      </div>
                    )}

                    {visit.temperature !== null && (
                      <div
                        className={`rounded-2xl p-4 ${softCard}`}
                      >
                        <p
                          className={`text-xs ${mutedText}`}
                        >
                          الحرارة
                        </p>

                        <p className="mt-1 font-semibold">
                          {visit.temperature} °C
                        </p>
                      </div>
                    )}

                    {visit.notes && (
                      <div
                        className={`rounded-2xl p-4 sm:col-span-2 ${softCard}`}
                      >
                        <p
                          className={`text-xs ${mutedText}`}
                        >
                          ملاحظات
                        </p>

                        <p className="mt-1 leading-7 font-semibold">
                          {visit.notes}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* =========================
            BOTTOM NAVIGATION
        ========================= */}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/"
            className={`flex-1 rounded-2xl px-5 py-4 text-center text-sm font-bold transition ${
              darkMode
                ? "bg-slate-800 text-white hover:bg-slate-700"
                : "bg-white text-slate-800 shadow-sm hover:shadow-md"
            }`}
          >
            🏠 الرجوع للـ Dashboard
          </Link>

          <Link
            href="/pets"
            className={`flex-1 rounded-2xl px-5 py-4 text-center text-sm font-bold transition ${
              darkMode
                ? "bg-slate-800 text-white hover:bg-slate-700"
                : "bg-white text-slate-800 shadow-sm hover:shadow-md"
            }`}
          >
            🐾 كل الحيوانات
          </Link>
        </div>
      </div>
    </main>
  );
}