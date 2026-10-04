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
};

type Client = {
  id: string;
  name: string;
  phone: string | null;
};

type PetWithClient = Pet & {
  client: Client | null;
};

export default function PetsPage() {
  const [pets, setPets] = useState<PetWithClient[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadPets() {
      setLoading(true);

      try {
        const db = await getClinicDb();

        const { data, error } = await db
          .from("pets")
          .select(`
            *,
            client:clients (
              id,
              name,
              phone
            )
          `)
          .order("created_at", { ascending: false });

        if (error) {
          console.error("LOAD PETS ERROR:", error);
          return;
        }

        if (data) {
          setPets(data as PetWithClient[]);
        }
      } catch (error) {
        console.error("LOAD PETS ERROR:", error);
      } finally {
        setLoading(false);
      }
    }

    loadPets();
  }, []);

  const filteredPets = pets.filter((pet) => {
    const text = search.toLowerCase();

    return (
      pet.name.toLowerCase().includes(text) ||
      pet.species.toLowerCase().includes(text) ||
      (pet.breed || "").toLowerCase().includes(text) ||
      (pet.client?.name || "").toLowerCase().includes(text) ||
      (pet.microchip || "").toLowerCase().includes(text)
    );
  });

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

    if (value === "cat") {
      return "قط";
    }

    if (value === "dog") {
      return "كلب";
    }

    if (value === "other") {
      return "أخرى";
    }

    return species;
  }

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-[#f7f9fc] px-5 py-8 text-slate-900"
    >
      <div className="mx-auto max-w-6xl">

        {/* Header */}
        <div className="mb-8">
          <Link
            href="/"
            className="mb-3 inline-block text-sm text-slate-500 transition hover:text-slate-900"
          >
            ← الرئيسية
          </Link>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold">
                الحيوانات 🐾
              </h1>

              <p className="mt-2 text-slate-500">
                ملفات الحيوانات المسجلة في العيادة
              </p>
            </div>

            <div className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold shadow-sm">
              {pets.length} حيوان
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="mb-6">
          <input
            type="text"
            placeholder="ابحث باسم الحيوان أو المالك أو السلالة..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-4 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
          />
        </div>

        {/* Loading */}
        {loading && (
          <div className="rounded-3xl bg-white p-10 text-center text-slate-500 shadow-sm">
            جاري تحميل الحيوانات...
          </div>
        )}

        {/* Empty */}
        {!loading && filteredPets.length === 0 && (
          <div className="rounded-3xl bg-white p-12 text-center shadow-sm">

            <div className="mb-4 text-6xl">
              🐾
            </div>

            <h2 className="text-xl font-bold">
              {search
                ? "مفيش نتائج"
                : "مفيش حيوانات مسجلة لسه"}
            </h2>

            <p className="mt-2 text-slate-500">
              {search
                ? "جرب البحث باسم مختلف."
                : "الحيوانات هتظهر هنا بمجرد إضافتها للعملاء."}
            </p>

          </div>
        )}

        {/* Pets */}
        {!loading && filteredPets.length > 0 && (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">

            {filteredPets.map((pet) => (
              <Link
                key={pet.id}
                href={`/pets/${pet.id}`}
                className="group rounded-3xl border border-slate-100 bg-white p-6 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl"
              >

                {/* Pet Header */}
                <div className="mb-5 flex items-center gap-4">

                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-4xl transition duration-300 group-hover:scale-105">
                    {getSpeciesIcon(pet.species)}
                  </div>

                  <div className="min-w-0">

                    <h2 className="truncate text-xl font-bold">
                      {pet.name}
                    </h2>

                    <p className="mt-1 text-sm text-slate-500">
                      {getSpeciesName(pet.species)}
                      {pet.breed
                        ? ` • ${pet.breed}`
                        : ""}
                    </p>

                  </div>

                </div>

                {/* Information */}
                <div className="space-y-3 text-sm">

                  {pet.client && (
                    <div className="flex items-center gap-3">
                      <span className="text-lg">
                        👤
                      </span>

                      <div>
                        <p className="text-xs text-slate-400">
                          المالك
                        </p>

                        <p className="font-semibold text-slate-700">
                          {pet.client.name}
                        </p>
                      </div>
                    </div>
                  )}

                  {pet.gender && (
                    <div className="flex items-center gap-3">
                      <span className="text-lg">
                        ⚥
                      </span>

                      <div>
                        <p className="text-xs text-slate-400">
                          النوع
                        </p>

                        <p className="font-semibold text-slate-700">
                          {pet.gender === "Male"
                            ? "ذكر"
                            : pet.gender === "Female"
                            ? "أنثى"
                            : pet.gender}
                        </p>
                      </div>
                    </div>
                  )}

                  {pet.color && (
                    <div className="flex items-center gap-3">
                      <span className="text-lg">
                        🎨
                      </span>

                      <div>
                        <p className="text-xs text-slate-400">
                          اللون
                        </p>

                        <p className="font-semibold text-slate-700">
                          {pet.color}
                        </p>
                      </div>
                    </div>
                  )}

                  {pet.microchip && (
                    <div className="flex items-center gap-3">
                      <span className="text-lg">
                        🔖
                      </span>

                      <div>
                        <p className="text-xs text-slate-400">
                          Microchip
                        </p>

                        <p
                          dir="ltr"
                          className="font-semibold text-slate-700"
                        >
                          {pet.microchip}
                        </p>
                      </div>
                    </div>
                  )}

                </div>

                {/* Footer */}
                <div className="mt-6 border-t border-slate-100 pt-4 text-sm font-semibold text-slate-500 transition group-hover:text-slate-900">
                  فتح الملف الطبي ←
                </div>

              </Link>
            ))}

          </div>
        )}

      </div>
    </main>
  );
}