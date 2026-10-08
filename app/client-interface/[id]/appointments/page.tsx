"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getClientPortalDb } from "@/lib/client-portal-db";

type Lang = "ar" | "en";

type Client = {
  id: string;
  clinic_id: string;
  name: string;
  phone: string | null;
  email: string | null;
};

type Pet = {
  id: string;
  name: string;
  species: string;
  breed: string | null;
};

type Status =
  | "pending"
  | "confirmed"
  | "arrived"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "no_show";

type Appointment = {
  id: string;
  clinic_id: string;
  client_id: string;
  pet_id: string;
  appointment_date: string;
  start_time: string;
  end_time: string;
  reason: string | null;
  status: Status;
  notes: string | null;
  source: "clinic" | "client_portal";
  created_at: string;
  pet?: Pet | null;
};

type Settings = {
  id: string;
  clinic_id: string;
  online_booking_enabled: boolean;
  today_booking_enabled: boolean;
  client_cancellation_enabled: boolean;
  client_rescheduling_enabled: boolean;
  no_show_grace_minutes: number;
  booking_start_time: string;
  booking_end_time: string;
  default_duration_minutes: number;
};

const T = {
  ar: {
    title: "مواعيدي",
    subtitle: "احجز، راجع أو عدّل مواعيدك مع العيادة",
    back: "العودة للرئيسية",
    book: "احجز موعد",
    upcoming: "القادمة",
    past: "السابقة",
    noAppointments: "مفيش مواعيد لحد دلوقتي",
    noAppointmentsHint: "لما تحجز موعد جديد هيظهر هنا.",
    bookingClosed: "الحجز الإلكتروني مغلق حاليًا",
    bookingClosedHint: "العيادة أوقفت استقبال الحجوزات من Client Interface.",
    todayClosed: "الحجز لليوم مغلق",
    todayClosedHint: "اختار تاريخًا لاحقًا للحجز.",
    pet: "الحيوان",
    choosePet: "اختار الحيوان",
    date: "التاريخ",
    time: "الوقت",
    chooseTime: "اختار ميعاد مناسب",
    reason: "سبب الزيارة",
    reasonPlaceholder: "كشف، تطعيم، متابعة...",
    notes: "ملاحظات",
    notesPlaceholder: "أي ملاحظات تحب تبلغها للعيادة...",
    duration: "المدة",
    minutes: "دقيقة",
    save: "تأكيد الحجز",
    update: "حفظ التعديل",
    saving: "جاري الحفظ...",
    cancel: "إلغاء",
    cancelAppointment: "إلغاء الموعد",
    reschedule: "تعديل الموعد",
    details: "تفاصيل الموعد",
    pending: "في انتظار التأكيد",
    confirmed: "مؤكد",
    arrived: "تم تسجيل الحضور",
    inProgress: "جاري الكشف",
    completed: "تم الكشف",
    cancelled: "ملغي",
    noShow: "لم يحضر",
    sourceClinic: "العيادة",
    sourcePortal: "أنت حجزت الموعد",
    from: "من",
    to: "إلى",
    close: "إغلاق",
    confirmCancel: "متأكد إنك عايز تلغي الموعد؟",
    cancelHint: "إلغاء الموعد مش هيحذف السجل من النظام.",
    keep: "لا، احتفظ به",
    yesCancel: "أيوه، إلغاء",
    noSlots: "مفيش مواعيد متاحة في اليوم ده",
    noSlotsHint: "جرّب يوم تاني أو اختار تاريخًا مختلفًا.",
    loading: "جاري تحميل المواعيد...",
    error: "تعذر تحميل المواعيد",
    retry: "حاول مرة تانية",
    missingPet: "لازم يكون عندك حيوان مسجل للحجز.",
    chooseDate: "اختار تاريخ",
    selected: "تم الاختيار",
    dateUnavailable: "الحجز غير متاح في التاريخ ده",
    successBook: "تم إرسال طلب الحجز للعيادة ✅",
    successEdit: "تم تعديل الموعد ✅",
    successCancel: "تم إلغاء الموعد.",
    clinic: "العيادة",
    status: "الحالة",
    upcomingEmpty: "مفيش مواعيد قادمة.",
    pastEmpty: "مفيش مواعيد سابقة.",
    retryLater: "جرّب بعد شوية.",
    english: "English",
  },
  en: {
    title: "My Appointments",
    subtitle: "Book, review, or reschedule your clinic appointments",
    back: "Back home",
    book: "Book appointment",
    upcoming: "Upcoming",
    past: "Past",
    noAppointments: "No appointments yet",
    noAppointmentsHint: "Your new appointment will appear here.",
    bookingClosed: "Online booking is currently closed",
    bookingClosedHint: "The clinic is not accepting Client Interface bookings right now.",
    todayClosed: "Booking for today is closed",
    todayClosedHint: "Choose a later date.",
    pet: "Pet",
    choosePet: "Choose pet",
    date: "Date",
    time: "Time",
    chooseTime: "Choose an available time",
    reason: "Reason",
    reasonPlaceholder: "Check-up, vaccination, follow-up...",
    notes: "Notes",
    notesPlaceholder: "Anything you want the clinic to know...",
    duration: "Duration",
    minutes: "min",
    save: "Confirm booking",
    update: "Save changes",
    saving: "Saving...",
    cancel: "Cancel",
    cancelAppointment: "Cancel appointment",
    reschedule: "Reschedule",
    details: "Appointment details",
    pending: "Awaiting confirmation",
    confirmed: "Confirmed",
    arrived: "Checked in",
    inProgress: "In progress",
    completed: "Completed",
    cancelled: "Cancelled",
    noShow: "No-show",
    sourceClinic: "Clinic",
    sourcePortal: "Booked by you",
    from: "From",
    to: "To",
    close: "Close",
    confirmCancel: "Are you sure you want to cancel this appointment?",
    cancelHint: "Cancelling keeps the appointment in the clinic history.",
    keep: "No, keep it",
    yesCancel: "Yes, cancel",
    noSlots: "No available appointments on this date",
    noSlotsHint: "Try another day.",
    loading: "Loading appointments...",
    error: "We couldn't load appointments",
    retry: "Try again",
    missingPet: "You need at least one registered pet to book.",
    chooseDate: "Choose a date",
    selected: "Selected",
    dateUnavailable: "Booking is not available for this date",
    successBook: "Booking request sent to the clinic ✅",
    successEdit: "Appointment updated ✅",
    successCancel: "Appointment cancelled.",
    clinic: "Clinic",
    status: "Status",
    upcomingEmpty: "No upcoming appointments.",
    pastEmpty: "No past appointments.",
    retryLater: "Please try again later.",
    english: "العربية",
  },
} as const;

const activeStatuses: Status[] = [
  "pending",
  "confirmed",
  "arrived",
  "in_progress",
];

const formatDate = (value: string, lang: Lang) =>
  new Date(`${value}T12:00:00`).toLocaleDateString(
    lang === "ar" ? "ar-EG" : "en-US",
    { weekday: "short", day: "numeric", month: "short", year: "numeric" }
  );

const formatTime = (value: string) => value.slice(0, 5);

const todayDate = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const addMinutes = (time: string, minutes: number) => {
  const [hours, mins] = time.split(":").map(Number);
  const total = hours * 60 + mins + minutes;
  const hh = String(Math.floor(total / 60)).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}`;
};

const toMinutes = (time: string) => {
  const [hours, minutes] = time.slice(0, 5).split(":").map(Number);
  return hours * 60 + minutes;
};

function getOwnerSession() {
  const read = (storage: Storage) => ({
    id: storage.getItem("vetra-client-id"),
    code: storage.getItem("vetra-client-code"),
    phone: storage.getItem("vetra-client-phone"),
  });

  const persistent = read(window.localStorage);
  if (persistent.id && persistent.code && persistent.phone) return persistent;

  const legacy = read(window.sessionStorage);
  if (legacy.id && legacy.code && legacy.phone) {
    window.localStorage.setItem("vetra-client-id", legacy.id);
    window.localStorage.setItem("vetra-client-code", legacy.code);
    window.localStorage.setItem("vetra-client-phone", legacy.phone);
    return legacy;
  }

  return { id: null, code: null, phone: null };
}

function statusText(status: Status, t: (typeof T)[Lang]) {
  switch (status) {
    case "pending":
      return t.pending;
    case "confirmed":
      return t.confirmed;
    case "arrived":
      return t.arrived;
    case "in_progress":
      return t.inProgress;
    case "completed":
      return t.completed;
    case "cancelled":
      return t.cancelled;
    case "no_show":
      return t.noShow;
  }
}

function petIcon(species: string) {
  const value = species.toLowerCase();
  if (value.includes("cat") || value.includes("قط")) return "🐱";
  if (value.includes("dog") || value.includes("كلب")) return "🐶";
  return "🐾";
}

function statusClasses(status: Status, dark: boolean) {
  if (dark) {
    return {
      pending: "border-white/10 bg-white/[.04] text-slate-300",
      confirmed: "border-blue-400/20 bg-blue-400/10 text-blue-300",
      arrived: "border-amber-400/20 bg-amber-400/10 text-amber-300",
      in_progress: "border-cyan-400/20 bg-cyan-400/10 text-cyan-300",
      completed: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
      cancelled: "border-rose-400/20 bg-rose-400/10 text-rose-300",
      no_show: "border-orange-400/20 bg-orange-400/10 text-orange-300",
    }[status];
  }

  return {
    pending: "border-slate-200 bg-slate-50 text-slate-600",
    confirmed: "border-blue-100 bg-blue-50 text-blue-700",
    arrived: "border-amber-100 bg-amber-50 text-amber-700",
    in_progress: "border-cyan-100 bg-cyan-50 text-cyan-700",
    completed: "border-emerald-100 bg-emerald-50 text-emerald-700",
    cancelled: "border-rose-100 bg-rose-50 text-rose-700",
    no_show: "border-orange-100 bg-orange-50 text-orange-700",
  }[status];
}

export default function ClientAppointmentsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const clientId = params.id;

  const [lang, setLang] = useState<Lang>("ar");
  const [dark, setDark] = useState(true);
  const [client, setClient] = useState<Client | null>(null);
  const [pets, setPets] = useState<Pet[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [banner, setBanner] = useState("");
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");

  const [modal, setModal] = useState<"book" | "cancel" | null>(null);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [selectedAppointment, setSelectedAppointment] =
    useState<Appointment | null>(null);

  const [petId, setPetId] = useState("");
  const [appointmentDate, setAppointmentDate] = useState(todayDate());
  const [startTime, setStartTime] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const t = T[lang];

  useEffect(() => {
    const savedLang = localStorage.getItem("vetra-language");
    const savedTheme = localStorage.getItem("vetra-theme");
    if (savedLang === "ar" || savedLang === "en") setLang(savedLang);
    if (savedTheme === "light") setDark(false);
    if (savedTheme === "dark") setDark(true);
  }, []);

  const load = async (withLoader = true) => {
    if (!clientId) return;

    const session = getOwnerSession();
    if (!session.id || session.id !== clientId || !session.code || !session.phone) {
      router.replace("/client-interface/login");
      return;
    }

    if (withLoader) setLoading(true);
    setError("");

    try {
      const db = await getClientPortalDb(session.code, session.phone);

      const [clientRes, petsRes, appointmentRes] =
        await Promise.all([
          db
            .from("clients")
            .select("id,clinic_id,name,phone,email")
            .eq("id", clientId)
            .maybeSingle(),
          db
            .from("pets")
            .select("id,name,species,breed")
            .eq("client_id", clientId)
            .order("created_at", { ascending: false }),
          db
            .from("appointments")
            .select(
              "id,clinic_id,client_id,pet_id,appointment_date,start_time,end_time,reason,status,notes,source,created_at"
            )
            .eq("client_id", clientId)
            .order("appointment_date", { ascending: false })
            .order("start_time", { ascending: false }),
        ]);

      if (clientRes.error || !clientRes.data) {
        throw new Error(clientRes.error?.message || "Client not found.");
      }
      const bookingSettingsRes = await db.rpc("vetra_client_booking_settings", {
        p_clinic_id: (clientRes.data as Client).clinic_id,
      });

      const settingsData = Array.isArray(bookingSettingsRes.data)
        ? bookingSettingsRes.data[0] || null
        : bookingSettingsRes.data || null;

      if (bookingSettingsRes.error) {
        throw new Error(bookingSettingsRes.error.message);
      }

      if (petsRes.error) throw new Error(petsRes.error.message);
      if (appointmentRes.error) throw new Error(appointmentRes.error.message);

      const loadedPets = (petsRes.data || []) as Pet[];
      const loadedAppointments = (appointmentRes.data || []).map((appointment) => ({
        ...(appointment as Appointment),
        pet: loadedPets.find((pet) => pet.id === appointment.pet_id) || null,
      }));

      if (!settingsData) {
        throw new Error(
          "Appointment booking settings are not configured for this clinic."
        );
      }

      setClient(clientRes.data as Client);
      setPets(loadedPets);
      setSettings(settingsData as Settings);
      setAppointments(loadedAppointments);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.retryLater);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [clientId]);

  const today = todayDate();

  const canBook = Boolean(
    settings?.online_booking_enabled &&
      (appointmentDate !== today || settings?.today_booking_enabled)
  );

  const upcoming = useMemo(
    () =>
      appointments.filter(
        (a) => a.appointment_date >= today && a.status !== "cancelled" && a.status !== "no_show"
      ),
    [appointments, today]
  );

  const past = useMemo(
    () =>
      appointments.filter(
        (a) =>
          a.appointment_date < today ||
          ["completed", "cancelled", "no_show"].includes(a.status)
      ),
    [appointments, today]
  );

  const loadSlots = async (date: string, excludeAppointmentId?: string | null) => {
    setAvailableSlots([]);
    if (!settings?.online_booking_enabled || !client?.clinic_id || !date) return;

    if (date === today && !settings.today_booking_enabled) return;

    setLoadingSlots(true);
    try {
      const session = getOwnerSession();
      if (!session.code || !session.phone) {
        router.replace("/client-interface/login");
        return;
      }

      const db = await getClientPortalDb(session.code, session.phone);
      const result = await db.rpc("vetra_client_available_slots", {
        p_clinic_id: client.clinic_id,
        p_date: date,
        p_exclude_appointment_id: excludeAppointmentId || null,
      });

      if (result.error) throw new Error(result.error.message);

      const slots = Array.isArray(result.data)
        ? result.data.map((row: { start_time: string }) => formatTime(row.start_time))
        : [];

      setAvailableSlots(slots);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.retryLater);
    } finally {
      setLoadingSlots(false);
    }
  };

  useEffect(() => {
    if (modal === "book") {
      void loadSlots(appointmentDate, editing?.id || null);
    }
  }, [
    modal,
    appointmentDate,
    editing?.id,
    settings?.online_booking_enabled,
    settings?.today_booking_enabled,
    client?.clinic_id,
  ]);

  const openBooking = (appointment?: Appointment) => {
    setBanner("");
    setError("");
    setEditing(appointment || null);
    setPetId(appointment?.pet_id || pets[0]?.id || "");
    setAppointmentDate(appointment?.appointment_date || today);
    setStartTime(appointment ? formatTime(appointment.start_time) : "");
    setReason(appointment?.reason || "");
    setNotes(appointment?.notes || "");
    setModal("book");
  };

  const closeModal = () => {
    if (saving) return;
    setModal(null);
    setEditing(null);
    setSelectedAppointment(null);
  };

  async function saveBooking() {
    setError("");
    setBanner("");

    if (!settings?.online_booking_enabled) {
      setError(t.bookingClosed);
      return;
    }

    if (!petId) {
      setError(t.missingPet);
      return;
    }

    if (!appointmentDate || !startTime) {
      setError(`${t.chooseDate} / ${t.chooseTime}`);
      return;
    }

    if (appointmentDate < today) {
      setError(t.dateUnavailable);
      return;
    }

    if (appointmentDate === today && !settings.today_booking_enabled) {
      setError(t.todayClosed);
      return;
    }

    if (editing && !settings.client_rescheduling_enabled) {
      setError(t.bookingClosed);
      return;
    }

    const duration = settings.default_duration_minutes || 30;
    const endTime = addMinutes(startTime, duration);

    if (!availableSlots.includes(startTime) && (!editing || startTime !== formatTime(editing.start_time))) {
      setError(t.noSlots);
      return;
    }

    const selectedPet = pets.find((p) => p.id === petId);
    if (!selectedPet) {
      setError(t.missingPet);
      return;
    }

    setSaving(true);

    try {
      const session = getOwnerSession();
      if (!session.code || !session.phone) {
        router.replace("/client-interface/login");
        return;
      }

      const db = await getClientPortalDb(session.code, session.phone);

      if (editing) {
        const res = await db
          .from("appointments")
          .update({
            pet_id: petId,
            appointment_date: appointmentDate,
            start_time: startTime,
            end_time: endTime,
            reason: reason.trim() || null,
            notes: notes.trim() || null,
          })
          .eq("id", editing.id)
          .eq("client_id", clientId);

        if (res.error) throw new Error(res.error.message);

        setBanner(t.successEdit);
      } else {
        if (!client?.clinic_id) throw new Error(t.retryLater);

        const res = await db.from("appointments").insert({
          clinic_id: client.clinic_id,
          client_id: clientId,
          pet_id: petId,
          appointment_date: appointmentDate,
          start_time: startTime,
          end_time: endTime,
          reason: reason.trim() || null,
          notes: notes.trim() || null,
          status: "pending",
          source: "client_portal",
        });

        if (res.error) throw new Error(res.error.message);

        setBanner(t.successBook);
      }

      closeModal();
      await load(false);
    } catch (e) {
      const raw = e instanceof Error ? e.message : "";
      setError(
        raw.includes("appointments_no_overlap")
          ? t.noSlots
          : raw || t.retryLater
      );
    } finally {
      setSaving(false);
    }
  }

  async function cancelAppointment() {
    if (!selectedAppointment) return;
    setSaving(true);
    setError("");
    setBanner("");

    try {
      const session = getOwnerSession();
      if (!session.code || !session.phone) {
        router.replace("/client-interface/login");
        return;
      }

      const db = await getClientPortalDb(session.code, session.phone);

      const res = await db
        .from("appointments")
        .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
        .eq("id", selectedAppointment.id)
        .eq("client_id", clientId);

      if (res.error) throw new Error(res.error.message);

      setBanner(t.successCancel);
      setModal(null);
      setSelectedAppointment(null);
      await load(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.retryLater);
    } finally {
      setSaving(false);
    }
  }

  const displayAppointments = tab === "upcoming" ? upcoming : past;

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#06101a] px-6 text-white">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-cyan-400/10 text-3xl">
            🐾
          </div>
          <p className="text-sm font-bold text-slate-400">{t.loading}</p>
        </div>
      </main>
    );
  }

  if (error && !client) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#06101a] px-6 text-white">
        <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-white/[.04] p-8 text-center">
          <div className="text-5xl">📅</div>
          <h1 className="mt-4 text-2xl font-black">{t.error}</h1>
          <p className="mt-3 text-sm text-slate-400">{error}</p>
          <button
            onClick={() => void load()}
            className="mt-6 rounded-2xl bg-cyan-400 px-6 py-3 text-sm font-black text-slate-950"
          >
            {t.retry}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main
      dir={lang === "ar" ? "rtl" : "ltr"}
      className={
        dark
          ? "min-h-screen overflow-x-hidden bg-[#06101a] text-white"
          : "min-h-screen overflow-x-hidden bg-[#f5f9fc] text-slate-900"
      }
    >
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div
          className={
            dark
              ? "absolute -right-24 -top-24 h-80 w-80 rounded-full bg-cyan-400/10 blur-3xl"
              : "absolute -right-24 -top-24 h-80 w-80 rounded-full bg-cyan-300/25 blur-3xl"
          }
        />
        <div
          className={
            dark
              ? "absolute -left-24 top-1/3 h-96 w-96 rounded-full bg-violet-500/10 blur-3xl"
              : "absolute -left-24 top-1/3 h-96 w-96 rounded-full bg-violet-300/20 blur-3xl"
          }
        />
      </div>

      <div className="relative z-10 mx-auto max-w-5xl px-4 pb-28 pt-5 sm:px-6 lg:px-8">
        <header className="mb-6 flex items-center justify-between gap-3">
          <button
            onClick={() => router.push(`/client-interface/${clientId}`)}
            className={
              dark
                ? "rounded-2xl border border-white/10 bg-white/[.04] px-4 py-2.5 text-xs font-black text-slate-300"
                : "rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black text-slate-700"
            }
          >
            ← {t.back}
          </button>

          <div className="text-center">
            <div className="text-xs font-bold tracking-[.18em] text-cyan-400">
              VETRA
            </div>
            <h1 className="mt-1 text-2xl font-black">{t.title}</h1>
          </div>

          <button
            onClick={() => {
              const next = lang === "ar" ? "en" : "ar";
              setLang(next);
              localStorage.setItem("vetra-language", next);
            }}
            className={
              dark
                ? "rounded-full border border-white/10 bg-white/[.04] px-3 py-2 text-xs font-bold"
                : "rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-bold"
            }
          >
            {t.english}
          </button>
        </header>

        <section
          className={
            dark
              ? "rounded-[2rem] border border-white/[.07] bg-gradient-to-br from-white/[.08] to-white/[.03] p-5 shadow-2xl sm:p-7"
              : "rounded-[2rem] border border-slate-100 bg-white p-5 shadow-2xl sm:p-7"
          }
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-bold text-cyan-400">{client?.name}</p>
              <h2 className="mt-1 text-3xl font-black">{t.subtitle}</h2>
            </div>
            <button
              onClick={() => openBooking()}
              disabled={!pets.length || settings?.online_booking_enabled !== true}
              className="rounded-2xl bg-gradient-to-r from-cyan-400 to-violet-500 px-5 py-3.5 text-sm font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
              title={settings?.online_booking_enabled === false ? t.bookingClosed : undefined}
            >
              ＋ {settings?.online_booking_enabled === false ? t.bookingClosed : t.book}
            </button>
          </div>

          {banner && (
            <div className="mt-5 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm font-bold text-emerald-300">
              {banner}
            </div>
          )}

          {error && (
            <div className="mt-5 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm font-bold text-rose-300">
              {error}
            </div>
          )}

          {settings && !settings.online_booking_enabled && (
            <div className="mt-5 rounded-[1.6rem] border border-amber-400/15 bg-amber-400/[.06] p-5">
              <div className="text-2xl">🔒</div>
              <div className="mt-2 text-lg font-black">{t.bookingClosed}</div>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                {t.bookingClosedHint}
              </p>
            </div>
          )}

          {!pets.length && (
            <div className="mt-5 rounded-[1.6rem] border border-dashed border-cyan-400/20 bg-cyan-400/[.04] p-5">
              <div className="text-2xl">🐾</div>
              <div className="mt-2 font-black">{t.missingPet}</div>
              <button
                onClick={() => router.push(`/client-interface/${clientId}`)}
                className="mt-3 rounded-2xl bg-cyan-400 px-4 py-2.5 text-xs font-black text-slate-950"
              >
                {t.back}
              </button>
            </div>
          )}
        </section>

        <div className="mt-5 flex gap-2">
          {(["upcoming", "past"] as const).map((key) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={
                tab === key
                  ? "rounded-2xl bg-cyan-400 px-4 py-2.5 text-xs font-black text-slate-950"
                  : dark
                    ? "rounded-2xl border border-white/10 bg-white/[.04] px-4 py-2.5 text-xs font-bold text-slate-400"
                    : "rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600"
              }
            >
              {key === "upcoming" ? t.upcoming : t.past}
            </button>
          ))}
        </div>

        <section className="mt-4 space-y-3">
          {!displayAppointments.length && (
            <div
              className={
                dark
                  ? "rounded-[2rem] border border-white/[.07] bg-white/[.035] p-10 text-center"
                  : "rounded-[2rem] border border-slate-100 bg-white p-10 text-center"
              }
            >
              <div className="text-5xl">📅</div>
              <div className="mt-4 text-lg font-black">
                {tab === "upcoming" ? t.upcomingEmpty : t.pastEmpty}
              </div>
              {tab === "upcoming" && pets.length > 0 && (
                <button
                  onClick={() => openBooking()}
                  disabled={settings?.online_booking_enabled !== true}
                  className="mt-5 rounded-2xl bg-gradient-to-r from-cyan-400 to-violet-500 px-5 py-3 text-sm font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  ＋ {settings?.online_booking_enabled === false ? t.bookingClosed : t.book}
                </button>
              )}
            </div>
          )}

          {displayAppointments.map((appointment) => {
            const pet = appointment.pet || pets.find((p) => p.id === appointment.pet_id);
            const canModify =
              settings?.client_rescheduling_enabled &&
              ["pending", "confirmed"].includes(appointment.status) &&
              appointment.appointment_date >= today;

            const canCancel =
              settings?.client_cancellation_enabled &&
              ["pending", "confirmed"].includes(appointment.status) &&
              appointment.appointment_date >= today;

            return (
              <article
                key={appointment.id}
                className={
                  dark
                    ? "rounded-[1.8rem] border border-white/[.07] bg-white/[.035] p-4 sm:p-5"
                    : "rounded-[1.8rem] border border-slate-100 bg-white p-4 shadow-sm sm:p-5"
                }
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <div className="flex items-center gap-4">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-3xl">
                      {petIcon(pet?.species || "")}
                    </div>

                    <div>
                      <div className="text-xl font-black">{pet?.name || "—"}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {pet?.species || ""}
                        {pet?.breed ? ` • ${pet.breed}` : ""}
                      </div>
                    </div>
                  </div>

                  <div className="grid flex-1 gap-3 sm:grid-cols-3">
                    <div>
                      <div className="text-[10px] font-bold text-slate-500">{t.date}</div>
                      <div className="mt-1 text-sm font-black">
                        {formatDate(appointment.appointment_date, lang)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold text-slate-500">{t.time}</div>
                      <div className="mt-1 text-sm font-black">
                        {formatTime(appointment.start_time)} → {formatTime(appointment.end_time)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold text-slate-500">{t.reason}</div>
                      <div className="mt-1 truncate text-sm font-black">
                        {appointment.reason || "—"}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full border px-3 py-1.5 text-[10px] font-black ${statusClasses(
                      appointment.status,
                      dark
                    )}`}
                  >
                    {statusText(appointment.status, t)}
                  </span>

                  <span
                    className={
                      dark
                        ? "rounded-full border border-white/5 bg-white/[.03] px-3 py-1.5 text-[10px] font-bold text-slate-500"
                        : "rounded-full border border-slate-100 bg-slate-50 px-3 py-1.5 text-[10px] font-bold text-slate-500"
                    }
                  >
                    {appointment.source === "client_portal"
                      ? t.sourcePortal
                      : t.sourceClinic}
                  </span>

                  <button
                    onClick={() => setSelectedAppointment(appointment)}
                    className={
                      dark
                        ? "ms-auto rounded-2xl border border-white/10 bg-white/[.04] px-3 py-2 text-xs font-bold text-slate-300"
                        : "ms-auto rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700"
                    }
                  >
                    {t.details}
                  </button>

                  {canModify && (
                    <button
                      onClick={() => openBooking(appointment)}
                      className="rounded-2xl bg-cyan-400/10 px-3 py-2 text-xs font-black text-cyan-300"
                    >
                      {t.reschedule}
                    </button>
                  )}

                  {canCancel && (
                    <button
                      onClick={() => {
                        setSelectedAppointment(appointment);
                        setModal("cancel");
                      }}
                      className="rounded-2xl bg-rose-400/10 px-3 py-2 text-xs font-black text-rose-300"
                    >
                      {t.cancelAppointment}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      </div>

      {selectedAppointment && modal !== "cancel" && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/65 p-3 backdrop-blur-sm sm:items-center">
          <div
            className={
              dark
                ? "w-full max-w-lg rounded-[2rem] border border-white/10 bg-[#0b1622] p-6 text-white shadow-2xl"
                : "w-full max-w-lg rounded-[2rem] border border-slate-200 bg-white p-6 text-slate-900 shadow-2xl"
            }
          >
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black">{t.details}</h2>
              <button
                onClick={() => setSelectedAppointment(null)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5"
              >
                ✕
              </button>
            </div>

            <div className="mt-5 rounded-2xl border border-white/5 bg-white/[.03] p-4">
              <div className="flex items-center gap-3">
                <div className="text-3xl">
                  {petIcon(selectedAppointment.pet?.species || "")}
                </div>
                <div>
                  <div className="font-black">
                    {selectedAppointment.pet?.name || "—"}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {formatDate(selectedAppointment.appointment_date, lang)}
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="text-[10px] font-bold text-slate-500">{t.time}</div>
                  <div className="mt-1 font-black">
                    {formatTime(selectedAppointment.start_time)} →{" "}
                    {formatTime(selectedAppointment.end_time)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-slate-500">{t.status}</div>
                  <div className="mt-1 font-black">
                    {statusText(selectedAppointment.status, t)}
                  </div>
                </div>
              </div>

              {selectedAppointment.reason && (
                <div className="mt-4">
                  <div className="text-[10px] font-bold text-slate-500">{t.reason}</div>
                  <div className="mt-1 text-sm font-bold">{selectedAppointment.reason}</div>
                </div>
              )}

              {selectedAppointment.notes && (
                <div className="mt-4">
                  <div className="text-[10px] font-bold text-slate-500">{t.notes}</div>
                  <div className="mt-1 text-sm leading-6 text-slate-400">
                    {selectedAppointment.notes}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-5 flex gap-2">
              <button
                onClick={() => {
                  const current = selectedAppointment;
                  setSelectedAppointment(null);
                  openBooking(current);
                }}
                disabled={
                  !settings?.client_rescheduling_enabled ||
                  !["pending", "confirmed"].includes(selectedAppointment.status)
                }
                className="flex-1 rounded-2xl bg-cyan-400 px-4 py-3 font-black text-slate-950 disabled:opacity-40"
              >
                {t.reschedule}
              </button>
              <button
                onClick={() => setSelectedAppointment(null)}
                className={
                  dark
                    ? "rounded-2xl border border-white/10 px-4 py-3 font-bold text-slate-400"
                    : "rounded-2xl border border-slate-200 px-4 py-3 font-bold text-slate-500"
                }
              >
                {t.close}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === "book" && (
        <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/65 p-3 backdrop-blur-sm sm:items-center">
          <div
            dir={lang === "ar" ? "rtl" : "ltr"}
            className={
              dark
                ? "max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-[2rem] border border-white/10 bg-[#0b1622] p-6 text-white shadow-2xl"
                : "max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-[2rem] border border-slate-200 bg-white p-6 text-slate-900 shadow-2xl"
            }
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-400/10 text-2xl">
                  📅
                </div>
                <h2 className="mt-4 text-2xl font-black">
                  {editing ? t.reschedule : t.book}
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  {settings
                    ? `${settings.booking_start_time.slice(0, 5)} → ${settings.booking_end_time.slice(0, 5)} • ${settings.default_duration_minutes} ${t.minutes}`
                    : ""}
                </p>
              </div>
              <button
                onClick={closeModal}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5"
              >
                ✕
              </button>
            </div>

            {error && (
              <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm font-bold text-rose-300">
                {error}
              </div>
            )}

            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-bold">{t.pet}</label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {pets.map((pet) => (
                    <button
                      key={pet.id}
                      type="button"
                      onClick={() => setPetId(pet.id)}
                      className={
                        pet.id === petId
                          ? "rounded-2xl border border-cyan-400 bg-cyan-400/10 p-3 text-start"
                          : dark
                            ? "rounded-2xl border border-white/10 bg-white/[.03] p-3 text-start"
                            : "rounded-2xl border border-slate-200 bg-slate-50 p-3 text-start"
                      }
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{petIcon(pet.species)}</span>
                        <div className="min-w-0">
                          <div className="truncate font-black">{pet.name}</div>
                          <div className="mt-1 truncate text-[10px] text-slate-500">
                            {pet.species}
                            {pet.breed ? ` • ${pet.breed}` : ""}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold">{t.date}</label>
                <input
                  type="date"
                  min={today}
                  value={appointmentDate}
                  onChange={(e) => {
                    setAppointmentDate(e.target.value);
                    setStartTime("");
                  }}
                  className={
                    dark
                      ? "w-full rounded-2xl border border-white/10 bg-white/[.04] px-4 py-3 outline-none focus:border-cyan-400"
                      : "w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-cyan-400"
                  }
                />
              </div>

              {appointmentDate === today && settings && !settings.today_booking_enabled && (
                <div className="rounded-2xl border border-amber-400/15 bg-amber-400/[.06] p-4 text-sm font-bold text-amber-300">
                  {t.todayClosed}
                  <div className="mt-1 text-xs font-semibold text-slate-500">
                    {t.todayClosedHint}
                  </div>
                </div>
              )}

              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label className="text-sm font-bold">{t.time}</label>
                  <span className="text-[10px] font-bold text-slate-500">
                    {settings
                      ? `${settings.default_duration_minutes} ${t.minutes}`
                      : ""}
                  </span>
                </div>

                {!canBook && appointmentDate === today && settings?.today_booking_enabled === false ? (
                  <div className="rounded-2xl border border-dashed border-white/10 p-5 text-center text-sm font-bold text-slate-500">
                    {t.todayClosedHint}
                  </div>
                ) : loadingSlots ? (
                  <div className="rounded-2xl border border-dashed border-white/10 p-5 text-center text-sm font-bold text-slate-500">
                    {t.loading}
                  </div>
                ) : availableSlots.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/10 p-5 text-center">
                    <div className="text-2xl">🕐</div>
                    <div className="mt-2 text-sm font-black">{t.noSlots}</div>
                    <div className="mt-1 text-xs text-slate-500">{t.noSlotsHint}</div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {availableSlots.map((slot) => (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => setStartTime(slot)}
                        className={
                          startTime === slot
                            ? "rounded-2xl border border-cyan-400 bg-cyan-400/10 px-3 py-3 text-sm font-black text-cyan-200"
                            : dark
                              ? "rounded-2xl border border-white/10 bg-white/[.03] px-3 py-3 text-sm font-bold text-slate-300 hover:bg-white/[.06]"
                              : "rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-bold text-slate-700 hover:bg-slate-100"
                        }
                      >
                        {formatTime(slot)}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold">{t.reason}</label>
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={t.reasonPlaceholder}
                  className={
                    dark
                      ? "w-full rounded-2xl border border-white/10 bg-white/[.04] px-4 py-3 outline-none focus:border-cyan-400"
                      : "w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-cyan-400"
                  }
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold">{t.notes}</label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={t.notesPlaceholder}
                  className={
                    dark
                      ? "w-full resize-none rounded-2xl border border-white/10 bg-white/[.04] px-4 py-3 outline-none focus:border-cyan-400"
                      : "w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-cyan-400"
                  }
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  disabled={saving || !startTime || !petId || !canBook}
                  onClick={() => void saveBooking()}
                  className="flex-1 rounded-2xl bg-gradient-to-r from-cyan-400 to-violet-500 px-5 py-3.5 font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {saving ? t.saving : editing ? t.update : t.save}
                </button>
                <button
                  disabled={saving}
                  onClick={closeModal}
                  className={
                    dark
                      ? "rounded-2xl border border-white/10 px-5 py-3.5 font-bold text-slate-400"
                      : "rounded-2xl border border-slate-200 px-5 py-3.5 font-bold text-slate-500"
                  }
                >
                  {t.cancel}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {modal === "cancel" && selectedAppointment && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm">
          <div
            className={
              dark
                ? "w-full max-w-md rounded-[2rem] border border-white/10 bg-[#0b1622] p-6 text-white shadow-2xl"
                : "w-full max-w-md rounded-[2rem] border border-slate-200 bg-white p-6 text-slate-900 shadow-2xl"
            }
          >
            <div className="text-4xl">⚠️</div>
            <h2 className="mt-4 text-2xl font-black">{t.confirmCancel}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">{t.cancelHint}</p>

            <div className="mt-5 rounded-2xl border border-white/5 bg-white/[.03] p-4">
              <div className="font-black">
                {selectedAppointment.pet?.name || "—"}
              </div>
              <div className="mt-1 text-sm text-slate-500">
                {formatDate(selectedAppointment.appointment_date, lang)} •{" "}
                {formatTime(selectedAppointment.start_time)}
              </div>
            </div>

            {error && (
              <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm font-bold text-rose-300">
                {error}
              </div>
            )}

            <div className="mt-5 flex gap-2">
              <button
                disabled={saving}
                onClick={() => setModal(null)}
                className={
                  dark
                    ? "flex-1 rounded-2xl border border-white/10 px-4 py-3 font-bold text-slate-300"
                    : "flex-1 rounded-2xl border border-slate-200 px-4 py-3 font-bold text-slate-600"
                }
              >
                {t.keep}
              </button>
              <button
                disabled={saving}
                onClick={() => void cancelAppointment()}
                className="flex-1 rounded-2xl bg-rose-500 px-4 py-3 font-black text-white disabled:opacity-50"
              >
                {saving ? t.saving : t.yesCancel}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
