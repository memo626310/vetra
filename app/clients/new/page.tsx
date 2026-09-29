"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function NewClientPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function saveClient() {
    setError("");

    if (!name.trim()) {
      setError("اكتب اسم العميل الأول");
      return;
    }

    setSaving(true);

    const { data, error } = await supabase
      .from("clients")
      .insert({
        name: name.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
        address: address.trim() || null,
        notes: notes.trim() || null,
      })
      .select("id, client_code")
      .single();

    if (error) {
      console.error(error);
      setError(error.message);
      setSaving(false);
      return;
    }

    if (data?.id) {
      // The database trigger generates the 4-digit Client ID automatically.
      // Keep the normal flow and let the client profile display it.
      router.push(`/clients/${data.id}`);
    }
  }

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-[#f7f9fc] px-5 py-8 text-slate-900"
    >
      <div className="mx-auto max-w-3xl">
        <button
          type="button"
          onClick={() => router.push("/clients")}
          className="mb-6 text-sm font-semibold text-slate-500 transition hover:text-slate-900"
        >
          ← العملاء
        </button>

        <div className="rounded-3xl bg-white p-6 shadow-sm sm:p-8">
          <div className="mb-8">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-2xl">
              👤
            </div>

            <h1 className="text-3xl font-black">
              إضافة عميل جديد
            </h1>

            <p className="mt-2 text-slate-500">
              أضف بيانات صاحب الحيوان
            </p>
          </div>

          {error && (
            <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
              {error}
            </div>
          )}

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-2 block text-sm font-bold">
                اسم العميل *
              </label>

              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="اسم العميل"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold">
                رقم الهاتف
              </label>

              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="01xxxxxxxxx"
                dir="ltr"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-right outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold">
                البريد الإلكتروني
              </label>

              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="example@email.com"
                dir="ltr"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-right outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-2 block text-sm font-bold">
                العنوان
              </label>

              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="عنوان العميل"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-2 block text-sm font-bold">
                ملاحظات
              </label>

              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="أي ملاحظات مهمة عن العميل..."
                rows={4}
                className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </div>

          <div className="mt-8 flex gap-3">
            <button
              type="button"
              onClick={saveClient}
              disabled={saving}
              className="rounded-2xl bg-slate-900 px-7 py-4 font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "جاري الحفظ..." : "حفظ العميل ✓"}
            </button>

            <button
              type="button"
              onClick={() => router.push("/clients")}
              disabled={saving}
              className="rounded-2xl bg-slate-100 px-7 py-4 font-bold text-slate-600 transition hover:bg-slate-200 disabled:opacity-50"
            >
              إلغاء
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
