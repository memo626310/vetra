"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { vetraCore } from "@/lib/vetra-core";

export default function NewMatchPetPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [token, setToken] = useState("");
  const [form, setForm] = useState({ name: "", species: "dog", breed: "", color: "", birth_date: "", gender: "unknown", city: "", description: "" });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { void vetraCore.auth.getSession().then(({ data }) => setToken(data.session?.access_token || "")); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      if (!token) throw new Error("سجّل الدخول بحساب VETRA Tinder موثق لإضافة حيوان.");
      let photo_path: string | null = null;
      if (file) {
        const formData = new FormData(); formData.set("file", file);
        const upload = await fetch("/api/match/photo", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: formData });
        const uploaded = await upload.json();
        if (!upload.ok) throw new Error(uploaded.error || "تعذر رفع الصورة.");
        photo_path = uploaded.photo_path;
      }
      const response = await fetch("/api/match/profile", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ action: "add-pet", ...form, photo_path }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "تعذر حفظ الحيوان.");
      router.replace(`/client-interface/${encodeURIComponent(id)}/match`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر حفظ الحيوان."); setBusy(false); }
  }

  const field = (key: keyof typeof form, label: string, required = false) => <label className="block"><span className="mb-1 block text-xs font-bold text-[#657585]">{label}</span><input required={required} value={form[key]} onChange={(e) => setForm((old) => ({ ...old, [key]: e.target.value }))} className="min-h-11 w-full rounded-xl border border-[#E7EAE6] bg-[#FAF8F4] px-3 text-sm outline-none focus:border-[#138780]"/></label>;

  return <main dir="rtl" className="min-h-screen bg-[#FAF8F4] p-4 font-[Tahoma,Arial,sans-serif] text-[#17324D] sm:p-8"><div className="mx-auto max-w-3xl"><Link href={`/client-interface/${id}/match`} className="text-sm font-bold text-[#138780]">← العودة إلى VETRA Tinder</Link><section className="mt-4 rounded-3xl border border-[#E7EAE6] bg-white p-6 shadow-sm sm:p-8"><h1 className="text-2xl font-black">إضافة حيوان إلى حساب Tinder</h1><p className="mt-2 text-sm leading-6 text-[#657585]">هذه بيانات ملف تعريفي مستقل. لا تستبدل السجل الطبي ولا تثبت الحالة الصحية.</p>
    <form onSubmit={submit} className="mt-6 grid gap-4 sm:grid-cols-2">{field("name", "اسم الحيوان", true)}<label className="block"><span className="mb-1 block text-xs font-bold text-[#657585]">النوع</span><select value={form.species} onChange={(e) => setForm((old) => ({ ...old, species: e.target.value }))} className="min-h-11 w-full rounded-xl border border-[#E7EAE6] bg-[#FAF8F4] px-3"><option value="dog">كلب</option><option value="cat">قط</option><option value="other">أخرى</option></select></label>{field("breed", "الفصيلة")}{field("color", "اللون")}<label className="block"><span className="mb-1 block text-xs font-bold text-[#657585]">تاريخ الميلاد إن كان معروفًا</span><input type="date" value={form.birth_date} onChange={(e) => setForm((old) => ({ ...old, birth_date: e.target.value }))} className="min-h-11 w-full rounded-xl border border-[#E7EAE6] bg-[#FAF8F4] px-3"/></label><label className="block"><span className="mb-1 block text-xs font-bold text-[#657585]">الجنس</span><select value={form.gender} onChange={(e) => setForm((old) => ({ ...old, gender: e.target.value }))} className="min-h-11 w-full rounded-xl border border-[#E7EAE6] bg-[#FAF8F4] px-3"><option value="unknown">غير معروف</option><option value="male">ذكر</option><option value="female">أنثى</option></select></label>{field("city", "المدينة", true)}<label className="block"><span className="mb-1 block text-xs font-bold text-[#657585]">صورة JPG أو PNG أو WebP (حتى ٥ ميجابايت)</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] || null)} className="block w-full text-sm"/></label><label className="block sm:col-span-2"><span className="mb-1 block text-xs font-bold text-[#657585]">وصف الحيوان (١٠ أحرف على الأقل)</span><textarea required minLength={10} maxLength={1200} value={form.description} onChange={(e) => setForm((old) => ({ ...old, description: e.target.value }))} rows={4} className="w-full rounded-xl border border-[#E7EAE6] bg-[#FAF8F4] p-3 text-sm outline-none focus:border-[#138780]"/></label>{error && <p role="alert" className="rounded-xl bg-[#FFF0F1] p-3 text-sm text-[#9D4351] sm:col-span-2">{error}</p>}<button disabled={busy || !token} className="min-h-12 rounded-xl bg-[#138780] px-5 text-sm font-black text-white disabled:opacity-50 sm:col-span-2">{busy ? "جاري الحفظ…" : "حفظ الحيوان"}</button></form>
  </section></div></main>;
}
