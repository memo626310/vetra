"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
  photo_url: string | null;
  created_at?: string;
};

type Client = {
  id: string;
  name: string;
  phone: string | null;
};

type PetWithClient = Pet & {
  client: Client | null;
  visitCount: number;
  lastVisit: string | null;
};

type SpeciesFilter = "all" | "cat" | "dog" | "other";
type SortOption = "newest" | "name" | "lastVisit";

export default function PetsPage() {
  const [pets, setPets] = useState<PetWithClient[]>([]);
  const [search, setSearch] = useState("");
  const [speciesFilter, setSpeciesFilter] =
    useState<SpeciesFilter>("all");
  const [sortBy, setSortBy] =
    useState<SortOption>("newest");
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
          .order("created_at", {
            ascending: false,
          });

        if (error) {
          console.error("LOAD PETS ERROR:", error);
          return;
        }

        const basePets = (data || []) as PetWithClient[];

        if (basePets.length === 0) {
          setPets([]);
          return;
        }

        const petIds = basePets.map(
          (pet) => pet.id
        );

        const {
          data: visitsData,
          error: visitsError,
        } = await db
          .from("visits")
          .select("pet_id, visit_date")
          .in("pet_id", petIds)
          .order("visit_date", {
            ascending: false,
          });

        if (visitsError) {
          console.error(
            "LOAD PET VISITS ERROR:",
            visitsError
          );
        }

        const visitMap = new Map<
          string,
          {
            count: number;
            lastVisit: string | null;
          }
        >();

        for (const visit of visitsData || []) {
          const current = visitMap.get(
            visit.pet_id
          );

          visitMap.set(visit.pet_id, {
            count:
              (current?.count || 0) + 1,
            lastVisit:
              current?.lastVisit ||
              visit.visit_date,
          });
        }

        const enrichedPets =
          basePets.map((pet) => {
            const stats = visitMap.get(
              pet.id
            );

            return {
              ...pet,
              visitCount:
                stats?.count || 0,
              lastVisit:
                stats?.lastVisit || null,
            };
          });

        setPets(enrichedPets);
      } catch (error) {
        console.error(
          "LOAD PETS ERROR:",
          error
        );
      } finally {
        setLoading(false);
      }
    }

    void loadPets();
  }, []);

  function normalizeSpecies(
    species: string
  ) {
    return species
      .trim()
      .toLowerCase();
  }

  function isSpecies(
    pet: PetWithClient,
    filter: SpeciesFilter
  ) {
    if (filter === "all") return true;

    const value = normalizeSpecies(
      pet.species
    );

    if (filter === "cat") {
      return (
        value === "cat" ||
        value === "قط"
      );
    }

    if (filter === "dog") {
      return (
        value === "dog" ||
        value === "كلب"
      );
    }

    return ![
      "cat",
      "قط",
      "dog",
      "كلب",
    ].includes(value);
  }

  const filteredPets = useMemo(() => {
    const text = search
      .trim()
      .toLowerCase();

    const result = pets.filter((pet) => {
      const matchesSearch =
        !text ||
        pet.name
          .toLowerCase()
          .includes(text) ||
        pet.species
          .toLowerCase()
          .includes(text) ||
        (pet.breed || "")
          .toLowerCase()
          .includes(text) ||
        (pet.client?.name || "")
          .toLowerCase()
          .includes(text) ||
        (pet.client?.phone || "")
          .toLowerCase()
          .includes(text) ||
        (pet.microchip || "")
          .toLowerCase()
          .includes(text);

      return (
        matchesSearch &&
        isSpecies(
          pet,
          speciesFilter
        )
      );
    });

    return [...result].sort(
      (a, b) => {
        if (sortBy === "name") {
          return a.name.localeCompare(
            b.name,
            "ar"
          );
        }

        if (
          sortBy === "lastVisit"
        ) {
          if (
            !a.lastVisit &&
            !b.lastVisit
          )
            return 0;

          if (!a.lastVisit) return 1;
          if (!b.lastVisit) return -1;

          return (
            new Date(
              b.lastVisit
            ).getTime() -
            new Date(
              a.lastVisit
            ).getTime()
          );
        }

        const aDate =
          a.created_at
            ? new Date(
                a.created_at
              ).getTime()
            : 0;

        const bDate =
          b.created_at
            ? new Date(
                b.created_at
              ).getTime()
            : 0;

        return bDate - aDate;
      }
    );
  }, [
    pets,
    search,
    speciesFilter,
    sortBy,
  ]);

  const stats = useMemo(() => {
    const cats = pets.filter(
      (pet) =>
        isSpecies(pet, "cat")
    ).length;

    const dogs = pets.filter(
      (pet) =>
        isSpecies(pet, "dog")
    ).length;

    return {
      total: pets.length,
      cats,
      dogs,
      other:
        pets.length -
        cats -
        dogs,
    };
  }, [pets]);

  function getSpeciesIcon(
    species: string
  ) {
    const value =
      normalizeSpecies(species);

    if (
      value === "cat" ||
      value === "قط"
    )
      return "🐱";

    if (
      value === "dog" ||
      value === "كلب"
    )
      return "🐶";

    return "🐾";
  }

  function getSpeciesName(
    species: string
  ) {
    const value =
      normalizeSpecies(species);

    if (value === "cat")
      return "قط";

    if (value === "dog")
      return "كلب";

    if (value === "other")
      return "أخرى";

    return species;
  }

  function formatLastVisit(
    date: string | null
  ) {
    if (!date)
      return "لا توجد زيارات";

    return new Date(
      date
    ).toLocaleDateString(
      "ar-EG",
      {
        year: "numeric",
        month: "short",
        day: "numeric",
      }
    );
  }

  return (
    <main
      dir="rtl"
      className="min-h-screen overflow-x-hidden bg-[#f7f9fc] px-3 py-5 text-slate-900 sm:px-5 sm:py-8"
    >
      <div className="mx-auto max-w-6xl">

        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <Link
            href="/"
            className="mb-3 inline-block rounded-xl px-1 py-2 text-sm text-slate-500 transition hover:text-slate-900"
          >
            ← الرئيسية
          </Link>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold sm:text-3xl">
                الحيوانات 🐾
              </h1>

              <p className="mt-2 text-sm text-slate-500 sm:text-base">
                ملفات الحيوانات المسجلة في العيادة
              </p>
            </div>

            <div className="w-fit rounded-2xl bg-white px-5 py-3 text-sm font-semibold shadow-sm">
              {pets.length} حيوان
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="mb-5 grid grid-cols-2 gap-3 sm:mb-6 sm:grid-cols-4">
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-400">
              كل الحيوانات
            </p>

            <p className="mt-1 text-2xl font-bold">
              {stats.total}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-400">
              قطط 🐱
            </p>

            <p className="mt-1 text-2xl font-bold">
              {stats.cats}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-400">
              كلاب 🐶
            </p>

            <p className="mt-1 text-2xl font-bold">
              {stats.dogs}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-400">
              أخرى 🐾
            </p>

            <p className="mt-1 text-2xl font-bold">
              {stats.other}
            </p>
          </div>
        </div>

        {/* Search + Filters */}
        <div className="mb-5 rounded-3xl bg-white p-3 shadow-sm sm:mb-6 sm:p-4">
          <input
            type="text"
            placeholder="ابحث باسم الحيوان أو المالك أو التليفون أو السلالة أو Microchip..."
            value={search}
            onChange={(e) =>
              setSearch(e.target.value)
            }
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm outline-none transition focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-100 sm:px-5"
          />

          <div className="mt-4 flex flex-col gap-3">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {(
                [
                  ["all", "الكل"],
                  ["cat", "🐱 قطط"],
                  ["dog", "🐶 كلاب"],
                  ["other", "🐾 أخرى"],
                ] as const
              ).map(
                ([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() =>
                      setSpeciesFilter(
                        value
                      )
                    }
                    className={`min-h-11 shrink-0 rounded-xl px-4 py-2 text-sm font-semibold transition ${
                      speciesFilter ===
                      value
                        ? "bg-slate-900 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {label}
                  </button>
                )
              )}
            </div>

            <select
              value={sortBy}
              onChange={(e) =>
                setSortBy(
                  e.target.value as SortOption
                )
              }
              className="min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold outline-none sm:w-auto sm:self-end"
            >
              <option value="newest">
                الأحدث إضافة
              </option>

              <option value="name">
                الاسم أبجديًا
              </option>

              <option value="lastVisit">
                آخر زيارة
              </option>
            </select>
          </div>

          <div className="mt-3 text-xs text-slate-400">
            عرض {filteredPets.length} من{" "}
            {pets.length} حيوان
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="rounded-3xl bg-white p-10 text-center text-slate-500 shadow-sm">
            جاري تحميل الحيوانات...
          </div>
        )}

        {/* Empty */}
        {!loading &&
          filteredPets.length ===
            0 && (
            <div className="rounded-3xl bg-white p-10 text-center shadow-sm sm:p-12">
              <div className="mb-4 text-6xl">
                🐾
              </div>

              <h2 className="text-xl font-bold">
                {search ||
                speciesFilter !==
                  "all"
                  ? "مفيش نتائج"
                  : "مفيش حيوانات مسجلة لسه"}
              </h2>

              <p className="mt-2 text-sm text-slate-500">
                {search ||
                speciesFilter !==
                  "all"
                  ? "جرب تغيير البحث أو الفلتر."
                  : "الحيوانات هتظهر هنا بمجرد إضافتها للعملاء."}
              </p>
            </div>
          )}

        {/* Pets */}
        {!loading &&
          filteredPets.length >
            0 && (
            <div className="grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
              {filteredPets.map(
                (pet) => (
                  <div
                    key={pet.id}
                    className="group overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl"
                  >

                    {/* Photo */}
                    <Link
                      href={`/pets/${pet.id}`}
                      className="block"
                    >
                      <div className="relative h-48 w-full overflow-hidden bg-slate-100 sm:h-52">
                        {pet.photo_url ? (
                          <img
                            src={
                              pet.photo_url
                            }
                            alt={
                              pet.name
                            }
                            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-7xl">
                            {getSpeciesIcon(
                              pet.species
                            )}
                          </div>
                        )}

                        <div className="absolute right-3 top-3 rounded-full bg-white/90 px-3 py-1.5 text-xs font-bold shadow-sm backdrop-blur">
                          {getSpeciesName(
                            pet.species
                          )}
                        </div>
                      </div>
                    </Link>

                    <div className="p-5 sm:p-6">

                      {/* Pet Header */}
                      <div className="mb-5 flex items-center gap-3">
                        <div className="min-w-0">
                          <h2 className="truncate text-xl font-bold">
                            {pet.name}
                          </h2>

                          <p className="mt-1 truncate text-sm text-slate-500">
                            {pet.breed ||
                              "السلالة غير محددة"}
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

                            <div className="min-w-0">
                              <p className="text-xs text-slate-400">
                                المالك
                              </p>

                              <p className="truncate font-semibold text-slate-700">
                                {
                                  pet
                                    .client
                                    .name
                                }
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
                                {pet.gender ===
                                "Male"
                                  ? "ذكر"
                                  : pet.gender ===
                                    "Female"
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
                                {
                                  pet.color
                                }
                              </p>
                            </div>
                          </div>
                        )}

                        {pet.microchip && (
                          <div className="flex items-center gap-3">
                            <span className="text-lg">
                              🔖
                            </span>

                            <div className="min-w-0">
                              <p className="text-xs text-slate-400">
                                Microchip
                              </p>

                              <p
                                dir="ltr"
                                className="truncate font-semibold text-slate-700"
                              >
                                {
                                  pet.microchip
                                }
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Visit stats */}
                        <div className="grid grid-cols-2 gap-3 pt-1">
                          <div className="rounded-2xl bg-slate-50 p-3">
                            <p className="text-xs text-slate-400">
                              الزيارات
                            </p>

                            <p className="mt-1 font-bold">
                              {
                                pet.visitCount
                              }{" "}
                              زيارة
                            </p>
                          </div>

                          <div className="rounded-2xl bg-slate-50 p-3">
                            <p className="text-xs text-slate-400">
                              آخر زيارة
                            </p>

                            <p className="mt-1 truncate font-bold">
                              {formatLastVisit(
                                pet.lastVisit
                              )}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="mt-5 grid grid-cols-2 gap-2 border-t border-slate-100 pt-4">
                        <Link
                          href={`/pets/${pet.id}`}
                          className="flex min-h-12 items-center justify-center rounded-xl bg-slate-100 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
                        >
                          فتح الملف
                        </Link>

                        <Link
                          href={`/visits/new?pet=${pet.id}`}
                          className="flex min-h-12 items-center justify-center rounded-xl bg-slate-900 px-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:shadow-md"
                        >
                          🩺 زيارة جديدة
                        </Link>
                      </div>

                    </div>
                  </div>
                )
              )}
            </div>
          )}
      </div>
    </main>
  );
}