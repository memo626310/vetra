"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { getClinicDb } from "@/lib/clinic-db";
import { vetraCore } from "@/lib/vetra-core";

type Client = {
  id: string;
  client_code: string;
  clinic_id: string;
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

type ClientInvoice = {
  id: string;
  invoice_number: number;
  status: string;
  total: number | null;
  paid_amount: number | null;
  created_at: string;
};

export default function ClientPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const clientId = params.id;

  const [client, setClient] = useState<Client | null>(null);
  const [pets, setPets] = useState<Pet[]>([]);
  const [clientInvoices, setClientInvoices] = useState<ClientInvoice[]>([]);

  const [loading, setLoading] = useState(true);
  const [savingPet, setSavingPet] = useState(false);
  const [generatingClientCode, setGeneratingClientCode] = useState(false);
  const [deletingClient, setDeletingClient] = useState(false);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [petName, setPetName] = useState("");
  const [species, setSpecies] = useState("Cat");
  const [breed, setBreed] = useState("");
  const [gender, setGender] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [birthDateInputMode, setBirthDateInputMode] = useState<"age" | "date">("age");
  const [ageYears, setAgeYears] = useState("");
  const [ageMonths, setAgeMonths] = useState("");
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

      const db = await getClinicDb();

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

      const {
        data: invoicesData,
        error: invoicesError,
      } = await db
        .from("invoices")
        .select("id, invoice_number, status, total, paid_amount, created_at")
        .eq("clinic_id", clientData.clinic_id)
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });

      if (invoicesError) {
        console.error("CLIENT INVOICES LOAD ERROR:", invoicesError);
        setClientInvoices([]);
      } else {
        setClientInvoices((invoicesData || []) as ClientInvoice[]);
      }

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

  function calculateBirthDate(years: string, months: string) {
    const parsedYears = Number.parseInt(years || "0", 10);
    const parsedMonths = Number.parseInt(months || "0", 10);

    if (!Number.isInteger(parsedYears) || !Number.isInteger(parsedMonths) || parsedYears < 0 || parsedMonths < 0) {
      return "";
    }

    const totalMonths = parsedYears * 12 + parsedMonths;
    if (totalMonths === 0 && !years && !months) return "";

    const today = new Date();
    const result = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    result.setDate(1);
    result.setMonth(result.getMonth() - totalMonths);
    const lastDayOfMonth = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
    result.setDate(Math.min(today.getDate(), lastDayOfMonth));

    const year = result.getFullYear();
    const month = String(result.getMonth() + 1).padStart(2, "0");
    const day = String(result.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function updateAge(years: string, months: string) {
    const normalizedYears = String(Math.min(Number.parseInt(years.replace(/\D/g, "").slice(0, 2) || "0", 10), 50));
    const normalizedMonths = String(Math.min(Number.parseInt(months.replace(/\D/g, "").slice(0, 2) || "0", 10), 11));

    setAgeYears(years ? normalizedYears : "");
    setAgeMonths(months ? normalizedMonths : "");
    setBirthDate(calculateBirthDate(normalizedYears, months ? normalizedMonths : ""));
  }

  async function generateNewClientCode() {
    if (!client || generatingClientCode) return;

    const confirmed = window.confirm(
      "سيتم توليد Client ID جديد بنفس كود بداية العيادة، مع تغيير رقم العميل فقط. الرقم القديم لن يصلح لتسجيل دخول جديد، ولن تتغير روابط الحيوانات أو الزيارات أو الفواتير. هل تريد المتابعة؟"
    );
    if (!confirmed) return;

    setGeneratingClientCode(true);
    setError("");
    setMessage("");

    try {
      const db = await getClinicDb();
      const currentCode = String(client.client_code || "").trim();

      // VETRA Client ID format: 2-digit clinic prefix + 4-digit client suffix.
      // Refuse to guess if this clinic's current records do not confirm that format.
      if (!client.clinic_id || !/^\d{6}$/.test(currentCode)) {
        throw new Error(
          "لم يتم تغيير الرقم: Client ID الحالي لا يطابق صيغة العيادة (كود العيادة + 4 أرقام). راجع إعدادات الكود أولًا."
        );
      }

      const { data: clinicClients, error: clinicClientsError } = await db
        .from("clients")
        .select("client_code")
        .eq("clinic_id", client.clinic_id);

      if (clinicClientsError) throw clinicClientsError;

      const numericCodes = (clinicClients || [])
        .map((row) => String(row.client_code || "").trim())
        .filter((code) => /^\d{6}$/.test(code));
      const clinicPrefixes = new Set(numericCodes.map((code) => code.slice(0, 2)));
      const clinicPrefix = currentCode.slice(0, 2);

      if (
        numericCodes.length !== (clinicClients || []).length ||
        !numericCodes.includes(currentCode) ||
        clinicPrefixes.size !== 1 ||
        !clinicPrefixes.has(clinicPrefix)
      ) {
        throw new Error(
          "لم يتم تغيير الرقم: أكواد العملاء المسجلة لا تؤكد كود بداية موحدًا لهذه العيادة. لم يتم تعديل أي بيانات."
        );
      }

      let lastError: Error | null = null;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const random = new Uint32Array(1);
        window.crypto.getRandomValues(random);
        const suffix = String(random[0] % 10000).padStart(4, "0");
        const candidate = clinicPrefix + suffix;

        if (candidate === currentCode) continue;

        // Check globally too, in case the database has a global unique index.
        const { data: occupied, error: lookupError } = await db
          .from("clients")
          .select("id")
          .eq("client_code", candidate)
          .limit(1)
          .maybeSingle();

        if (lookupError) throw lookupError;
        if (occupied) continue;

        const { data: updated, error: updateError } = await db
          .from("clients")
          .update({ client_code: candidate })
          .eq("id", client.id)
          .eq("clinic_id", client.clinic_id)
          .select("id, client_code")
          .single();

        if (updateError) {
          const detail = (updateError.message || "").toLowerCase();
          if (detail.includes("duplicate") || detail.includes("unique")) {
            lastError = updateError;
            continue;
          }
          throw updateError;
        }

        if (!updated?.client_code || !updated.client_code.startsWith(clinicPrefix) || !/^\d{6}$/.test(updated.client_code)) {
          throw new Error("لم يتم تأكيد Client ID الجديد بالصيغة الصحيحة.");
        }

        setClient((current) => current ? { ...current, client_code: updated.client_code } : current);
        setMessage("تم تغيير Client ID بنجاح مع الحفاظ على كود العيادة: " + updated.client_code);
        return;
      }

      throw lastError || new Error("لم يتم العثور على رقم متاح بنفس كود بداية العيادة. لم يتم تغيير الرقم.");
    } catch (err) {
      console.error("GENERATE CLIENT CODE ERROR:", err);
      setError(err instanceof Error ? err.message : "تعذر تغيير Client ID.");
    } finally {
      setGeneratingClientCode(false);
    }
  }

  async function deleteClientPermanently() {
    if (!client || deletingClient) return;
    const typedName = window.prompt(
      `حذف نهائي لا يمكن التراجع عنه. سيتم حذف العميل "${client.name}" وكل حيواناته وسجلاته الطبية ومواعيده وفواتيره ومدفوعاتها. اكتب اسم العميل كما هو للتأكيد:`
    );
    if (typedName === null) return;
    if (typedName.trim() !== client.name.trim()) {
      setError("لم يتم الحذف: الاسم المكتوب لا يطابق اسم العميل.");
      return;
    }
    if (!window.confirm(`تأكيد أخير: حذف "${client.name}" وجميع بياناته نهائيًا؟`)) return;

    setDeletingClient(true);
    setError("");
    try {
      const { data: { session }, error: sessionError } = await vetraCore.auth.getSession();
      if (sessionError || !session?.access_token) throw new Error("انتهت جلسة الدخول. سجّل الدخول ثم أعد المحاولة.");

      const response = await fetch(`/api/clients/${encodeURIComponent(client.id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const result = await response.json().catch(() => ({})) as { error?: string; cleanupPending?: boolean };
      if (!response.ok) throw new Error(result.error || "تعذر حذف العميل.");

      if (result.cleanupPending) {
        window.alert("تم حذف ملف العميل وبيانات العيادة. تعذر تنظيف بعض بيانات الإشعارات أو الصور؛ تواصل مع مسؤول النظام لإتمام التنظيف.");
      }
      router.replace("/clients");
      router.refresh();
    } catch (err) {
      console.error("CLIENT DELETE ERROR:", err);
      setError(err instanceof Error ? err.message : "تعذر حذف العميل وبياناته المرتبطة.");
    } finally {
      setDeletingClient(false);
    }
  }

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
        console.error("PET INSERT ERROR:", insertError);

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
      setAgeYears("");
      setAgeMonths("");
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

  const dueInvoices = clientInvoices.filter((invoice) => {
    const due = Number(invoice.total || 0) - Number(invoice.paid_amount || 0);
    return !["draft", "cancelled", "returned"].includes(invoice.status) && due > 0.009;
  });
  const clientOutstanding = dueInvoices.reduce(
    (sum, invoice) => sum + Math.max(Number(invoice.total || 0) - Number(invoice.paid_amount || 0), 0),
    0,
  );

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

            {/* Edit Client Button */}
            <Link
              href={`/clients/${client.id}/edit`}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 font-bold text-white shadow-sm transition hover:bg-blue-700 hover:shadow-md"
            >
              <span aria-hidden="true">✏️</span>
              <span>تعديل بيانات العميل</span>
            </Link>
            <button
              type="button"
              onClick={() => void generateNewClientCode()}
              disabled={generatingClientCode}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-5 py-3 font-bold text-blue-800 transition hover:bg-blue-100 disabled:cursor-wait disabled:opacity-60"
            >
              <span aria-hidden="true">🔢</span>
              <span>{generatingClientCode ? "جاري توليد رقم..." : "توليد Client ID جديد"}</span>
            </button>
            <button
              type="button"
              onClick={() => void deleteClientPermanently()}
              disabled={deletingClient}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-5 py-3 font-bold text-red-700 transition hover:bg-red-100 disabled:cursor-wait disabled:opacity-60"
            >
              <span aria-hidden="true">🗑️</span>
              <span>{deletingClient ? "جاري حذف العميل..." : "حذف العميل وكل بياناته نهائيًا"}</span>
            </button>

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

        {/* Outstanding balances */}
        <section className="mb-6 rounded-3xl bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-black">المبالغ المستحقة</h2>
              <p className="mt-1 text-sm text-slate-500">
                الفواتير التي لم يتم تحصيلها بالكامل
              </p>
            </div>

            <div className="rounded-2xl bg-amber-50 px-5 py-3 text-left">
              <p className="text-xs font-bold text-amber-700">إجمالي المستحق</p>
              <p dir="ltr" className="mt-1 text-2xl font-black text-amber-700">
                {clientOutstanding.toFixed(2)} ج.م
              </p>
            </div>
          </div>

          {dueInvoices.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-center text-sm font-semibold text-slate-500">
              لا توجد مبالغ مستحقة على هذا العميل.
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {dueInvoices.map((invoice) => {
                const due = Math.max(Number(invoice.total || 0) - Number(invoice.paid_amount || 0), 0);

                return (
                  <div
                    key={invoice.id}
                    className="flex flex-col gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-black">فاتورة #{invoice.invoice_number}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        الإجمالي: {Number(invoice.total || 0).toFixed(2)} ج.م
                        <span className="mx-2">•</span>
                        المدفوع: {Number(invoice.paid_amount || 0).toFixed(2)} ج.م
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <p dir="ltr" className="font-black text-amber-700">
                        متبقي {due.toFixed(2)} ج.م
                      </p>
                      <Link
                        href="/finance"
                        className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-800"
                      >
                        تحصيل الدفعة
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

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
                تاريخ الميلاد أو العمر
              </label>

              <div className="mb-3 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => {
                    setBirthDateInputMode("age");
                    setBirthDate("");
                  }}
                  className={`rounded-xl px-3 py-2 text-sm font-bold transition ${birthDateInputMode === "age" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
                >
                  إدخال العمر
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBirthDateInputMode("date");
                    setBirthDate("");
                    setAgeYears("");
                    setAgeMonths("");
                  }}
                  className={`rounded-xl px-3 py-2 text-sm font-bold transition ${birthDateInputMode === "date" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
                >
                  إدخال التاريخ
                </button>
              </div>

              {birthDateInputMode === "age" ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      min="0"
                      max="50"
                      value={ageYears}
                      onChange={(e) => updateAge(e.target.value, ageMonths)}
                      placeholder="سنوات"
                      aria-label="العمر بالسنوات"
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 outline-none focus:border-blue-500 focus:bg-white"
                    />

                    <input
                      type="number"
                      min="0"
                      max="11"
                      value={ageMonths}
                      onChange={(e) => updateAge(ageYears, e.target.value)}
                      placeholder="شهور"
                      aria-label="العمر بالشهور"
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 outline-none focus:border-blue-500 focus:bg-white"
                    />
                  </div>

                  <p className="mt-2 text-xs text-slate-500">
                    تاريخ الميلاد المحسوب: {birthDate || "سيظهر تلقائيًا بعد إدخال العمر"}
                  </p>
                </>
              ) : (
                <input
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 outline-none focus:border-blue-500 focus:bg-white"
                />
              )}
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
