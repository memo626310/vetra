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

  if (loading) {
    return (
      <main
        dir="rtl"
        className="min-h-screen bg-[#f7f9fc] p-6 text-slate-900"
      >
        <div className="mx-auto max-w-6xl rounded-3xl bg-white p-10 text-center shadow-sm">
          <div className="mb-3 text-4xl">🐾</div>

          <p className="font-semibold text-slate-500">
            جاري تحميل الملف الطبي...
          </p>
        </div>
      </main>
    );
  }

  if (error && !pet) {
    return (
      <main
        dir="rtl"
        className="min-h-screen bg-[#f7f9fc] p-6 text-slate-900"
      >
        <div className="mx-auto max-w-6xl">
          <Link
            href="/pets"
            className="mb-6 inline-block text-sm font-semibold text-slate-500 hover:text-slate-900"
          >
            ← العودة للحيوانات
          </Link>

          <div className="rounded-3xl bg-white p-10 text-center shadow-sm">
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

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-[#f7f9fc] px-5 py-8 text-slate-900"
    >
      <div className="mx-auto max-w-6xl">

        {/* Back */}
        <Link
          href="/pets"
          className="mb-6 inline-block text-sm text-slate-500 transition hover:text-slate-900"
        >
          ← العودة للحيوانات
        </Link>

        {/* Pet Header */}
        <section className="mb-6 rounded-3xl bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">

            <div className="flex items-center gap-5">

              <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-3xl bg-slate-100 text-6xl">
                {getSpeciesIcon(pet.species)}
              </div>

              <div>
                <h1 className="text-3xl font-bold">
                  {pet.name}
                </h1>

                <p className="mt-2 text-slate-500">
                  {getSpeciesName(pet.species)}
                  {pet.breed ? ` • ${pet.breed}` : ""}
                </p>

                {client && (
                  <p className="mt-2 text-sm text-slate-500">
                    المالك:{" "}
                    <Link
                      href={`/clients/${client.id}`}
                      className="font-semibold text-slate-800 hover:underline"
                    >
                      {client.name}
                    </Link>
                  </p>
                )}
              </div>

            </div>

            {/* New Visit */}
            <Link
              href={`/visits/new?pet=${pet.id}`}
              className="rounded-2xl bg-slate-900 px-6 py-4 text-center font-semibold text-white transition hover:-translate-y-0.5 hover:shadow-lg"
            >
              🩺 زيارة جديدة
            </Link>

          </div>
        </section>

        {/* Error */}
        {error && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
            {error}
          </div>
        )}

        {/* Basic Information */}
        <section className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

          <div className="rounded-3xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-400">
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

          <div className="rounded-3xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-400">
              العمر
            </p>

            <p className="mt-2 text-lg font-bold">
              {calculateAge(pet.birth_date)}
            </p>
          </div>

          <div className="rounded-3xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-400">
              اللون
            </p>

            <p className="mt-2 text-lg font-bold">
              {pet.color || "غير محدد"}
            </p>
          </div>

          <div className="rounded-3xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-400">
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

        {/* Owner */}
        {client && (
          <section className="mb-6 rounded-3xl bg-white p-6 shadow-sm">

            <h2 className="mb-5 text-xl font-bold">
              👤 بيانات المالك
            </h2>

            <div className="grid gap-4 sm:grid-cols-3">

              <div>
                <p className="text-sm text-slate-400">
                  الاسم
                </p>

                <p className="mt-1 font-semibold">
                  {client.name}
                </p>
              </div>

              <div>
                <p className="text-sm text-slate-400">
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
                <p className="text-sm text-slate-400">
                  البريد الإلكتروني
                </p>

                <p className="mt-1 font-semibold">
                  {client.email || "غير موجود"}
                </p>
              </div>

            </div>

          </section>
        )}

        {/* Notes */}
        {pet.notes && (
          <section className="mb-6 rounded-3xl bg-white p-6 shadow-sm">

            <h2 className="mb-3 text-xl font-bold">
              📝 ملاحظات
            </h2>

            <p className="leading-7 text-slate-600">
              {pet.notes}
            </p>

          </section>
        )}

        {/* Medical History */}
        <section className="rounded-3xl bg-white p-6 shadow-sm">

          <div className="mb-6 flex items-center justify-between">

            <div>
              <h2 className="text-2xl font-bold">
                التاريخ الطبي
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                جميع الزيارات المسجلة للحيوان
              </p>
            </div>

            <div className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold">
              {visits.length} زيارة
            </div>

          </div>

          {visits.length === 0 ? (
            <div className="rounded-2xl bg-slate-50 p-8 text-center">

              <div className="mb-3 text-5xl">
                🩺
              </div>

              <h3 className="font-bold">
                مفيش زيارات مسجلة
              </h3>

              <p className="mt-2 text-sm text-slate-500">
                أول زيارة للحيوان هتظهر هنا.
              </p>

              <Link
                href={`/visits/new?pet=${pet.id}`}
                className="mt-5 inline-block rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white"
              >
                تسجيل أول زيارة
              </Link>

            </div>
          ) : (
            <div className="space-y-5">

              {visits.map((visit, index) => (
                <div
                  key={visit.id}
                  className="relative border-r-2 border-slate-200 pr-6"
                >

                  <div className="absolute -right-[9px] top-1 h-4 w-4 rounded-full border-4 border-white bg-slate-900" />

                  <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">

                    <div>
                      <p className="font-bold">
                        زيارة #{visits.length - index}
                      </p>

                      <p className="text-sm text-slate-500">
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
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <p className="text-xs text-slate-400">
                          سبب الزيارة
                        </p>

                        <p className="mt-1 font-semibold">
                          {visit.reason}
                        </p>
                      </div>
                    )}

                    {visit.examination && (
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <p className="text-xs text-slate-400">
                          الفحص
                        </p>

                        <p className="mt-1 font-semibold">
                          {visit.examination}
                        </p>
                      </div>
                    )}

                    {visit.diagnosis && (
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <p className="text-xs text-slate-400">
                          التشخيص
                        </p>

                        <p className="mt-1 font-semibold">
                          {visit.diagnosis}
                        </p>
                      </div>
                    )}

                    {visit.treatment && (
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <p className="text-xs text-slate-400">
                          العلاج
                        </p>

                        <p className="mt-1 font-semibold">
                          {visit.treatment}
                        </p>
                      </div>
                    )}

                    {visit.weight !== null && (
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <p className="text-xs text-slate-400">
                          الوزن
                        </p>

                        <p className="mt-1 font-semibold">
                          {visit.weight} kg
                        </p>
                      </div>
                    )}

                    {visit.temperature !== null && (
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <p className="text-xs text-slate-400">
                          الحرارة
                        </p>

                        <p className="mt-1 font-semibold">
                          {visit.temperature} °C
                        </p>
                      </div>
                    )}

                    {visit.notes && (
                      <div className="rounded-2xl bg-slate-50 p-4 sm:col-span-2">
                        <p className="text-xs text-slate-400">
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

      </div>
    </main>
  );
}