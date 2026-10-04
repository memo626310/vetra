"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { getClinicDb } from "@/lib/clinic-db";

type Client = {
  id: string;
  client_code: string;
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
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const clientId = params.id;

  const [client, setClient] = useState<Client | null>(null);
  const [pets, setPets] = useState<Pet[]>([]);

  const [loading, setLoading] = useState(true);
  const [savingPet, setSavingPet] = useState(false);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [petName, setPetName] = useState("");
  const [species, setSpecies] = useState("Cat");
  const [breed, setBreed] = useState("");
  const [gender, setGender] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [color, setColor] = useState("");
  const [microchip, setMicrochip] = useState("");
  const [petNotes, setPetNotes] = useState("");

  async function loadClient() {
    setLoading(true);
    setError("");
    setMessage("");

    try {
      if (!clientId) {
        setError("Client ID غير موجود.");
        setLoading(false);
        return;
      }

      // Get the active clinic database from VETRA Core.
      const db = await getClinicDb();

      // Load client from the Clinic Database.
      const {
        data: clientData,
        error: clientError,
      } = await db
        .from("clients")
        .select("*")
        .eq("id", clientId)
        .single();

      if (clientError || !clientData) {
        console.error("CLIENT LOAD ERROR:", clientError);

        setError(
          clientError?.message ||
            "العميل غير موجود في قاعدة بيانات العيادة."
        );

        setLoading(false);
        return;
      }

      // Load this client's pets from the same Clinic Database.
      const {
        data: petsData,
        error: petsError,
      } = await db
        .from("pets")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", {
          ascending: false,
        });

      if (petsError) {
        console.error("PETS LOAD ERROR:", petsError);

        setError(
          "تم تحميل العميل لكن تعذر تحميل الحيوانات: " +
            petsError.message
        );

        setClient(clientData as Client);
        setPets([]);
        setLoading(false);
        return;
      }

      setClient(clientData as Client);
      setPets((petsData || []) as Pet[]);
      setLoading(false);
    } catch (err) {
      console.error("CLIENT PAGE ERROR:", err);

      setError(
        err instanceof Error
          ? err.message
          : "حصل خطأ أثناء تحميل ملف العميل."
      );

      setLoading(false);
    }
  }

  useEffect(() => {
    void loadClient();
  }, [clientId]);

  async function addPet(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setError("");
    setMessage("");

    if (!client) {
      setError("بيانات العميل غير متاحة.");
      return;
    }

    if (!petName.trim()) {
      setError("اكتب اسم الحيوان الأول.");
      return;
    }

    setSavingPet(true);

    try {
      // Always use the current clinic database.
      const db = await getClinicDb();

      const {
        data,
        error: insertError,
      } = await db
        .from("pets")
        .insert({
          client_id: client.id,
          name: petName.trim(),
          species,
          breed: breed.trim() || null,
          gender: gender || null,
          birth_date: birthDate || null,
          color: color.trim() || null,
          microchip: microchip.trim() || null,
          notes: petNotes.trim() || null,
        })
        .select("*")
        .single();

      if (insertError) {
        console.error(
          "PET INSERT ERROR:",
          insertError
        );

        setError(insertError.message);
        setSavingPet(false);
        return;
      }

      if (data) {
        setPets((current) => [
          data as Pet,
          ...current,
        ]);
      }

      setPetName("");
      setSpecies("Cat");
      setBreed("");
      setGender("");
      setBirthDate("");
      setColor("");
      setMicrochip("");
      setPetNotes("");

      setMessage("تم إضافة الحيوان بنجاح ✓");
    } catch (err) {
      console.error("ADD PET ERROR:", err);

      setError(
        err instanceof Error
          ? err.message
          : "حصل خطأ أثناء إضافة الحيوان."
      );
    } finally {
      setSavingPet(false);
    }
  }

  if (loading) {
    return (
      <main
        dir="rtl"
        className="flex min-h-screen items-center justify-center bg-[#f7f9fc] px-5"
      >
        <div className="rounded-3xl bg-white p-10 text-center shadow-sm">
          <div className="mb-4 text-5xl">🐾</div>

          <p className="font-semibold text-slate-500">
            جاري تحميل ملف العميل...
          </p>
        </div>
      </main>
    );
  }

  if (error && !client) {
    return (
      <main
        dir="rtl"
        className="min-h-screen bg-[#f7f9fc] px-5 py-8"
      >
        <div className="mx-auto max-w-3xl">
          <button
            type="button"
            onClick={() => router.push("/clients")}
            className="mb-6 text-sm font-semibold text-slate-500"
          >
            ← العملاء
          </button>

          <div className="rounded-3xl border border-red-100 bg-white p-10 text-center shadow-sm">
            <div className="mb-4 text-5xl">⚠️</div>

            <h1 className="text-2xl font-black">
              تعذر فتح ملف العميل
            </h1>

            <p className="mt-3 text-sm text-slate-500">
              {error}
            </p>

            <button
              type="button"
              onClick={() => void loadClient()}
              className="mt-6 rounded-2xl bg-slate-900 px-6 py-3 font-bold text-white"
            >
              إعادة المحاولة
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (!client) {
    return null;
  }

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-[#f7f9fc] px-5 py-8 text-slate-900"
    >
      <div className="mx-auto max-w-6xl">

        <Link
          href="/clients"
          className="mb-6 inline-block text-sm font-semibold text-slate-500 transition hover:text-slate-900"
        >
          ← العودة للعملاء
        </Link>

        {/* Client Header */}
        <section className="mb-6 rounded-3xl bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl bg-slate-100 text-4xl">
              👤
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-black">
                  {client.name}
                </h1>

                <span
                  dir="ltr"
                  className="rounded-xl bg-slate-900 px-3 py-1.5 text-sm font-bold tracking-wider text-white"
                >
                  ID: {client.client_code}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-500">
                {client.phone && (
                  <span>
                    📞{" "}
                    <span dir="ltr">
                      {client.phone}
                    </span>
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
              <span className="font-bold">
                ملاحظات:
              </span>{" "}
              {client.notes}
            </div>
          )}
        </section>

        {/* Error */}
        {error && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
            {error}
          </div>
        )}

        {/* Success */}
        {message && (
          <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
            {message}
          </div>
        )}

        {/* Pets */}
        <section className="mb-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-black">
                الحيوانات
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                الحيوانات المسجلة تحت العميل
              </p>
            </div>

            <div className="rounded-2xl bg-white px-4 py-2 text-sm font-bold shadow-sm">
              {pets.length} حيوان
            </div>
          </div>

          {pets.length === 0 ? (
            <div className="rounded-3xl bg-white p-10 text-center shadow-sm">
              <div className="mb-4 text-5xl">🐾</div>

              <h3 className="text-xl font-bold">
                مفيش حيوانات لسه
              </h3>

              <p className="mt-2 text-sm text-slate-500">
                أضف أول حيوان للعميل من النموذج تحت.
              </p>
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {pets.map((pet) => (
                <Link
                  key={pet.id}
                  href={`/pets/${pet.id}`}
                  className="group rounded-3xl border border-slate-100 bg-white p-6 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-3xl transition group-hover:scale-105">
                      {pet.species
                        .toLowerCase()
                        .includes("dog")
                        ? "🐶"
                        : pet.species
                            .toLowerCase()
                            .includes("cat")
                          ? "🐱"
                          : "🐾"}
                    </div>

                    <div className="min-w-0">
                      <h3 className="truncate text-xl font-black">
                        {pet.name}
                      </h3>

                      <p className="mt-1 text-sm text-slate-500">
                        {pet.species}
                        {pet.breed
                          ? ` • ${pet.breed}`
                          : ""}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 border-t border-slate-100 pt-4 text-sm font-bold text-slate-500 transition group-hover:text-slate-900">
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
            <h2 className="text-2xl font-black">
              إضافة حيوان جديد
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              الحيوان هيتسجل مباشرة في قاعدة بيانات العيادة الحالية.
            </p>
          </div>

          <form
            onSubmit={addPet}
            className="grid gap-5 sm:grid-cols-2"
          >
            <div>
              <label className="mb-2 block text-sm font-bold">
                اسم الحيوان *
              </label>

              <input
                value={petName}
                onChange={(e) =>
                  setPetName(e.target.value)
                }
                placeholder="مثال: لولو"
                required
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 outline-none focus:border-blue-500 focus:bg-white"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold">
                النوع *
              </label>

              <select
                value={species}
                onChange={(e) =>
                  setSpecies(e.target.value)
                }
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 outline-none focus:border-blue-500 focus:bg-white"
              >
                <option value="Cat">
                  قط
                </option>

                <option value="Dog">
                  كلب
                </option>

                <option value="Other">
                  أخرى
                </option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold">
                السلالة
              </label>

              <input
                value={breed}
                onChange={(e) =>
                  setBreed(e.target.value)
                }
                placeholder="مثال: Persian"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 outline-none focus:border-blue-500 focus:bg-white"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold">
                الجنس
              </label>

              <select
                value={gender}
                onChange={(e) =>
                  setGender(e.target.value)
                }
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 outline-none focus:border-blue-500 focus:bg-white"
              >
                <option value="">
                  اختر
                </option>

                <option value="Male">
                  ذكر
                </option>

                <option value="Female">
                  أنثى
                </option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold">
                تاريخ الميلاد
              </label>

              <input
                type="date"
                value={birthDate}
                onChange={(e) =>
                  setBirthDate(e.target.value)
                }
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 outline-none focus:border-blue-500 focus:bg-white"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold">
                اللون
              </label>

              <input
                value={color}
                onChange={(e) =>
                  setColor(e.target.value)
                }
                placeholder="مثال: أبيض"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 outline-none focus:border-blue-500 focus:bg-white"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold">
                Microchip
              </label>

              <input
                value={microchip}
                onChange={(e) =>
                  setMicrochip(e.target.value)
                }
                placeholder="رقم الميكروشيب"
                dir="ltr"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-left outline-none focus:border-blue-500 focus:bg-white"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold">
                ملاحظات
              </label>

              <input
                value={petNotes}
                onChange={(e) =>
                  setPetNotes(e.target.value)
                }
                placeholder="ملاحظات عن الحيوان"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 outline-none focus:border-blue-500 focus:bg-white"
              />
            </div>

            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={savingPet}
                className="rounded-2xl bg-slate-900 px-7 py-3.5 font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingPet
                  ? "جاري الإضافة..."
                  : "إضافة الحيوان ✓"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}