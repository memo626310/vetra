"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Client = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
};

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

export default function ClientPage() {
  const [client, setClient] = useState<Client | null>(null);
  const [pets, setPets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);

  const [petName, setPetName] = useState("");
  const [species, setSpecies] = useState("Cat");
  const [breed, setBreed] = useState("");
  const [gender, setGender] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [color, setColor] = useState("");
  const [microchip, setMicrochip] = useState("");
  const [petNotes, setPetNotes] = useState("");

  const [savingPet, setSavingPet] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadClient() {
      const parts = window.location.pathname.split("/");
      const clientId = parts[parts.length - 1];

      if (!clientId) {
        setLoading(false);
        return;
      }

      const { data: clientData, error: clientError } = await supabase
        .from("clients")
        .select("*")
        .eq("id", clientId)
        .single();

      if (clientError || !clientData) {
        setLoading(false);
        return;
      }

      setClient(clientData);

      const { data: petsData } = await supabase
        .from("pets")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });

      if (petsData) {
        setPets(petsData);
      }

      setLoading(false);
    }

    loadClient();
  }, []);

  async function addPet(e: React.FormEvent) {
    e.preventDefault();

    if (!client || !petName.trim()) {
      return;
    }

    setSavingPet(true);
    setMessage("");

    const { data, error } = await supabase
      .from("pets")
      .insert({
        client_id: client.id,
        name: petName.trim(),
        species,
        breed: breed || null,
        gender: gender || null,
        birth_date: birthDate || null,
        color: color || null,
        microchip: microchip || null,
        notes: petNotes || null,
      })
      .select()
      .single();

    if (error) {
      setMessage("حصل خطأ أثناء إضافة الحيوان.");
      setSavingPet(false);
      return;
    }

    if (data) {
      setPets((current) => [data, ...current]);
    }

    setPetName("");
    setBreed("");
    setGender("");
    setBirthDate("");
    setColor("");
    setMicrochip("");
    setPetNotes("");

    setMessage("تم إضافة الحيوان بنجاح ✓");
    setSavingPet(false);
  }

  if (loading) {
    return (
      <main
        dir="rtl"
        className="min-h-screen bg-[#f7f9fc] p-6 text-slate-900"
      >
        <div className="mx-auto max-w-6xl rounded-3xl bg-white p-10 text-center shadow-sm">
          جاري تحميل ملف العميل...
        </div>
      </main>
    );
  }

  if (!client) {
    return (
      <main
        dir="rtl"
        className="min-h-screen bg-[#f7f9fc] p-6 text-slate-900"
      >
        <div className="mx-auto max-w-6xl rounded-3xl bg-white p-10 text-center shadow-sm">
          <div className="mb-4 text-5xl">❌</div>

          <h1 className="text-2xl font-bold">
            العميل غير موجود
          </h1>

          <Link
            href="/clients"
            className="mt-6 inline-block rounded-2xl bg-slate-900 px-6 py-3 font-semibold text-white"
          >
            العودة للعملاء
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
          href="/clients"
          className="mb-6 inline-block text-sm text-slate-500 transition hover:text-slate-900"
        >
          ← العودة للعملاء
        </Link>

        {/* Client Header */}
        <section className="mb-6 rounded-3xl bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">

            <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-slate-100 text-4xl">
              👤
            </div>

            <div>
              <h1 className="text-3xl font-bold">
                {client.name}
              </h1>

              <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-500">
                {client.phone && (
                  <span>
                    📞 <span dir="ltr">{client.phone}</span>
                  </span>
                )}

                {client.email && (
                  <span>
                    ✉️ {client.email}
                  </span>
                )}

                {client.address && (
                  <span>
                    📍 {client.address}
                  </span>
                )}
              </div>
            </div>

          </div>

          {client.notes && (
            <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
              <strong>ملاحظات:</strong> {client.notes}
            </div>
          )}
        </section>

        {/* Pets */}
        <section className="mb-6">

          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">
                الحيوانات
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                الحيوانات المسجلة باسم العميل
              </p>
            </div>

            <div className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold shadow-sm">
              {pets.length} حيوان
            </div>
          </div>

          {pets.length === 0 ? (
            <div className="rounded-3xl bg-white p-8 text-center shadow-sm">
              <div className="mb-3 text-5xl">
                🐾
              </div>

              <h3 className="text-lg font-bold">
                مفيش حيوانات مسجلة
              </h3>

              <p className="mt-2 text-sm text-slate-500">
                أضف أول حيوان للعميل من النموذج بالأسفل.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {pets.map((pet) => (
                <Link
                  key={pet.id}
                  href={`/pets/${pet.id}`}
                  className="group rounded-3xl bg-white p-5 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl"
                >
                  <div className="flex items-center gap-4">

                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-3xl transition group-hover:scale-105">
                      {pet.species.toLowerCase() === "dog"
                        ? "🐶"
                        : pet.species.toLowerCase() === "cat"
                        ? "🐱"
                        : "🐾"}
                    </div>

                    <div className="min-w-0">
                      <h3 className="truncate text-lg font-bold">
                        {pet.name}
                      </h3>

                      <p className="mt-1 text-sm text-slate-500">
                        {pet.species}
                        {pet.breed ? ` • ${pet.breed}` : ""}
                      </p>
                    </div>

                  </div>

                  <div className="mt-4 border-t border-slate-100 pt-4 text-sm font-semibold text-slate-500 transition group-hover:text-slate-900">
                    فتح الملف الطبي ←
                  </div>
                </Link>
              ))}
            </div>
          )}

        </section>

        {/* Add Pet */}
        <section className="rounded-3xl bg-white p-6 shadow-sm">

          <div className="mb-6">
            <h2 className="text-2xl font-bold">
              إضافة حيوان
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              أضف حيوان جديد إلى ملف العميل
            </p>
          </div>

          <form
            onSubmit={addPet}
            className="grid gap-4 sm:grid-cols-2"
          >

            {/* Name */}
            <div>
              <label className="mb-2 block text-sm font-semibold">
                اسم الحيوان *
              </label>

              <input
                value={petName}
                onChange={(e) => setPetName(e.target.value)}
                placeholder="مثال: لولو"
                required
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-slate-400"
              />
            </div>

            {/* Species */}
            <div>
              <label className="mb-2 block text-sm font-semibold">
                النوع *
              </label>

              <select
                value={species}
                onChange={(e) => setSpecies(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none"
              >
                <option value="Cat">قط 🐱</option>
                <option value="Dog">كلب 🐶</option>
                <option value="Other">أخرى 🐾</option>
              </select>
            </div>

            {/* Breed */}
            <div>
              <label className="mb-2 block text-sm font-semibold">
                السلالة
              </label>

              <input
                value={breed}
                onChange={(e) => setBreed(e.target.value)}
                placeholder="مثال: Persian"
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none"
              />
            </div>

            {/* Gender */}
            <div>
              <label className="mb-2 block text-sm font-semibold">
                النوع
              </label>

              <select
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none"
              >
                <option value="">اختار</option>
                <option value="Male">ذكر</option>
                <option value="Female">أنثى</option>
              </select>
            </div>

            {/* Birth date */}
            <div>
              <label className="mb-2 block text-sm font-semibold">
                تاريخ الميلاد
              </label>

              <input
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none"
              />
            </div>

            {/* Color */}
            <div>
              <label className="mb-2 block text-sm font-semibold">
                اللون
              </label>

              <input
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder="مثال: أبيض وأسود"
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none"
              />
            </div>

            {/* Microchip */}
            <div>
              <label className="mb-2 block text-sm font-semibold">
                Microchip
              </label>

              <input
                value={microchip}
                onChange={(e) => setMicrochip(e.target.value)}
                placeholder="رقم الميكروشيب"
                dir="ltr"
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-left outline-none"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="mb-2 block text-sm font-semibold">
                ملاحظات
              </label>

              <input
                value={petNotes}
                onChange={(e) => setPetNotes(e.target.value)}
                placeholder="أي ملاحظات"
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none"
              />
            </div>

            {/* Submit */}
            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={savingPet}
                className="rounded-2xl bg-slate-900 px-6 py-3 font-semibold text-white transition hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingPet
                  ? "جاري الإضافة..."
                  : "إضافة الحيوان +"}
              </button>

              {message && (
                <p className="mt-3 text-sm text-slate-600">
                  {message}
                </p>
              )}
            </div>

          </form>
        </section>

      </div>
    </main>
  );
}