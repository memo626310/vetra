"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { getClinicContext, getClinicDb } from "@/lib/clinic-db";
import { openWhatsAppTemplate } from "@/lib/clinic-message-templates";
import { loadClinicProfile } from "@/lib/clinic-profile";
import { HumanMedicationList, type HumanMedicationEntry } from "@/components/VisitHumanMedications";
import { humanPrescriptionDetails, humanPrescriptionFromRecord } from "@/lib/human-prescriptions";
import {
  buildPrescriptionPdfBlob,
  downloadBlob,
} from "@/lib/prescription-pdf";

type Visit = {
  id: string;
  client_id: string;
  pet_id: string;
  visit_date: string;
  reason: string | null;
  examination: string | null;
  diagnosis: string | null;
  treatment: string | null;
  weight: number | null;
  temperature: number | null;
  heart_rate: number | null;
  respiratory_rate: number | null;
  notes: string | null;
};

type Pet = {
  id: string;
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
  email: string | null;
};

type VisitMedication = {
  id: string;
  medication_id: string;
  weight_kg: number | null;
  calculated_dose: number | null;
  calculated_dose_unit: string | null;
  dose_per_kg: number | null;
  concentration: number | null;
  concentration_unit: string | null;
  calculated_volume: number | null;
  volume_unit: string | null;
  route: string | null;
  frequency: string | null;
  duration_days: number | null;
  instructions: string | null;
};

type Medication = {
  id: string;
  name: string;
  active_ingredient: string | null;
};

type Vaccination = {
  id: string;
  vaccine_name: string;
  vaccine_type: string | null;
  administered_at: string | null;
  next_dose_at: string | null;
  dose: string | null;
  route: string | null;
  batch_number: string | null;
  manufacturer: string | null;
  notes: string | null;
};

type ClinicContext = {
  clinic_name?: string | null;
  doctor_name?: string | null;
  display_name?: string | null;
  website_url?: string | null;
  logo_url?: string | null;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ar-EG", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(value));
}

function formatTime(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ar-EG", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatNumber(value: number | null | undefined, digits = 2) {
  if (value == null || !Number.isFinite(Number(value))) return "-";
  return Number(value).toFixed(digits).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function speciesLabel(value: string | null | undefined) {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "cat") return "قط / Cat";
  if (normalized === "dog") return "كلب / Dog";
  return value ? `${value}` : "-";
}

function genderLabel(value: string | null | undefined) {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "male") return "ذكر / Male";
  if (normalized === "female") return "أنثى / Female";
  return value ? `${value}` : "-";
}

function extractFollowUp(notes: string | null) {
  if (!notes) return { followUp: "", notes: "" };

  const lines = notes.split("\n");
  const followUpIndex = lines.findIndex((line) =>
    /^Follow-up:\s*/i.test(line.trim())
  );

  if (followUpIndex === -1) {
    return { followUp: "", notes };
  }

  const followUp = lines[followUpIndex]
    .replace(/^Follow-up:\s*/i, "")
    .trim();
  const remaining = lines
    .filter((_, index) => index !== followUpIndex)
    .join("\n")
    .replace(/^\s*\n+|\n+\s*$/g, "")
    .trim();

  return { followUp, notes: remaining };
}

export default function PrescriptionPage() {
  const params = useParams<{ visitId: string }>();
  const router = useRouter();
  const prescriptionRef = useRef<HTMLDivElement | null>(null);

  const visitId = params?.visitId;

  const [visit, setVisit] = useState<Visit | null>(null);
  const [pet, setPet] = useState<Pet | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [clinic, setClinic] = useState<ClinicContext | null>(null);
  const [visitMedications, setVisitMedications] = useState<VisitMedication[]>([]);
  const [medications, setMedications] = useState<Record<string, Medication>>({});
  const [vaccinations, setVaccinations] = useState<Vaccination[]>([]);
  const [humanMedications, setHumanMedications] = useState<HumanMedicationEntry[]>([]);

  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [pdfPreparing, setPdfPreparing] = useState(false);
  const [error, setError] = useState("");

  const medicationRows = useMemo(
    () =>
      visitMedications.map((row) => ({
        row,
        medication: medications[row.medication_id] || null,
      })),
    [visitMedications, medications]
  );

  const followUpData = useMemo(
    () => extractFollowUp(visit?.notes || null),
    [visit?.notes]
  );

  const treatmentNotes = humanMedications.length
    ? (visit?.treatment || "").split("\n").filter((line) => !/^\[(?:Human medication[^\]]*|DrugEye\s*\/[^\]]*)\]/i.test(line.trim())).join("\n").trim()
    : visit?.treatment || "";

  const pdfFilename = useMemo(() => {
    const petName = (pet?.name || "Pet")
      .trim()
      .replace(/[^a-zA-Z0-9-_\u0600-\u06FF ]/g, "")
      .replace(/\s+/g, "-");
    const date = visit?.visit_date
      ? new Date(visit.visit_date).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    return `VETRA-Prescription-${petName || "Pet"}-${date}.pdf`;
  }, [pet?.name, visit?.visit_date]);

  useEffect(() => {
    if (!visitId) return;
    loadPrescription();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visitId]);

  useEffect(() => {
    if (loading || !visit || !pet || !client || !prescriptionRef.current) return;

    let cancelled = false;

    async function preparePdf() {
      setPdfPreparing(true);
      prescriptionRef.current?.classList.add("prescription-pdf-layout");

      try {
        const blob = await buildPrescriptionPdfBlob(prescriptionRef.current!);
        if (!cancelled) {
          setPdfBlob(blob);
        }
      } catch (pdfError) {
        console.error("PREPARE PRESCRIPTION PDF ERROR:", pdfError);
        if (!cancelled) {
          setPdfBlob(null);
          setError(
            pdfError instanceof Error
              ? pdfError.message
              : "Could not prepare the prescription PDF."
          );
        }
      } finally {
        prescriptionRef.current?.classList.remove("prescription-pdf-layout");
        if (!cancelled) setPdfPreparing(false);
      }
    }

    preparePdf();

    return () => {
      cancelled = true;
    };
  }, [
    loading,
    visit?.id,
    visit?.visit_date,
    visit?.reason,
    visit?.examination,
    visit?.diagnosis,
    visit?.treatment,
    visit?.weight,
    visit?.temperature,
    visit?.heart_rate,
    visit?.respiratory_rate,
    visit?.notes,
    pet?.id,
    client?.id,
    clinic?.clinic_name,
    clinic?.display_name,
    clinic?.website_url,
    clinic?.logo_url,
    clinic?.doctor_name,
    visitMedications,
    humanMedications,
    vaccinations,
    medications,
  ]);

  async function loadPrescription() {
    setLoading(true);
    setError("");

    try {
      const db = await getClinicDb();
      const context = await getClinicContext();
      const profile = await loadClinicProfile(db, context.clinic_id);

      const { data: visitData, error: visitError } = await db
        .from("visits")
        .select("*")
        .eq("id", visitId)
        .single();

      if (visitError || !visitData) {
        throw visitError || new Error("Prescription visit was not found.");
      }

      const [{ data: petData, error: petError }, { data: clientData, error: clientError }, { data: medicationRowsData, error: medicationRowsError }, { data: vaccinationData, error: vaccinationError }, { data: prescriptionData, error: prescriptionError }] =
        await Promise.all([
          db
            .from("pets")
            .select("id, name, species, breed, gender, birth_date, color, microchip")
            .eq("id", visitData.pet_id)
            .single(),
          db
            .from("clients")
            .select("id, name, phone, email")
            .eq("id", visitData.client_id)
            .single(),
          db
            .from("visit_medications")
            .select("*")
            .eq("visit_id", visitId),
          db
            .from("vaccinations")
            .select("id, vaccine_name, vaccine_type, administered_at, next_dose_at, dose, route, batch_number, manufacturer, notes")
            .eq("visit_id", visitId)
            .order("administered_at", { ascending: true }),
          db
            .from("visit_prescriptions")
            .select("id,medication_name,prescription,source")
            .eq("clinic_id", context.clinic_id)
            .eq("visit_id", visitId)
            .order("created_at", { ascending: true }),
        ]);

      if (petError) throw petError;
      if (clientError) throw clientError;
      if (medicationRowsError) throw medicationRowsError;
      if (vaccinationError) throw vaccinationError;
      if (prescriptionError) throw prescriptionError;

      const rows = (medicationRowsData || []) as VisitMedication[];
      const medicationIds = [...new Set(rows.map((row) => row.medication_id).filter(Boolean))];

      let medicationMap: Record<string, Medication> = {};
      if (medicationIds.length) {
        const { data: medicationData, error: medicationError } = await db
          .from("medications")
          .select("id, name, active_ingredient")
          .in("id", medicationIds);
        if (medicationError) throw medicationError;
        medicationMap = Object.fromEntries(
          ((medicationData || []) as Medication[]).map((item) => [item.id, item])
        );
      }

      setVisit(visitData as Visit);
      setPet(petData as Pet);
      setClient(clientData as Client);
      setClinic({ ...context, ...profile, doctor_name: profile?.doctor_name || context.doctor_name } as ClinicContext);
      setVisitMedications(rows);
      setMedications(medicationMap);
      setVaccinations((vaccinationData || []) as Vaccination[]);
      setHumanMedications((prescriptionData || []).flatMap((row) => {
        const prescription = humanPrescriptionFromRecord(row);
        return prescription ? [{ id: String(row.id), name: String(row.medication_name), prescription }] : [];
      }));
    } catch (loadError) {
      console.error("LOAD PRESCRIPTION ERROR:", loadError);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load prescription."
      );
    } finally {
      setLoading(false);
    }
  }

  function getReadyPdfBlob() {
    if (!pdfBlob || pdfBlob.size === 0) {
      throw new Error(
        pdfPreparing
          ? "PDF is still being prepared. Please wait a moment."
          : "Prescription PDF is not ready yet."
      );
    }
    return pdfBlob;
  }

  function handleDownloadPdf() {
    if (working) return;
    setError("");

    try {
      const blob = getReadyPdfBlob();
      downloadBlob(blob, pdfFilename);
    } catch (pdfError) {
      console.error("DOWNLOAD PRESCRIPTION PDF ERROR:", pdfError);
      setError(
        pdfError instanceof Error
          ? pdfError.message
          : "Could not download the prescription PDF."
      );
    }
  }

  function openWhatsAppText() {
    if (!client?.phone || !visit || !pet) {
      setError("Owner phone number is not available.");
      return;
    }

    const medicationText = medicationRows
      .map(({ row, medication }) => {
        const dose = row.calculated_dose != null
          ? `${formatNumber(row.calculated_dose)} ${row.calculated_dose_unit || ""}`.trim()
          : "";
        const volume = row.calculated_volume != null
          ? `${formatNumber(row.calculated_volume)} ${row.volume_unit || "mL"}`
          : "";
        const schedule = [row.route, row.frequency, row.duration_days ? `${row.duration_days} days` : ""]
          .filter(Boolean)
          .join(" - ");
        return `- ${medication?.name || "Medication"}: ${dose}${volume ? ` (${volume})` : ""}${schedule ? ` - ${schedule}` : ""}`;
      })
      .join("\n");

    const lines = [
      "VETRA - Prescription",
      `Pet: ${pet.name}`,
      `Owner: ${client?.name || "-"}`,
      visit.diagnosis ? `Diagnosis: ${visit.diagnosis}` : "",
      medicationText ? `Treatment:\n${medicationText}` : treatmentNotes ? `Treatment:\n${treatmentNotes}` : "",
      humanMedications.length ? `الأدوية البشرية / Human medications:\n${humanMedications.map((entry) => `- ${entry.name}: ${humanPrescriptionDetails(entry.prescription, true)}`).join("\n")}` : "",
      visit.examination ? `Examination:\n${visit.examination}` : "",
      visit.notes ? `Notes:\n${visit.notes}` : "",
      visit.weight != null || visit.temperature != null || visit.heart_rate != null || visit.respiratory_rate != null
        ? `Vitals:\n${[
            visit.weight != null ? `Weight: ${visit.weight} kg` : "",
            visit.temperature != null ? `Temperature: ${visit.temperature} Â°C` : "",
            visit.heart_rate != null ? `Heart rate: ${visit.heart_rate} bpm` : "",
            visit.respiratory_rate != null ? `Respiratory rate: ${visit.respiratory_rate} rpm` : "",
          ].filter(Boolean).join(" | ")}`
        : "",
      vaccinations.length
        ? `Vaccination:\n${vaccinations.map((item) => `- ${item.vaccine_name}${item.next_dose_at ? ` - next dose ${formatDate(item.next_dose_at)}` : ""}`).join("\n")}`
        : "",
      followUpData.followUp ? `Follow-up: ${followUpData.followUp}` : "",
      "",
      "Prescription generated by VETRA",
    ].filter(Boolean);

    const lang = window.localStorage.getItem("vetra-language") === "ar" ? "ar" : "en";
    void openWhatsAppTemplate(client.phone, "prescription_sharing", lang, {
      customer_name: client.name,
      pet_name: pet.name,
      prescription_summary: lines.join("\n\n"),
      brand_name: clinic?.display_name || clinic?.clinic_name || "VETRA",
    });
  }

  async function handleSharePrescription() {
    if (working) return;
    setError("");

    try {
      const blob = getReadyPdfBlob();
      const file = new File([blob], pdfFilename, {
        type: "application/pdf",
      });

      const canShareFile =
        typeof navigator !== "undefined" &&
        typeof navigator.share === "function" &&
        (!navigator.canShare || navigator.canShare({ files: [file] }));

      if (canShareFile) {
        // Keep the share call directly inside the user click handler.
        // This preserves the browser's transient user activation on mobile.
        await navigator.share({
          title: `VETRA Prescription - ${pet?.name || "Pet"}`,
          text: `Prescription for ${pet?.name || "Pet"}`,
          files: [file],
        });
        return;
      }

      // Browsers that do not support file sharing cannot attach a local PDF
      // to a wa.me URL. Download the real PDF first, then open WhatsApp with
      // the prescription text so the owner can attach the downloaded file.
      downloadBlob(blob, pdfFilename);
      window.setTimeout(() => {
        openWhatsAppText();
      }, 200);
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === "AbortError") {
        return;
      }
      console.error("SHARE PRESCRIPTION ERROR:", shareError);
      setError(
        shareError instanceof Error
          ? shareError.message
          : "Could not share the prescription PDF."
      );
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-100 p-6 text-slate-900">
        <div className="mx-auto flex min-h-[70vh] max-w-5xl items-center justify-center">
          <div className="rounded-3xl border border-slate-200 bg-white px-8 py-10 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-2xl text-white">
              🩺
            </div>
            <div className="text-lg font-bold">جاري تجهيز الروشتة</div>
            <div className="mt-1 text-sm text-slate-500">Preparing prescription...</div>
          </div>
        </div>
      </main>
    );
  }

  if (!visit || !pet || !client) {
    return (
      <main className="min-h-screen bg-slate-100 p-6 text-slate-900">
        <div className="mx-auto max-w-3xl rounded-3xl border border-rose-200 bg-white p-8 shadow-sm">
          <h1 className="text-xl font-bold">تعذر تحميل الروشتة / Prescription unavailable</h1>
          <p className="mt-2 text-sm text-rose-600">{error || "The requested visit could not be loaded."}</p>
          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={loadPrescription}
              className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white"
            >
              Retry
            </button>
            <Link href="/dashboard" className="rounded-xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
              Dashboard
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 px-3 py-4 text-slate-900 sm:px-6 sm:py-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-5 flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-blue-600">VETRA</div>
            <h1 className="mt-1 text-2xl font-black tracking-tight">الروشتة / Prescription</h1>
            <p className="mt-1 text-sm text-slate-500">راجع الروشتة ثم احفظها PDF أو شاركها.</p>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 sm:w-auto"
            >
              {"Dashboard / الداشبورد"}
            </button>
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={pdfPreparing || !pdfBlob}
              className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              {pdfPreparing ? "Preparing PDF..." : "↓ PDF"}
            </button>
            <button
              type="button"
              onClick={handleSharePrescription}
              disabled={pdfPreparing || !pdfBlob}
              className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              ↗ WhatsApp / Share
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="w-full rounded-xl bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700 transition hover:bg-blue-100 sm:w-auto"
            >
              Print
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {error}
          </div>
        )}

        <div className="w-full min-w-0 rounded-3xl">
          <div
            ref={prescriptionRef}
            className="prescription-sheet relative mx-auto w-full max-w-[794px] overflow-hidden bg-white px-4 py-6 text-slate-900 shadow-xl sm:px-10 sm:py-9"
            dir="rtl"
          >
            <div className="rx-print-content relative hidden min-h-[1047px] bg-white px-12 py-10 text-slate-950">
              <header className="flex items-start justify-between gap-6 border-b-2 border-cyan-700 pb-5">
                <div className="flex min-w-0 items-center gap-4">
                  {clinic?.logo_url && <img src={clinic.logo_url} crossOrigin="anonymous" alt="" className="h-20 w-20 shrink-0 object-contain" />}
                  <div className="min-w-0"><h1 className="break-words text-2xl font-black">{clinic?.display_name || clinic?.clinic_name || "VETRA Veterinary Clinic"}</h1><p className="mt-1 text-xs text-slate-500">VETERINARY PRESCRIPTION</p>{clinic?.website_url && <p className="mt-1 break-all text-xs text-slate-500">{clinic.website_url}</p>}</div>
                </div>
                <div className="shrink-0 text-left text-xs leading-6"><b>{formatDate(visit.visit_date)}</b><br />{formatTime(visit.visit_date)}<br />{clinic?.doctor_name || "Veterinarian"}</div>
              </header>
              <section className="mt-6 grid grid-cols-2 gap-x-8 gap-y-3 border-b border-slate-200 pb-5 text-sm">
                <div><span className="text-slate-500">Pet / الحيوان</span><div className="mt-1 font-bold">{pet.name}</div></div>
                <div><span className="text-slate-500">Owner / المالك</span><div className="mt-1 font-bold">{client.name}</div></div>
                <div><span className="text-slate-500">Clinical signs / العلامات</span><div className="mt-1 whitespace-pre-wrap font-semibold">{visit.examination || visit.reason || "—"}</div></div>
                <div><span className="text-slate-500">Diagnosis / التشخيص</span><div className="mt-1 whitespace-pre-wrap font-semibold">{visit.diagnosis || "—"}</div></div>
                <div><span className="text-slate-500">Temperature / الحرارة</span><div className="mt-1 font-semibold">{visit.temperature != null ? `${formatNumber(visit.temperature, 1)} °C` : "—"}</div></div>
                <div><span className="text-slate-500">Follow-up / المتابعة</span><div className="mt-1 whitespace-pre-wrap font-semibold">{followUpData.followUp || "—"}</div></div>
              </section>
              <section className="mt-6 flex-1">
                <h2 className="border-b border-slate-300 pb-2 text-base font-black">PRESCRIPTION / العلاج</h2>
                {medicationRows.length ? <div className="mt-3 space-y-3">{medicationRows.map(({ row, medication }, index) => <article key={row.id} className="break-inside-avoid border-b border-slate-100 pb-3 text-sm leading-6">
                  <h3 className="font-bold">{index + 1}. {medication?.name || "Medication"}</h3>
                  <p>{[row.calculated_dose != null ? `${formatNumber(row.calculated_dose)} ${row.calculated_dose_unit || ""}` : "", row.calculated_volume != null ? `${formatNumber(row.calculated_volume)} ${row.volume_unit || "mL"}` : "", row.route, row.frequency, row.duration_days != null ? `${row.duration_days} days` : ""].filter(Boolean).join(" · ")}</p>
                  {row.instructions && <p className="whitespace-pre-wrap text-slate-600">{row.instructions}</p>}
                </article>)}</div> : treatmentNotes ? <p className="mt-3 whitespace-pre-wrap text-sm leading-7">{treatmentNotes}</p> : !humanMedications.length ? <p className="mt-3">—</p> : null}
                <HumanMedicationList entries={humanMedications} ar />
                {vaccinations.length > 0 && <p className="mt-5 text-sm leading-6"><b>Vaccination / التطعيمات:</b> {vaccinations.map((item) => item.vaccine_name).filter(Boolean).join("، ")}</p>}
              </section>
              <footer className="mt-10 flex justify-between gap-8 border-t border-slate-200 pt-5 text-xs text-slate-600"><span>Veterinarian: {clinic?.doctor_name || "VETRA Veterinarian"}</span><span>{clinic?.display_name || clinic?.clinic_name || "VETRA Veterinary Clinic"}</span></footer>
            </div>
            <svg className="pointer-events-none absolute inset-x-0 top-0 h-36 w-full" viewBox="0 0 794 144" preserveAspectRatio="none" aria-hidden="true">
              <path d="M0 0H794C560 16 270 19 0 132Z" fill="#1764a3" />
              <path d="M0 0H794C590 28 305 32 0 150Z" fill="#67b75d" />
              <path d="M0 0H610C392 26 180 58 0 138Z" fill="#4f8ec9" />
            </svg>
            <div className="rx-header relative z-10 mb-8 grid gap-5 border-b border-slate-200 pb-5 pt-10 sm:grid-cols-[0.9fr_1.1fr] sm:gap-7 sm:pt-12">
              <div className="flex items-center gap-3 sm:gap-5">
                {clinic?.logo_url ? <img src={clinic.logo_url} crossOrigin="anonymous" alt={clinic.display_name || clinic.clinic_name || "Clinic logo"} className="h-16 w-16 shrink-0 rounded-lg object-contain sm:h-24 sm:w-24" /> : <Image src="/vetra-logo-light.png" alt="VETRA" width={180} height={150} className="h-16 w-16 shrink-0 object-contain sm:h-24 sm:w-24" />}
                <div className="min-w-0"><div className="text-xl font-black tracking-tight text-slate-950 sm:text-3xl">{clinic?.display_name || clinic?.clinic_name || "VETRA"}</div><div className="mt-1 text-[10px] font-semibold tracking-[.18em] text-slate-500 sm:text-xs">VETERINARY CLINIC</div>{clinic?.website_url && <a href={clinic.website_url} target="_blank" rel="noreferrer" className="mt-2 block truncate text-xs font-bold text-emerald-700 sm:text-sm">{clinic.website_url}</a>}</div>
              </div>
              <div className="border-t-2 border-slate-900 pt-3 text-right sm:border-r-2 sm:border-t-0 sm:pr-5 sm:pt-0">
                <div className="text-[10px] font-bold tracking-wider text-slate-400">VISIT / الزيارة</div>
                <div className="mt-1 text-sm font-black text-slate-900 sm:text-base">{formatDate(visit.visit_date)} · {formatTime(visit.visit_date)}</div>
                <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs sm:text-sm">
                  <Info label="PET / الحيوان" value={pet.name} />
                  <Info label="OWNER / المالك" value={client.name} />
                  <Info label="SPECIES / النوع" value={speciesLabel(pet.species)} />
                  <Info label="BREED / السلالة" value={pet.breed || "-"} />
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-bold text-slate-400">PATIENT / المريض</div>
                  <div className="mt-1 text-2xl font-black">{pet.name}</div>
                </div>
                <div className="rounded-full bg-slate-900 px-4 py-2 text-xs font-bold text-white">
                  {speciesLabel(pet.species)}
                </div>
              </div>

              <div className="patient-grid grid grid-cols-2 gap-2 text-sm sm:grid-cols-4 sm:gap-3">
                <Info label="Owner / المالك" value={client.name} />
                <Info label="Gender / النوع" value={genderLabel(pet.gender)} />
                <Info label="Birth date / الميلاد" value={pet.birth_date ? formatDate(pet.birth_date) : "-"} />
                <Info label="Microchip" value={pet.microchip || "-"} />
              </div>
            </div>

            <div className="vital-grid mt-4 grid grid-cols-2 gap-2 sm:mt-5 sm:grid-cols-4 sm:gap-3">
              <Vital label="Weight / الوزن" value={visit.weight != null ? `${formatNumber(visit.weight)} kg` : "-"} />
              <Vital label="Temperature / الحرارة" value={visit.temperature != null ? `${formatNumber(visit.temperature, 1)} °C` : "-"} />
              <Vital label="Pulse / النبض" value={visit.heart_rate != null ? `${formatNumber(visit.heart_rate)} bpm` : "-"} />
              <Vital label="Respiration / التنفس" value={visit.respiratory_rate != null ? `${formatNumber(visit.respiratory_rate)} /min` : "-"} />
            </div>

            {visit.reason && (
              <Section title="Reason for Visit / سبب الزيارة">
                <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">{visit.reason}</p>
              </Section>
            )}

            <Section title="Diagnosis / التشخيص">
              <p className="whitespace-pre-wrap text-base font-bold leading-8 text-slate-900">{visit.diagnosis || "-"}</p>
            </Section>

            {visit.examination && (
              <Section title="Examination / الفحص">
                <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">{visit.examination}</p>
              </Section>
            )}

            {medicationRows.length > 0 && (
              <Section title="Treatment / العلاج">
                <div className="rx-mobile-meds space-y-2 sm:hidden">
                  {medicationRows.map(({ row, medication }) => <article key={row.id} className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="font-bold text-slate-900">{medication?.name || "Medication"}</div>
                    {medication?.active_ingredient && <div className="mt-0.5 text-[10px] text-slate-500">{medication.active_ingredient}</div>}
                    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-700">
                      <span><b>Dose:</b> {row.calculated_dose != null ? `${formatNumber(row.calculated_dose)} ${row.calculated_dose_unit || ""}` : "-"}{row.calculated_volume != null ? ` (${formatNumber(row.calculated_volume)} ${row.volume_unit || "mL"})` : ""}</span>
                      <span><b>Route:</b> {row.route || "-"}</span><span><b>Frequency:</b> {row.frequency || "-"}</span><span><b>Duration:</b> {row.duration_days != null ? `${row.duration_days} d` : "-"}</span>
                    </div>
                    {row.instructions && <p className="mt-2 whitespace-pre-wrap text-[10px] leading-5 text-slate-500">{row.instructions}</p>}
                  </article>)}
                </div>
                <div className="rx-med-table hidden overflow-hidden rounded-2xl border border-slate-200 sm:block">
                  <table className="w-full border-collapse text-right text-xs">
                    <thead>
                      <tr className="bg-slate-900 text-white">
                        <th className="px-3 py-3">Medication / الدواء</th>
                        <th className="px-3 py-3">Dose / الجرعة</th>
                        <th className="px-3 py-3">Route / الطريق</th>
                        <th className="px-3 py-3">Frequency / التكرار</th>
                        <th className="px-3 py-3">Duration / المدة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {medicationRows.map(({ row, medication }, index) => (
                        <tr key={row.id} className={index % 2 ? "bg-slate-50" : "bg-white"}>
                          <td className="px-3 py-3 align-top">
                            <div className="font-bold text-slate-900">{medication?.name || "Medication"}</div>
                            {medication?.active_ingredient && (
                              <div className="mt-0.5 text-[10px] text-slate-500">{medication.active_ingredient}</div>
                            )}
                            {row.instructions && (
                              <div className="mt-2 whitespace-pre-wrap text-[10px] leading-5 text-slate-500">{row.instructions}</div>
                            )}
                          </td>
                          <td className="px-3 py-3 align-top font-semibold">
                            {row.calculated_dose != null
                              ? `${formatNumber(row.calculated_dose)} ${row.calculated_dose_unit || ""}`
                              : "-"}
                            {row.calculated_volume != null && (
                              <div className="mt-1 text-[10px] text-slate-500">
                                {formatNumber(row.calculated_volume)} {row.volume_unit || "mL"}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-3 align-top">{row.route || "-"}</td>
                          <td className="px-3 py-3 align-top">{row.frequency || "-"}</td>
                          <td className="px-3 py-3 align-top">{row.duration_days != null ? `${row.duration_days} d` : "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            )}

            {medicationRows.length === 0 && treatmentNotes && (
              <Section title="Treatment / العلاج">
                <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">{treatmentNotes}</p>
              </Section>
            )}

            <HumanMedicationList entries={humanMedications} ar />

            {vaccinations.length > 0 && (
              <Section title="Vaccination / التطعيمات">
                <div className="space-y-2">
                  {vaccinations.map((item) => (
                    <div key={item.id} className="rounded-xl border border-slate-200 px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-bold">{item.vaccine_name}</div>
                          <div className="mt-1 text-[11px] text-slate-500">
                            {[item.vaccine_type, item.dose ? `Dose: ${item.dose}` : "", item.route].filter(Boolean).join(" - ")}
                          </div>
                        </div>
                        {item.next_dose_at && (
                          <div className="text-left text-[11px] font-semibold text-blue-700">
                            Next dose / الجرعة القادمة
                            <div className="mt-0.5">{formatDate(item.next_dose_at)}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {followUpData.followUp && (
              <Section title="Follow-up / المتابعة">
                <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-900">
                  {followUpData.followUp}
                </div>
              </Section>
            )}

            {followUpData.notes && (
              <Section title="Notes / ملاحظات">
                <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">{followUpData.notes}</p>
              </Section>
            )}

            <div className="mt-10 grid grid-cols-2 gap-8 border-t border-slate-200 pt-6 text-sm">
              <div>
                <div className="text-xs font-bold text-slate-400">VETERINARIAN / الطبيب البيطري</div>
                <div className="mt-3 text-base font-bold text-slate-900">{clinic?.doctor_name || "VETRA Veterinarian"}</div>
              </div>
              <div className="text-left">
                <div className="text-xs font-bold text-slate-400">CLINIC / العيادة</div>
                <div className="mt-3 text-base font-bold text-slate-900">{clinic?.display_name || clinic?.clinic_name || "VETRA Veterinary Clinic"}</div>
                {clinic?.website_url && <div className="mt-1 text-xs text-slate-600">{clinic.website_url}</div>}
              </div>
            </div>

            <div className="relative mt-10 overflow-hidden border-t border-slate-200 px-4 pb-5 pt-12 text-center text-xs text-slate-600 sm:px-8">
              <svg className="pointer-events-none absolute inset-x-0 bottom-0 h-16 w-full" viewBox="0 0 794 80" preserveAspectRatio="none" aria-hidden="true"><path d="M0 0C240 42 540 68 794 12V80H0Z" fill="#1764a3"/><path d="M0 18C230 55 560 80 794 32V80H0Z" fill="#68b75b"/><path d="M0 44C280 70 560 84 794 51V80H0Z" fill="#4f8ec9"/></svg>
              <div className="relative z-10 pb-9 font-semibold">VETRA · The vet you trust · Please follow your veterinarian’s instructions.</div>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="font-bold">الخطوة التالية</div>
            <div className="mt-1 text-sm text-slate-500">بعد حفظ/مشاركة الروشتة، نقدر نكمل للفواتير.</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={openWhatsAppText}
              className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700"
            >
              WhatsApp Text
            </button>
            <button
              type="button"
              onClick={() =>
                router.push(
                  `/invoices/new?client=${encodeURIComponent(client.id)}&pet=${encodeURIComponent(pet.id)}&visit=${encodeURIComponent(visit.id)}`
                )
              }
              className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white"
            >
              Continue to Invoice →
            </button>
          </div>
        </div>
      </div>

      <style jsx global>{`
        .prescription-sheet {
          min-height: 1123px;
        }

        @media screen and (max-width: 639px) {
          .prescription-sheet { min-height: 0; }
        }

        .prescription-pdf-layout {
          width: 794px !important;
          max-width: none !important;
          height: auto !important;
          min-height: 1123px !important;
          overflow: visible !important;
          padding: 38px 42px !important;
        }
        .prescription-pdf-layout > :not(.rx-print-template):not(.rx-print-content) { display: none !important; }
        .prescription-pdf-layout .rx-print-content { display: flex !important; flex-direction: column !important; }

        @media print {
          @page {
            size: A4;
            margin: 0;
          }

          html,
          body {
            background: #ffffff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          body * {
            visibility: hidden !important;
          }

          .prescription-sheet,
          .prescription-sheet * {
            visibility: visible !important;
          }

          .prescription-sheet {
            position: absolute;
            inset: 0;
            width: 794px !important;
            height: auto !important;
            min-height: 1123px !important;
            overflow: visible !important;
            margin: 0 !important;
            padding: 38px 42px !important;
            box-shadow: none !important;
          }

          .prescription-sheet > :not(.rx-print-template):not(.rx-print-content) {
            display: none !important;
          }
          .prescription-sheet .rx-print-content { display: flex !important; flex-direction: column !important; }

          .prescription-sheet table {
            break-inside: auto;
          }

          .prescription-sheet tr,
          .prescription-sheet section,
          .prescription-sheet .rounded-2xl {
            break-inside: avoid;
          }
        }
      `}</style>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-semibold text-slate-400">{label}</div>
      <div className="mt-1 break-words font-bold text-slate-800">{value}</div>
    </div>
  );
}

function Vital({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 text-center">
      <div className="text-[10px] font-semibold text-slate-400">{label}</div>
      <div className="mt-2 text-lg font-black text-slate-900">{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-5">
      <div className="mb-2 text-sm font-black text-slate-900">{title}</div>
      {children}
    </section>
  );
}
