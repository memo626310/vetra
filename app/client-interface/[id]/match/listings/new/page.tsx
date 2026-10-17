"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { vetraCore } from "@/lib/vetra-core";

type Pet = { id: string; name: string; species: string; breed: string | null; is_deceased?: boolean | null };
type Owner = { clientCode: string; phone: string };
type OwnListing = { id: string; name: string; type: string; status: string; city: string };

export default function NewMatchListingPage() {
  const { id } = useParams<{ id: string }>();
  const [token, setToken] = useState("");
  const [owner, setOwner] = useState<Owner | null>(null);
  const [pets, setPets] = useState<Pet[]>([]);
  const [listings, setListings] = useState<OwnListing[]>([]);
  const [petId, setPetId] = useState("");
  const [type, setType] = useState("adoption");
  const [city, setCity] = useState("");
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { data } = await vetraCore.auth.getSession();
      if (data.session?.user.email_confirmed_at) {
        setToken(data.session.access_token);
        const response = await fetch("/api/match/owned-pets", { method: "POST", headers: { Authorization: `Bearer ${data.session.access_token}`, "Content-Type": "application/json" }, body: "{}", cache: "no-store" });
        const result = await response.json(); if (!response.ok) throw new Error(result.error || "تعذر تحميل الحيوانات.");
        setPets((result.pets || []).filter((pet: Pet) => !pet.is_deceased));
        const own = await fetch("/api/match/listings", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` }, body: JSON.stringify({ action: "my-listings" }), cache: "no-store" });
        const ownResult = await own.json(); if (own.ok) setListings(ownResult.listings || []);
      } else {
        const clientId = window.localStorage.getItem("vetra-client-id") || window.sessionStorage.getItem("vetra-client-id");
        const clientCode = window.localStorage.getItem("vetra-client-code") || window.sessionStorage.getItem("vetra-client-code");
        const phone = window.localStorage.getItem("vetra-client-phone") || window.sessionStorage.getItem("vetra-client-phone");
        if (!clientId || clientId !== id || !clientCode || !phone) { setError("سجّل الدخول بحساب VETRA أو بحساب Tinder موثق لعرض حيواناتك."); return; }
        setOwner({ clientCode, phone });
        const response = await fetch("/api/match/owned-pets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientCode, phone }) , cache: "no-store" });
        const result = await response.json(); if (!response.ok) throw new Error(result.error || "تعذر تحميل الحيوانات.");
        setPets((result.pets || []).filter((pet: Pet) => !pet.is_deceased));
        const own = await fetch("/api/match/listings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "my-listings", clientCode, phone }), cache: "no-store" });
        const ownResult = await own.json(); if (own.ok) setListings(ownResult.listings || []);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر تحميل الحيوانات."); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setMessage(""); setBusy(true);
    try {
      const response = await fetch("/api/match/listings", { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ type, petId, city, description, ...(owner || {}) }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "تعذر إرسال الملف.");
      setMessage(result.message || "تم إرسال الملف إلى المراجعة.");
      const own = await fetch("/api/match/listings", { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ action: "my-listings", ...(owner || {}) }), cache: "no-store" });
      const ownResult = await own.json(); if (own.ok) setListings(ownResult.listings || []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر إرسال الملف."); }
    finally { setBusy(false); }
  }

  async function withdraw(listing: OwnListing) {
    try {
      const response = await fetch("/api/match/listings", { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ action: "withdraw", listingId: listing.id, type: listing.type, ...(owner || {}) }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "تعذر سحب الملف.");
      setListings((old) => old.map((row) => row.id === listing.id ? { ...row, status: "withdrawn" } : row));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر سحب الملف."); }
  }
  async function completeAdoption(listing: OwnListing) {
    if (!window.confirm("تأكيد أن الحيوان تم تبنيه؟")) return;
    try {
      const response = await fetch("/api/match/listings", { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ action: "complete-adoption", listingId: listing.id, ...(owner || {}) }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "تعذر تحديث الملف.");
      setListings((old) => old.map((row) => row.id === listing.id ? { ...row, status: "adopted" } : row));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر تحديث الملف."); }
  }

  return <main dir="rtl" className="min-h-screen bg-[#FAF8F4] p-4 font-[Tahoma,Arial,sans-serif] text-[#17324D] sm:p-8"><div className="mx-auto max-w-2xl"><Link href={`/client-interface/${id}/match`} className="text-sm font-bold text-[#138780]">← العودة إلى VETRA Tinder</Link><section className="mt-4 rounded-3xl border border-[#E7EAE6] bg-white p-6 shadow-sm sm:p-8"><h1 className="text-2xl font-black">نشر ملف حيوان</h1><p className="mt-2 text-sm leading-6 text-[#657585]">سيبقى الملف بانتظار المراجعة قبل نشره. التزاوج يحتاج موافقة بيطرية مستقلة على الصحة والتكاثر والرفاه.</p>
    {loading ? <p className="py-8 text-center text-sm text-[#657585]">جاري تحميل الحيوانات…</p> : pets.length === 0 ? <div className="mt-5 rounded-xl bg-[#E6F6F0] p-4 text-sm text-[#275A5B]">لا توجد حيوانات حية على الحساب. أضف حيوانًا أولًا أو راجع تسجيل الدخول.</div> : <form onSubmit={submit} className="mt-6 space-y-4"><label className="block"><span className="mb-1 block text-xs font-bold text-[#657585]">اختر الحيوان</span><select required value={petId} onChange={(e) => setPetId(e.target.value)} className="min-h-12 w-full rounded-xl border border-[#E7EAE6] bg-[#FAF8F4] px-3">{pets.map((pet) => <option key={pet.id} value={pet.id}>{pet.name} · {pet.species}{pet.breed ? ` · ${pet.breed}` : ""}</option>)}</select></label><label className="block"><span className="mb-1 block text-xs font-bold text-[#657585]">نوع الملف</span><select value={type} onChange={(e) => setType(e.target.value)} className="min-h-12 w-full rounded-xl border border-[#E7EAE6] bg-[#FAF8F4] px-3"><option value="adoption">للتبني</option><option value="breeding">للتزاوج المسؤول</option></select></label><label className="block"><span className="mb-1 block text-xs font-bold text-[#657585]">المدينة</span><input required minLength={2} maxLength={100} value={city} onChange={(e) => setCity(e.target.value)} className="min-h-11 w-full rounded-xl border border-[#E7EAE6] bg-[#FAF8F4] px-3"/></label><label className="block"><span className="mb-1 block text-xs font-bold text-[#657585]">وصف الحيوان</span><textarea required minLength={10} maxLength={1200} value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className="w-full rounded-xl border border-[#E7EAE6] bg-[#FAF8F4] p-3"/></label>{error && <p role="alert" className="rounded-xl bg-[#FFF0F1] p-3 text-sm text-[#9D4351]">{error}</p>}{message && <p role="status" className="rounded-xl bg-[#E6F6F0] p-3 text-sm font-bold text-[#275A5B]">{message}</p>}<button disabled={busy} className="min-h-12 w-full rounded-xl bg-[#138780] px-5 font-black text-white disabled:opacity-50">{busy ? "جاري الإرسال…" : "إرسال للمراجعة"}</button></form>}
    {listings.length > 0 && <section className="mt-8 border-t border-[#E7EAE6] pt-5"><h2 className="font-black">ملفاتي المنشورة وطلبات المراجعة</h2><div className="mt-3 space-y-2">{listings.map((listing) => <div key={listing.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#FAF8F4] p-3"><div><p className="text-sm font-bold">{listing.name} · {listing.type === "adoption" ? "تبنٍ" : "تزاوج"}</p><p className="text-xs text-[#657585]">{listing.city} · {listing.status === "pending" ? "قيد المراجعة" : listing.status === "published" ? "منشور" : listing.status === "withdrawn" ? "مسحوب" : listing.status}</p></div><div className="flex gap-2">{listing.type === "adoption" && listing.status === "published" && <button type="button" onClick={() => void completeAdoption(listing)} className="min-h-9 rounded-lg bg-[#E6F6F0] px-3 text-xs font-bold text-[#138780]">تم التبني</button>}{!["withdrawn", "adopted", "rejected"].includes(listing.status) && <button type="button" onClick={() => void withdraw(listing)} className="min-h-9 rounded-lg border border-[#E7EAE6] bg-white px-3 text-xs font-bold">سحب الملف</button>}</div></div>)}</div></section>}
  </section></div></main>;
}
