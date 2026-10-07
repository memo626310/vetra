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

export default function PetPage() {
  const [pet, setPet] = useState<Pet | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [deletingPet, setDeletingPet] = useState(false);

  const [darkMode, setDarkMode] = useState(false);

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

    if (value === "cat" || value === "قط") {
      return "🐱";
    }

    if (value === "dog" || value === "كلب") {
      return "🐶";
    }

    return "🐾";
  }

  function getSpeciesName(species: string) {
    const value = species.toLowerCase();

    if (value === "cat") return "قط";
    if (value === "dog") return "كلب";
    if (value === "other") return "أخرى";

    return species;
  }

  function calculateAge(date: string | null) {
    if (!date) return "غير محدد";

    const birth = new Date(date);
    const today = new Date();

    let years = today.getFullYear() - birth.getFullYear();
    let months = today.getMonth() - birth.getMonth();

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

  function formatTime(date: string) {
    return new Date(date).toLocaleTimeString("ar-EG", {
      hour: "2-digit",
      minute: "2-digit",
    });
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
        console.error("DECEASED UPDATE ERROR:", updateError);
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
      `⚠️ تحذير\n\nهل أنت متأكد من حذف "${pet.name}" نهائيًا؟\n\nالحذف لا يمكن التراجع عنه.`
    );

    if (!confirmed) return;

    setDeletingPet(true);
    setError("");

    try {
      const db = await getClinicDb();

      // =========================
      // CHECK MEDICAL HISTORY
      // =========================

      const {
        count,
        error: visitsCheckError,
      } = await db
        .from("visits")
        .select("id", {
          count: "exact",
          head: true,
        })
        .eq("pet_id", pet.id);

      if (visitsCheckError) {
        console.error("VISITS CHECK ERROR:", visitsCheckError);

        setError(
          "تعذر التأكد من وجود زيارات للحيوان. لم يتم حذف الحيوان."
        );

        return;
      }

      if ((count ?? 0) > 0) {
        setError(
          `لا يمكن حذف ${pet.name} لأنه لديه ${count} زيارة مسجلة. استخدم "اعتبار الحيوان متوفى" بدل الحذف للحفاظ على التاريخ الطبي.`
        );

        return;
      }

      // =========================
      // DELETE PET
      // =========================

      const { error: deleteError } = await db
        .from("pets")
        .delete()
        .eq("id", pet.id);

      if (deleteError) {
        console.error("PET DELETE ERROR:", deleteError);

        setError(
          deleteError.message ||
            "تعذر حذف الحيوان."
        );

        return;
      }

      // Go back to pets list
      window.location.href = "/pets";
    } catch (err) {
      console.error("PET DELETE ERROR:", err);

      setError(
        err instanceof Error
          ? err.message
          : "حصل خطأ أثناء حذف الحيوان."
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
            darkMode ? "bg-slate-900" : "bg-white"
          }`}
        >
          <div className="mb-3 text-4xl">🐾</div>

          <p
            className={`font-semibold ${
              darkMode ? "text-slate-400" : "text-slate-500"
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
              darkMode ? "bg-slate-900" : "bg-white"
            }`}
          >
            <div className="mb-4 text-5xl">❌</div>

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

            {/* DASHBOARD */}

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

            {/* DARK MODE */}

            <button
              type="button"
              onClick={toggleDarkMode}
              className={`rounded-2xl px-4 py-2.5 text-sm font-semibold transition ${
                darkMode
                  ? "bg-slate-800 text-yellow-300 hover:bg-slate-700"
                  : "bg-white text-slate-700 shadow-sm hover:shadow-md"
              }`}
              title={darkMode ? "الوضع الفاتح" : "الوضع الداكن"}
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

              {/* PHOTO */}

              <div
                className={`flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-3xl text-6xl sm:h-28 sm:w-28 ${
                  darkMode ? "bg-slate-800" : "bg-slate-100"
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

              {/* INFO */}

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
                  {pet.breed ? ` • ${pet.breed}` : ""}
                </p>

                {client && (
                  <p className={`mt-2 text-sm ${mutedText}`}>
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

            {/* ACTIONS */}

            <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto lg:flex-wrap">

              {/* EDIT */}

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

              {/* NEW VISIT */}

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
            STATUS / DANGER ACTIONS
        ========================= */}

        <section
          className={`mb-6 rounded-3xl p-5 shadow-sm ${cardClass}`}
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

            <div>
              <h2 className="font-bold">
                حالة الحيوان
              </h2>

              <p className={`mt-1 text-sm ${mutedText}`}>
                {pet.is_deceased
                  ? "الحيوان مسجل كمتوفى. تظل بياناته وتاريخه الطبي محفوظين."
                  : "الحيوان نشط ويمكن تسجيل زيارات جديدة له."}
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">

              {/* DECEASED */}

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

              {/* DELETE */}

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

              <p className={`mt-1 text-sm ${mutedText}`}>
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

              <p className={`mt-2 text-sm ${mutedText}`}>
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

                      <p className={`text-sm ${mutedText}`}>
                        {formatDate(visit.visit_date)}
                        {" • "}
                        {formatTime(visit.visit_date)}
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
                      <div className={`rounded-2xl p-4 ${softCard}`}>
                        <p className={`text-xs ${mutedText}`}>
                          سبب الزيارة
                        </p>

                        <p className="mt-1 font-semibold">
                          {visit.reason}
                        </p>
                      </div>
                    )}

                    {visit.examination && (
                      <div className={`rounded-2xl p-4 ${softCard}`}>
                        <p className={`text-xs ${mutedText}`}>
                          الفحص
                        </p>

                        <p className="mt-1 font-semibold">
                          {visit.examination}
                        </p>
                      </div>
                    )}

                    {visit.diagnosis && (
                      <div className={`rounded-2xl p-4 ${softCard}`}>
                        <p className={`text-xs ${mutedText}`}>
                          التشخيص
                        </p>

                        <p className="mt-1 font-semibold">
                          {visit.diagnosis}
                        </p>
                      </div>
                    )}

                    {visit.treatment && (
                      <div className={`rounded-2xl p-4 ${softCard}`}>
                        <p className={`text-xs ${mutedText}`}>
                          العلاج
                        </p>

                        <p className="mt-1 font-semibold">
                          {visit.treatment}
                        </p>
                      </div>
                    )}

                    {visit.weight !== null && (
                      <div className={`rounded-2xl p-4 ${softCard}`}>
                        <p className={`text-xs ${mutedText}`}>
                          الوزن
                        </p>

                        <p className="mt-1 font-semibold">
                          {visit.weight} kg
                        </p>
                      </div>
                    )}

                    {visit.temperature !== null && (
                      <div className={`rounded-2xl p-4 ${softCard}`}>
                        <p className={`text-xs ${mutedText}`}>
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
                        <p className={`text-xs ${mutedText}`}>
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