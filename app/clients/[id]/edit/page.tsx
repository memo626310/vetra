
"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getClinicDb } from "@/lib/clinic-db";

type ClientForm = {
  client_code: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
};

export default function EditClientPage() {
  const params = useParams<{ id: string }>();
  const clientId = params.id;

  const [form, setForm] = useState<ClientForm>({
    client_code: "",
    name: "",
    phone: "",
    email: "",
    address: "",
    notes: "",
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadClient() {
      setLoading(true);
      setError("");

      try {
        const db = await getClinicDb();

        const { data, error: loadError } = await db
          .from("clients")
          .select("client_code, name, phone, email, address, notes")
          .eq("id", clientId)
          .single();

        if (loadError || !data) {
          throw new Error(
            loadError?.message || "العميل غير موجود."
          );
        }

        if (!cancelled) {
          setForm({
            client_code: data.client_code || "",
            name: data.name || "",
            phone: data.phone || "",
            email: data.email || "",
            address: data.address || "",
            notes: data.notes || "",
          });
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "تعذر تحميل بيانات العميل."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (clientId) {
      void loadClient();
    } else {
      setError("رقم العميل غير موجود.");
      setLoading(false);
    }

    return () => {
      cancelled = true;
    };
  }, [clientId]);

  function updateField(
    field: "name" | "phone" | "email" | "address" | "notes",
    value: string
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function saveClient(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setError("");
    setSuccess("");

    if (!form.name.trim()) {
      setError("اكتب اسم العميل الأول.");
      return;
    }

    setSaving(true);

    try {
      const db = await getClinicDb();

      const { data, error: updateError } = await db
        .from("clients")
        .update({
          name: form.name.trim(),
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          address: form.address.trim() || null,
          notes: form.notes.trim() || null,
        })
        .eq("id", clientId)
        .select("id")
        .single();

      if (updateError) throw updateError;

      if (!data) {
        throw new Error("لم يتم تأكيد حفظ بيانات العميل.");
      }

      setSuccess(
        "تم حفظ بيانات العميل بنجاح ✓ جاري الرجوع إلى ملف العميل..."
      );
      setSaving(false);

      window.setTimeout(() => {
        window.location.assign(
          `/clients/${encodeURIComponent(clientId)}?updated=1`
        );
      }, 1200);
    } catch (err) {
      console.error("UPDATE CLIENT ERROR:", err);

      setError(
        err instanceof Error
          ? err.message
          : "حصل خطأ أثناء حفظ بيانات العميل."
      );

      setSaving(false);
    }
  }

  const inputClass =
    "w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100";

  if (loading) {
    return (
      <main
        dir="rtl"
        className="flex min-h-screen items-center justify-center bg-[#f7f9fc] px-5"
      >
        <div className="rounded-3xl bg-white p-10 text-center shadow-sm">
          <div className="mb-4 text-5xl">👤</div>
          <p className="font-semibold text-slate-500">
            جاري تحميل بيانات العميل...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-[#f7f9fc] px-5 py-8 text-slate-900"
    >
      <div className="mx-auto max-w-3xl">
        <Link
          href={`/clients/${clientId}`}
          className="mb-6 inline-flex text-sm font-semibold text-slate-500 transition hover:text-slate-900"
        >
          ← العودة لملف العميل
        </Link>

        <section className="mt-4 rounded-3xl bg-white p-6 shadow-sm sm:p-8">
          <div className="mb-8">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-2xl">
              ✏️
            </div>

            <h1 className="text-3xl font-black">
              تعديل بيانات العميل
            </h1>

            <p className="mt-2 text-slate-500">
              عدّل بيانات التواصل والعنوان والملاحظات.
              رقم العميل لن يتغير.
            </p>

            <div
              dir="ltr"
              className="mt-4 inline-flex rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700"
            >
              ID: {form.client_code || "—"}
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
            >
              {error}
            </div>
          )}

          {success && (
            <div
              role="status"
              aria-live="polite"
              className="mb-5 flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm font-bold text-emerald-800 sm:flex-row sm:items-center sm:justify-between"
            >
              <span>{success}</span>

              <button
                type="button"
                onClick={() => {
                  window.location.assign(
                    `/clients/${encodeURIComponent(clientId)}?updated=1`
                  );
                }}
                className="shrink-0 rounded-xl bg-emerald-700 px-4 py-2 font-bold text-white transition hover:bg-emerald-800"
              >
                الرجوع لملف العميل
              </button>
            </div>
          )}

          <form
            onSubmit={saveClient}
            className="grid gap-5 sm:grid-cols-2"
          >
            <div className="sm:col-span-2">
              <label
                htmlFor="client-name"
                className="mb-2 block text-sm font-bold"
              >
                اسم العميل *
              </label>

              <input
                id="client-name"
                value={form.name}
                onChange={(e) =>
                  updateField("name", e.target.value)
                }
                required
                maxLength={200}
                autoComplete="name"
                className={inputClass}
                placeholder="اسم العميل"
              />
            </div>

            <div>
              <label
                htmlFor="client-phone"
                className="mb-2 block text-sm font-bold"
              >
                رقم الهاتف
              </label>

              <input
                id="client-phone"
                type="tel"
                value={form.phone}
                onChange={(e) =>
                  updateField("phone", e.target.value)
                }
                autoComplete="tel"
                dir="ltr"
                className={inputClass}
                placeholder="01xxxxxxxxx"
              />
            </div>

            <div>
              <label
                htmlFor="client-email"
                className="mb-2 block text-sm font-bold"
              >
                البريد الإلكتروني
              </label>

              <input
                id="client-email"
                type="email"
                value={form.email}
                onChange={(e) =>
                  updateField("email", e.target.value)
                }
                autoComplete="email"
                dir="ltr"
                className={inputClass}
                placeholder="name@example.com"
              />
            </div>

            <div className="sm:col-span-2">
              <label
                htmlFor="client-address"
                className="mb-2 block text-sm font-bold"
              >
                العنوان
              </label>

              <input
                id="client-address"
                value={form.address}
                onChange={(e) =>
                  updateField("address", e.target.value)
                }
                autoComplete="street-address"
                className={inputClass}
                placeholder="عنوان العميل"
              />
            </div>

            <div className="sm:col-span-2">
              <label
                htmlFor="client-notes"
                className="mb-2 block text-sm font-bold"
              >
                ملاحظات
              </label>

              <textarea
                id="client-notes"
                value={form.notes}
                onChange={(e) =>
                  updateField("notes", e.target.value)
                }
                rows={4}
                className={`${inputClass} resize-y`}
                placeholder="أي ملاحظات مهمة عن العميل..."
              />
            </div>

            <div className="sm:col-span-2 mt-2 flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={saving || Boolean(success)}
                className="rounded-2xl bg-slate-900 px-7 py-3.5 font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving
                  ? "جاري الحفظ..."
                  : success
                    ? "تم الحفظ ✓"
                    : "حفظ التعديلات ✓"}
              </button>

              <Link
                href={`/clients/${clientId}`}
                className="rounded-2xl bg-slate-100 px-7 py-3.5 text-center font-bold text-slate-600 transition hover:bg-slate-200"
              >
                إلغاء
              </Link>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
