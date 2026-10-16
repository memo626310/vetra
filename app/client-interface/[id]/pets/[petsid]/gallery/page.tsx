"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { getClientPortalDb } from "@/lib/client-portal-db";
import { vetraCore } from "@/lib/vetra-core";

type OwnerSession = { id: string | null; code: string | null; phone: string | null };
type Pet = { id: string; name: string; species: string };
type GalleryPhoto = { name: string; path: string; url: string; createdAt: string };
type Lang = "ar" | "en";

const BUCKET = "pet-photos";
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const PAGE_SIZE = 1000;
const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function readOwnerSession(): OwnerSession {
  const read = (storage: Storage): OwnerSession => ({
    id: storage.getItem("vetra-client-id"),
    code: storage.getItem("vetra-client-code"),
    phone: storage.getItem("vetra-client-phone"),
  });
  const persistent = read(window.localStorage);
  if (persistent.id && persistent.code && persistent.phone) return persistent;
  const temporary = read(window.sessionStorage);
  if (temporary.id && temporary.code && temporary.phone) return temporary;
  return { id: null, code: null, phone: null };
}

async function listPhotos(petId: string): Promise<GalleryPhoto[]> {
  const storage = vetraCore.storage.from(BUCKET);
  const objects: { name: string; created_at: string | null; id: string | null }[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await storage.list(petId, {
      limit: PAGE_SIZE,
      offset,
      sortBy: { column: "name", order: "desc" },
    });
    if (error) throw error;

    const page = (data || []).filter((item) =>
      Boolean(item.id && item.name && Object.keys(EXTENSIONS).some((mime) =>
        item.name.toLowerCase().endsWith(`.${EXTENSIONS[mime]}`),
      )),
    );
    objects.push(...page.map((item) => ({
      name: item.name,
      created_at: item.created_at || null,
      id: item.id || null,
    })));

    if ((data || []).length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return objects.map((item) => {
    const path = `${petId}/${item.name}`;
    const { data } = storage.getPublicUrl(path);
    return {
      name: item.name,
      path,
      url: data.publicUrl,
      createdAt: item.created_at || "",
    };
  });
}

export default function PetGalleryPage() {
  const params = useParams<{ id: string; petsid: string }>();
  const router = useRouter();
  const clientId = params.id;
  const petId = params.petsid;
  const fileInput = useRef<HTMLInputElement>(null);
  const [lang, setLang] = useState<Lang>("ar");
  const [pet, setPet] = useState<Pet | null>(null);
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [selectedPhoto, setSelectedPhoto] = useState<GalleryPhoto | null>(null);

  useEffect(() => {
    const savedLang = window.localStorage.getItem("vetra-language");
    if (savedLang === "ar" || savedLang === "en") setLang(savedLang);
  }, []);

  const loadPhotos = useCallback(async (ownerPetId: string) => {
    setPhotos(await listPhotos(ownerPetId));
  }, []);

  useEffect(() => {
    if (!clientId || !petId) return;
    let cancelled = false;

    async function loadGallery() {
      setLoading(true);
      setError("");
      const owner = readOwnerSession();
      if (!owner.id || owner.id !== clientId || !owner.code || !owner.phone) {
        router.replace("/client-interface/login");
        return;
      }

      try {
        const db = await getClientPortalDb(owner.code, owner.phone);
        const { data: ownedPet, error: petError } = await db
          .from("pets")
          .select("id,name,species")
          .eq("id", petId)
          .eq("client_id", clientId)
          .maybeSingle();
        if (petError) throw petError;
        if (!ownedPet) throw new Error("Pet not found for this owner.");

        const galleryPhotos = await listPhotos(ownedPet.id);
        if (cancelled) return;
        setPet(ownedPet as Pet);
        setPhotos(galleryPhotos);
      } catch (loadError) {
        if (cancelled) return;
        console.error("PET GALLERY LOAD ERROR:", loadError);
        setError(lang === "ar" ? "تعذر تحميل معرض الصور." : "Could not load the photo gallery.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadGallery();
    return () => {
      cancelled = true;
    };
  }, [clientId, lang, loadPhotos, petId, router]);

  async function uploadPhotos(fileList: FileList | null) {
    if (!fileList || !pet || uploading) return;
    setError("");
    setMessage("");

    const files = Array.from(fileList);
    const accepted = files.filter((file) => Boolean(EXTENSIONS[file.type]) && file.size <= MAX_FILE_SIZE);
    const rejected = files.length - accepted.length;
    if (!accepted.length) {
      setError(lang === "ar"
        ? "اختار صور JPG أو PNG أو WebP، وحجم كل صورة 5 ميجابايت أو أقل."
        : "Choose JPG, PNG, or WebP images up to 5 MB each.");
      return;
    }

    setUploading(true);
    let uploadedCount = 0;
    try {
      for (const file of accepted) {
        const extension = EXTENSIONS[file.type];
        const randomSuffix = Math.random().toString(36).slice(2, 9);
        const path = `${pet.id}/${Date.now()}-${randomSuffix}.${extension}`;
        const { error: uploadError } = await vetraCore.storage.from(BUCKET).upload(path, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type,
        });
        if (uploadError) throw uploadError;
        uploadedCount += 1;
      }

      await loadPhotos(pet.id);
      setMessage(lang === "ar"
        ? `تمت إضافة ${uploadedCount} ${uploadedCount === 1 ? "صورة" : "صور"} إلى معرض ${pet.name}.`
        : `${uploadedCount} ${uploadedCount === 1 ? "photo was" : "photos were"} added to ${pet.name}'s gallery.`);
      if (rejected) {
        setError(lang === "ar"
          ? `تم تجاهل ${rejected} ملف. الصيغ المسموحة JPG وPNG وWebP، بحد 5 ميجابايت للصورة.`
          : `${rejected} file${rejected === 1 ? " was" : "s were"} skipped. Use JPG, PNG, or WebP up to 5 MB each.`);
      }
    } catch (uploadError) {
      console.error("PET GALLERY UPLOAD ERROR:", uploadError);
      setError(lang === "ar"
        ? `تعذر رفع الصور${uploadedCount ? ` بعد إضافة ${uploadedCount} صورة` : ""}. راجع صلاحيات مخزن الصور. `
        : `Could not finish uploading${uploadedCount ? ` after adding ${uploadedCount} photo${uploadedCount === 1 ? "" : "s"}` : ""}. Check photo storage permissions.`);
      if (uploadedCount) await loadPhotos(pet.id).catch(() => undefined);
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  const copy = lang === "ar" ? {
    back: "العودة لملف الحيوان",
    title: "معرض الصور",
    subtitle: (name: string) => `لحظات ${name} المفضلة، كلها في مكان واحد.`,
    add: "إضافة صور",
    adding: "جاري رفع الصور...",
    count: "صورة",
    emptyTitle: "ابدأوا ألبوم الذكريات",
    emptyText: "ارفع صورًا متعددة لحيوانك الأليف. مفيش حد لعدد الصور؛ كل صورة حتى 5 ميجابايت.",
    rules: "JPG أو PNG أو WebP — حتى 5 ميجابايت للصورة",
    loading: "جاري تحميل المعرض...",
    close: "إغلاق الصورة",
  } : {
    back: "Back to pet profile",
    title: "Photo gallery",
    subtitle: (name: string) => `${name}'s favorite moments, all in one place.`,
    add: "Add photos",
    adding: "Uploading photos...",
    count: "photos",
    emptyTitle: "Start your memory album",
    emptyText: "Upload as many photos as you like. There is no photo count limit; each image can be up to 5 MB.",
    rules: "JPG, PNG, or WebP — up to 5 MB per photo",
    loading: "Loading gallery...",
    close: "Close image",
  };

  if (loading) return <main dir={lang === "ar" ? "rtl" : "ltr"} className="flex min-h-screen items-center justify-center bg-[#06101a] text-white"><p className="text-sm font-bold text-slate-400">{copy.loading}</p></main>;

  return (
    <main data-vetra-page-theme="client" data-vetra-mode="dark" dir={lang === "ar" ? "rtl" : "ltr"} className="min-h-screen overflow-x-hidden bg-[#06101a] pb-12 text-white">
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="absolute -left-24 top-1/3 h-96 w-96 rounded-full bg-violet-500/10 blur-3xl" />
      </div>
      <div className="relative z-10 mx-auto max-w-7xl px-4 pb-12 pt-5 sm:px-6 lg:px-8">
        <header className="mb-8 flex items-center justify-between gap-3">
          <Link href={`/client-interface/${clientId}/pets/${petId}`} className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-white/10 bg-white/[.05] px-4 text-sm font-bold text-slate-200 transition hover:bg-white/10">
            <span aria-hidden="true">{lang === "ar" ? "→" : "←"}</span>{copy.back}
          </Link>
          <Link href={`/client-interface/${clientId}`} aria-label="VETRA home" className="rounded-2xl bg-[#10251f] px-3 py-2 text-sm font-black tracking-[.2em] text-white">VETRA</Link>
        </header>

        {error && <div role="alert" className="mb-5 rounded-2xl border border-rose-300/20 bg-rose-300/[.07] px-4 py-3 text-sm font-semibold text-rose-200">{error}</div>}
        {message && <div role="status" className="mb-5 rounded-2xl border border-emerald-300/20 bg-emerald-300/[.07] px-4 py-3 text-sm font-semibold text-emerald-200">{message}</div>}

        <section className="rounded-[2rem] border border-white/[.08] bg-gradient-to-br from-white/[.07] to-white/[.025] p-5 shadow-2xl sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[.24em] text-cyan-300">VETRA · {pet?.name}</p>
              <h1 className="mt-2 text-3xl font-black sm:text-4xl">{copy.title}</h1>
              <p className="mt-2 max-w-xl text-sm leading-7 text-slate-300">{copy.subtitle(pet?.name || "")}</p>
              <p className="mt-2 text-xs font-semibold text-slate-400">{copy.rules}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-white/10 bg-white/[.04] px-3 py-2 text-xs font-bold text-slate-300">{photos.length} {copy.count}</span>
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="sr-only"
                disabled={uploading}
                onChange={(event) => void uploadPhotos(event.currentTarget.files)}
              />
              <button type="button" onClick={() => fileInput.current?.click()} disabled={uploading} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-300 to-emerald-300 px-5 py-3 text-sm font-black text-slate-950 shadow-lg shadow-cyan-500/10 transition hover:brightness-105 disabled:cursor-wait disabled:opacity-60">
                <span aria-hidden="true" className="text-lg">＋</span>{uploading ? copy.adding : copy.add}
              </button>
            </div>
          </div>
        </section>

        {photos.length ? (
          <section aria-label={copy.title} className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
            {photos.map((photo) => (
              <button key={photo.path} type="button" onClick={() => setSelectedPhoto(photo)} className="group relative aspect-square overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/[.04] text-start shadow-xl transition hover:-translate-y-0.5 hover:border-cyan-300/40 focus:outline-none focus:ring-2 focus:ring-cyan-300">
                <Image src={photo.url} alt={`${pet?.name || "Pet"} photo`} fill unoptimized sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw" className="object-cover transition duration-500 group-hover:scale-[1.04]" />
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent px-3 pb-3 pt-10 text-[10px] font-semibold text-white/90">
                  {photo.createdAt ? new Intl.DateTimeFormat(lang === "ar" ? "ar-EG" : "en-US", { dateStyle: "medium" }).format(new Date(photo.createdAt)) : ""}
                </span>
              </button>
            ))}
          </section>
        ) : (
          <section className="mt-6 flex min-h-72 flex-col items-center justify-center rounded-[2rem] border border-dashed border-white/15 bg-white/[.025] px-6 py-12 text-center">
            <span aria-hidden="true" className="flex h-16 w-16 items-center justify-center rounded-3xl bg-cyan-300/10 text-3xl text-cyan-200">▧</span>
            <h2 className="mt-5 text-xl font-black">{copy.emptyTitle}</h2>
            <p className="mt-2 max-w-md text-sm leading-7 text-slate-400">{copy.emptyText}</p>
            <button type="button" onClick={() => fileInput.current?.click()} disabled={uploading} className="mt-5 rounded-2xl border border-cyan-300/25 bg-cyan-300/10 px-5 py-3 text-sm font-black text-cyan-100 transition hover:bg-cyan-300/15 disabled:opacity-60">{uploading ? copy.adding : copy.add}</button>
          </section>
        )}
      </div>

      {selectedPhoto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={copy.title} onClick={() => setSelectedPhoto(null)}>
          <button type="button" autoFocus onClick={() => setSelectedPhoto(null)} aria-label={copy.close} className="absolute end-4 top-4 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-black/40 text-xl text-white">×</button>
          <div className="relative h-[82vh] w-full max-w-5xl" onClick={(event) => event.stopPropagation()}>
            <Image src={selectedPhoto.url} alt={`${pet?.name || "Pet"} photo`} fill unoptimized sizes="100vw" className="object-contain" />
          </div>
        </div>
      )}
    </main>
  );
}
