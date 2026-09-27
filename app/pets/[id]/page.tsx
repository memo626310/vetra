"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

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
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [deletingPet, setDeletingPet] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadPet() {
      const parts = window.location.pathname.split("/");
      const petId = parts[parts.length - 1];

      if (!petId) {
        setLoading(false);
        return;
      }

      const { data: petData, error: petError } = await supabase
        .from("pets")
        .select("*")
        .eq("id", petId)
        .single();

      if (petError || !petData) {
        setLoading(false);
        return;
      }

      setPet(petData);

      const { data: clientData } = await supabase
        .from("clients")
        .select("id, name, phone, email")
        .eq("id", petData.client_id)
        .single();

      if (clientData) {
        setClient(clientData);
      }

      const { data: visitsData } = await supabase
        .from("visits")
        .select("*")
        .eq("pet_id", petId)
        .order("visit_date", { ascending: false });

      if (visitsData) {
        setVisits(visitsData);
      }

      setLoading(false);
    }

    loadPet();
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

  async function toggleDeceasedStatus() {
    if (!pet) return;

    setMessage("");

    const newStatus = !pet.is_deceased;

    const confirmed = window.confirm(
      newStatus
        ? `هل أنت متأكد من اعتبار الحيوان "${pet.name}" متوفى؟\n\nلن يتم حذف الملف الطبي أو الزيارات السابقة، ولكن لن يمكن تسجيل زيارات جديدة له.`
        : `هل تريد إعادة تفعيل الحيوان "${pet.name}"؟\n\nسيصبح من الممكن تسجيل زيارات جديدة له مرة أخرى.`
    );

    if (!confirmed) return;

    setUpdatingStatus(true);

    const { error } = await supabase
      .from("pets")
      .update({
        is_deceased: newStatus,
      })
      .eq("id", pet.id);

    if (error) {
      console.error(error);
      setMessage("حصل خطأ أثناء تحديث حالة الحيوان.");
      setUpdatingStatus(false);
      return;
    }

    setPet({
      ...pet,
      is_deceased: newStatus,
    });

    setMessage(
      newStatus
        ? "تم تسجيل الحيوان كمتوفى."
        : "تم إعادة تفعيل الحيوان."
    );

    setUpdatingStatus(false);
  }

  async function deletePet() {
    if (!pet) return;

    const confirmed = window.confirm(
      `هل أنت متأكد من حذف الحيوان "${pet.name}"؟\n\nسيتم حذف الملف الطبي وجميع الزيارات المرتبطة بهذا الحيوان أيضًا.\n\nهذا الإجراء نهائي.`
    );

    if (!confirmed) return;

    setDeletingPet(true);
    setMessage("");

    const { error } = await supabase
      .from("pets")
      .delete()
      .eq("id", pet.id);

    if (error) {
      console.error(error);
      setMessage("حصل خطأ أثناء حذف الحيوان.");
      setDeletingPet(false);
      return;
    }

    if (client?.id) {
      window.location.href = `/clients/${client.id}`;
    } else {
      window.location.href = "/pets";
    }
  }

  if (loading) {
    return (
      <main
        dir="rtl"
        className="min-h-screen bg-[#f7f9fc] p-6 text-slate-900"
      >
        <div className="mx-auto max-w-6xl rounded-3xl bg-white p-10 text-center shadow-sm">
          جاري تحميل الملف الطبي...
        </div>
      </main>
    );
  }

  if (!pet) {
    return (
      <main
        dir="rtl"
        className="min-h-screen bg-[#f7f9fc] p-6 text-slate-900"
      >
        <div className="mx-auto max-w-6xl rounded-3xl bg-white p-10 text-center shadow-sm">
          <div className="mb-4 text-5xl">❌</div>

          <h1 className="text-2xl font-bold">
            الحيوان غير موجود
          </h1>

          <Link
            href="/pets"
            className="mt-6 inline-block rounded-2xl bg-slate-900 px-6 py-3 font-semibold text-white"
          >
            العودة للحيوانات
          </Link>
        </div>
      </main>
    );
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
          <div className="flex flex-col gap-6">

            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">

              <div className="flex items-center gap-5">

                <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-3xl bg-slate-100 text-6xl">
                  {getSpeciesIcon(pet.species)}
                </div>

                <div>
                  <div className="flex flex-wrap items-center gap-3">

                    <h1 className="text-3xl font-bold">
                      {pet.name}
                    </h1>

                    {pet.is_deceased && (
                      <span className="rounded-full bg-slate-200 px-3 py-1 text-sm font-bold text-slate-700">
                        ⚫ متوفى
                      </span>
                    )}

                  </div>

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

            </div>

            {/* Status + Actions */}
            <div className="flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">

              <div>
                {pet.is_deceased ? (
                  <p className="text-sm text-slate-500">
                    هذا الحيوان مسجل كمتوفى، ويمكنك الاطلاع على ملفه وتاريخه الطبي بالكامل.
                  </p>
                ) : (
                  <p className="text-sm text-slate-500">
                    الملف نشط ويمكن تسجيل زيارات جديدة.
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-3">

                {!pet.is_deceased && (
                  <Link
                    href={`/visits/new?pet=${pet.id}`}
                    className="rounded-2xl bg-slate-900 px-5 py-3 text-center font-semibold text-white transition hover:-translate-y-0.5 hover:shadow-lg"
                  >
                    🩺 زيارة جديدة
                  </Link>
                )}

                <button
                  onClick={toggleDeceasedStatus}
                  disabled={updatingStatus}
                  className={
                    pet.is_deceased
                      ? "rounded-2xl bg-emerald-50 px-5 py-3 font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
                      : "rounded-2xl bg-amber-50 px-5 py-3 font-semibold text-amber-700 transition hover:bg-amber-100 disabled:opacity-50"
                  }
                >
                  {updatingStatus
                    ? "جاري التحديث..."
                    : pet.is_deceased
                    ? "🔄 إعادة تفعيل الحيوان"
                    : "⚫ اعتبار الحيوان متوفى"}
                </button>

                <button
                  onClick={deletePet}
                  disabled={deletingPet}
                  className="rounded-2xl bg-red-50 px-5 py-3 font-semibold text-red-600 transition hover:bg-red-100 disabled:opacity-50"
                >
                  {deletingPet ? "جاري الحذف..." : "🗑️ حذف الحيوان"}
                </button>

              </div>

            </div>

            {message && (
              <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">
                {message}
              </div>
            )}

          </div>
        </section>

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

              {!pet.is_deceased && (
                <Link
                  href={`/visits/new?pet=${pet.id}`}
                  className="mt-5 inline-block rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white"
                >
                  تسجيل أول زيارة
                </Link>
              )}

              {pet.is_deceased && (
                <p className="mt-4 text-sm font-semibold text-slate-500">
                  ⚫ الحيوان متوفى، لذلك لا يمكن تسجيل زيارة جديدة.
                </p>
              )}

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