"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getClinicDb } from "@/lib/clinic-db";
import { vetraCore } from "@/lib/vetra-core";

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
};

export default function EditPetPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const petId = params.id;

  const [pet, setPet] = useState<Pet | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

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

  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // =========================
  // LOAD PET
  // =========================

  useEffect(() => {
    async function loadPet() {
      if (!petId) {
        setError("رقم الحيوان غير موجود.");
        setLoading(false);
        return;
      }

      try {
        const db = await getClinicDb();

        const {
          data,
          error: loadError,
        } = await db
          .from("pets")
          .select("*")
          .eq("id", petId)
          .single();

        if (loadError || !data) {
          console.error(
            "EDIT PET LOAD ERROR:",
            loadError
          );

          setError(
            loadError?.message ||
              "الحيوان غير موجود."
          );

          setLoading(false);
          return;
        }

        const currentPet = data as Pet;

        setPet(currentPet);

        setPetName(currentPet.name || "");
        setSpecies(currentPet.species || "Cat");
        setBreed(currentPet.breed || "");
        setGender(currentPet.gender || "");
        setBirthDate(currentPet.birth_date || "");
        setColor(currentPet.color || "");
        setMicrochip(currentPet.microchip || "");
        setPetNotes(currentPet.notes || "");
        setPhotoUrl(
          currentPet.photo_url || null
        );
      } catch (err) {
        console.error(
          "EDIT PET PAGE ERROR:",
          err
        );

        setError(
          err instanceof Error
            ? err.message
            : "حصل خطأ أثناء تحميل بيانات الحيوان."
        );
      } finally {
        setLoading(false);
      }
    }

    void loadPet();
  }, [petId]);

  // =========================
  // PHOTO SELECT
  // =========================

  function handlePhotoChange(
    file: File | null
  ) {
    setError("");
    setMessage("");

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError(
        "من فضلك اختار صورة فقط."
      );
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError(
        "حجم الصورة لازم يكون أقل من 5 MB."
      );
      return;
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setPhotoFile(file);

    setPreviewUrl(
      URL.createObjectURL(file)
    );
  }

  // =========================
  // UPLOAD PHOTO
  // =========================

  async function uploadPhoto() {
    if (!photoFile || !petId) {
      return photoUrl;
    }

    setUploading(true);

    try {
      const extension =
        photoFile.name
          .split(".")
          .pop()
          ?.toLowerCase() || "jpg";

      const filePath =
        `${petId}/${Date.now()}.${extension}`;

      const {
        error: uploadError,
      } = await vetraCore.storage
        .from("pet-photos")
        .upload(
          filePath,
          photoFile,
          {
            cacheControl: "3600",
            upsert: false,
            contentType:
              photoFile.type,
          }
        );

      if (uploadError) {
        console.error(
          "PET PHOTO UPLOAD ERROR:",
          uploadError
        );

        throw uploadError;
      }

      const {
        data,
      } = vetraCore.storage
        .from("pet-photos")
        .getPublicUrl(filePath);

      if (!data?.publicUrl) {
        throw new Error(
          "تعذر الحصول على رابط الصورة."
        );
      }

      return data.publicUrl;
    } finally {
      setUploading(false);
    }
  }

  // =========================
  // SAVE PET
  // =========================

  async function savePet(
    e: React.FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    setError("");
    setMessage("");

    if (!pet) {
      setError(
        "بيانات الحيوان غير متاحة."
      );
      return;
    }

    if (!petName.trim()) {
      setError(
        "اسم الحيوان مطلوب."
      );
      return;
    }

    setSaving(true);

    try {
      // Clinic database
      const db = await getClinicDb();

      // Keep current photo unless
      // a new photo was selected.
      let finalPhotoUrl =
        photoUrl;

      // Upload new photo to
      // VETRA Core Storage.
      if (photoFile) {
        finalPhotoUrl =
          await uploadPhoto();
      }

      // Update pet in clinic database.
      const {
        data,
        error: updateError,
      } = await db
        .from("pets")
        .update({
          name: petName.trim(),
          species,
          breed:
            breed.trim() || null,
          gender:
            gender || null,
          birth_date:
            birthDate || null,
          color:
            color.trim() || null,
          microchip:
            microchip.trim() || null,
          notes:
            petNotes.trim() || null,
          photo_url:
            finalPhotoUrl,
        })
        .eq("id", pet.id)
        .select("*")
        .single();

      if (updateError) {
        console.error(
          "PET UPDATE ERROR:",
          updateError
        );

        setError(
          updateError.message
        );

        return;
      }

      setPet(data as Pet);

      setPhotoUrl(
        finalPhotoUrl
      );

      setPhotoFile(null);

      if (previewUrl) {
        URL.revokeObjectURL(
          previewUrl
        );

        setPreviewUrl(null);
      }

      setMessage(
        "تم حفظ بيانات الحيوان بنجاح ✓"
      );
    } catch (err) {
      console.error(
        "SAVE PET ERROR:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "حصل خطأ أثناء حفظ بيانات الحيوان."
      );
    } finally {
      setSaving(false);
    }
  }

  // =========================
  // LOADING
  // =========================

  if (loading) {
    return (
      <main
        dir="rtl"
        className="flex min-h-screen items-center justify-center bg-[#f7f9fc] px-5"
      >
        <div className="rounded-3xl bg-white p-10 text-center shadow-sm">
          <div className="mb-4 text-5xl">
            🐾
          </div>

          <p className="font-semibold text-slate-500">
            جاري تحميل بيانات الحيوان...
          </p>
        </div>
      </main>
    );
  }

  // =========================
  // ERROR / NO PET
  // =========================

  if (!pet) {
    return (
      <main
        dir="rtl"
        className="min-h-screen bg-[#f7f9fc] px-5 py-8"
      >
        <div className="mx-auto max-w-3xl">

          <button
            type="button"
            onClick={() =>
              router.back()
            }
            className="mb-6 text-sm font-semibold text-slate-500"
          >
            ← رجوع
          </button>

          <div className="rounded-3xl bg-white p-10 text-center shadow-sm">

            <div className="mb-4 text-5xl">
              ❌
            </div>

            <h1 className="text-2xl font-black">
              تعذر فتح بيانات الحيوان
            </h1>

            <p className="mt-3 text-sm text-red-500">
              {error}
            </p>

          </div>
        </div>
      </main>
    );
  }

  // =========================
  // DISPLAYED PHOTO
  // =========================

  const displayedPhoto =
    previewUrl || photoUrl;

  // =========================
  // PAGE
  // =========================

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-[#f7f9fc] px-4 py-6 text-slate-900 sm:px-5 sm:py-8"
    >
      <div className="mx-auto max-w-4xl">

        {/* Back */}
        <button
          type="button"
          onClick={() =>
            router.back()
          }
          className="mb-6 text-sm font-semibold text-slate-500 transition hover:text-slate-900"
        >
          ← رجوع لملف الحيوان
        </button>

        <section className="rounded-3xl bg-white p-5 shadow-sm sm:p-7">

          {/* Header */}
          <div className="mb-7">

            <h1 className="text-2xl font-black sm:text-3xl">
              تعديل بيانات الحيوان
            </h1>

            <p className="mt-2 text-sm text-slate-500">
              عدّل البيانات أو أضف صورة للحيوان.
            </p>

          </div>

          {/* Error */}
          {error && (
            <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
              {error}
            </div>
          )}

          {/* Success */}
          {message && (
            <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
              {message}
            </div>
          )}

          <form
            onSubmit={savePet}
            className="space-y-7"
          >

            {/* =========================
                PHOTO
            ========================= */}

            <div className="rounded-3xl bg-slate-50 p-5">

              <label className="mb-4 block text-sm font-black">
                صورة الحيوان
              </label>

              <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">

                {/* Preview */}
                <div className="flex h-36 w-36 shrink-0 items-center justify-center overflow-hidden rounded-3xl bg-white text-6xl shadow-sm">

                  {displayedPhoto ? (
                    <img
                      src={displayedPhoto}
                      alt={
                        petName ||
                        "صورة الحيوان"
                      }
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span>
                      {species === "Dog"
                        ? "🐶"
                        : species === "Cat"
                          ? "🐱"
                          : "🐾"}
                    </span>
                  )}

                </div>

                {/* File input */}
                <div className="w-full">

                  <input
                    id="pet-photo"
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) =>
                      handlePhotoChange(
                        e.target.files?.[0] ||
                          null
                      )
                    }
                    className="block w-full rounded-2xl border border-slate-200 bg-white p-3 text-sm"
                  />

                  <p className="mt-2 text-xs leading-6 text-slate-500">
                    JPG أو PNG أو WebP — الحد الأقصى 5 MB.
                    على الموبايل تقدر تختار صورة من المعرض أو
                    تفتح الكاميرا.
                  </p>

                </div>

              </div>
            </div>

            {/* =========================
                FIELDS
            ========================= */}

            <div className="grid gap-5 sm:grid-cols-2">

              {/* Name */}
              <div>

                <label className="mb-2 block text-sm font-bold">
                  اسم الحيوان *
                </label>

                <input
                  value={petName}
                  onChange={(e) =>
                    setPetName(
                      e.target.value
                    )
                  }
                  required
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 outline-none focus:border-blue-500 focus:bg-white"
                />

              </div>

              {/* Species */}
              <div>

                <label className="mb-2 block text-sm font-bold">
                  النوع *
                </label>

                <select
                  value={species}
                  onChange={(e) =>
                    setSpecies(
                      e.target.value
                    )
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

              {/* Breed */}
              <div>

                <label className="mb-2 block text-sm font-bold">
                  السلالة
                </label>

                <input
                  value={breed}
                  onChange={(e) =>
                    setBreed(
                      e.target.value
                    )
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 outline-none focus:border-blue-500 focus:bg-white"
                />

              </div>

              {/* Gender */}
              <div>

                <label className="mb-2 block text-sm font-bold">
                  الجنس
                </label>

                <select
                  value={gender}
                  onChange={(e) =>
                    setGender(
                      e.target.value
                    )
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

              {/* Birth date */}
              <div>

                <label className="mb-2 block text-sm font-bold">
                  تاريخ الميلاد
                </label>

                <input
                  type="date"
                  value={birthDate}
                  onChange={(e) =>
                    setBirthDate(
                      e.target.value
                    )
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 outline-none focus:border-blue-500 focus:bg-white"
                />

              </div>

              {/* Color */}
              <div>

                <label className="mb-2 block text-sm font-bold">
                  اللون
                </label>

                <input
                  value={color}
                  onChange={(e) =>
                    setColor(
                      e.target.value
                    )
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 outline-none focus:border-blue-500 focus:bg-white"
                />

              </div>

              {/* Microchip */}
              <div>

                <label className="mb-2 block text-sm font-bold">
                  Microchip
                </label>

                <input
                  value={microchip}
                  onChange={(e) =>
                    setMicrochip(
                      e.target.value
                    )
                  }
                  dir="ltr"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-left outline-none focus:border-blue-500 focus:bg-white"
                />

              </div>

              {/* Notes */}
              <div>

                <label className="mb-2 block text-sm font-bold">
                  ملاحظات
                </label>

                <input
                  value={petNotes}
                  onChange={(e) =>
                    setPetNotes(
                      e.target.value
                    )
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 outline-none focus:border-blue-500 focus:bg-white"
                />

              </div>

            </div>

            {/* =========================
                BUTTONS
            ========================= */}

            <div className="flex flex-col gap-3 sm:flex-row">

              <button
                type="submit"
                disabled={
                  saving ||
                  uploading
                }
                className="rounded-2xl bg-slate-900 px-7 py-3.5 font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >

                {uploading
                  ? "جاري رفع الصورة..."
                  : saving
                    ? "جاري الحفظ..."
                    : "حفظ التعديلات ✓"}

              </button>

              <button
                type="button"
                onClick={() =>
                  router.back()
                }
                className="rounded-2xl border border-slate-200 bg-white px-7 py-3.5 font-bold text-slate-700"
              >
                إلغاء
              </button>

            </div>

          </form>

        </section>

      </div>
    </main>
  );
}