"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getClinicDb, getClinicContext } from "@/lib/clinic-db";

type Language = "ar" | "en";
type Status =
  | "pending"
  | "confirmed"
  | "arrived"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "no_show";

type Client = {
  id: string;
  client_code: string;
  name: string;
  phone: string | null;
};

type Pet = {
  id: string;
  client_id: string;
  name: string;
  species: string;
  breed: string | null;
};

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
  client?: Client | null;
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

const I = {
  ar: {
    title: "المواعيد",
    subtitle: "إدارة مواعيد العيادة والحجوزات بسهولة",
    dashboard: "الرئيسية",
    newAppointment: "موعد جديد",
    today: "اليوم",
    all: "الكل",
    upcoming: "القادمة",
    past: "السابقة",
    cancelled: "الملغاة",
    search: "ابحث باسم العميل أو الحيوان أو التليفون...",
    allStatuses: "كل الحالات",
    pending: "في الانتظار",
    confirmed: "مؤكد",
    arrived: "حضر",
    inProgress: "جاري الكشف",
    completed: "تم الكشف",
    noShow: "لم يحضر",
    clinicCancelled: "ملغي",
    late: "متأخر",
    bookings: "إعدادات الحجز",
    onlineBooking: "السماح بالحجز من Client Interface",
    todayBooking: "السماح بالحجز اليوم",
    clientCancel: "السماح للعميل بالإلغاء",
    clientReschedule: "السماح للعميل بتعديل الموعد",
    grace: "مهلة عدم الحضور",
    minutes: "دقيقة",
    open: "مفتوح",
    closed: "مغلق",
    noAppointments: "لا توجد مواعيد",
    owner: "المالك",
    pet: "الحيوان",
    reason: "السبب",
    time: "الوقت",
    status: "الحالة",
    action: "إجراء",
    startVisit: "بدء الكشف",
    view: "عرض",
    confirm: "تأكيد",
    arrivedAction: "تم الحضور",
    complete: "إنهاء",
    cancelAction: "إلغاء",
    reschedule: "تعديل",
    addClient: "إضافة عميل",
    addPet: "إضافة حيوان",
    addBoth: "عميل وحيوان جديد",
    chooseClient: "اختر العميل",
    choosePet: "اختر الحيوان",
    clientName: "اسم العميل",
    phone: "رقم الهاتف",
    petName: "اسم الحيوان",
    species: "النوع",
    breed: "السلالة",
    gender: "الجنس",
    birthDate: "تاريخ الميلاد",
    cat: "قط",
    dog: "كلب",
    other: "أخرى",
    male: "ذكر",
    female: "أنثى",
    date: "التاريخ",
    startTime: "من",
    duration: "المدة",
    reasonPlaceholder: "كشف، تطعيم، متابعة...",
    notes: "ملاحظات",
    notesPlaceholder: "ملاحظات عن الموعد...",
    save: "حفظ الموعد",
    saving: "جاري الحفظ...",
    close: "إغلاق",
    saveClient: "حفظ العميل",
    savePet: "حفظ الحيوان",
    saveBoth: "حفظ والانتقال للموعد",
    clientSaved: "تم حفظ العميل.",
    petSaved: "تم حفظ الحيوان.",
    appointmentSaved: "تم حفظ الموعد.",
    error: "حصل خطأ.",
    todaySummary: "ملخص اليوم",
    total: "إجمالي",
    waiting: "انتظار",
    done: "تم",
    noShowShort: "No-show",
    loading: "جاري تحميل المواعيد...",
    language: "English",
  },
  en: {
    title: "Appointments",
    subtitle: "Manage clinic appointments and online booking",
    dashboard: "Dashboard",
    newAppointment: "New Appointment",
    today: "Today",
    all: "All",
    upcoming: "Upcoming",
    past: "Past",
    cancelled: "Cancelled",
    search: "Search client, pet or phone...",
    allStatuses: "All statuses",
    pending: "Pending",
    confirmed: "Confirmed",
    arrived: "Arrived",
    inProgress: "In progress",
    completed: "Completed",
    noShow: "No-show",
    clinicCancelled: "Cancelled",
    late: "Late",
    bookings: "Booking controls",
    onlineBooking: "Allow Client Interface booking",
    todayBooking: "Accept bookings today",
    clientCancel: "Allow client cancellation",
    clientReschedule: "Allow client rescheduling",
    grace: "No-show grace",
    minutes: "min",
    open: "Open",
    closed: "Closed",
    noAppointments: "No appointments",
    owner: "Owner",
    pet: "Pet",
    reason: "Reason",
    time: "Time",
    status: "Status",
    action: "Action",
    startVisit: "Start visit",
    view: "View",
    confirm: "Confirm",
    arrivedAction: "Arrived",
    complete: "Complete",
    cancelAction: "Cancel",
    reschedule: "Reschedule",
    addClient: "Add client",
    addPet: "Add pet",
    addBoth: "New client & pet",
    chooseClient: "Choose client",
    choosePet: "Choose pet",
    clientName: "Client name",
    phone: "Phone",
    petName: "Pet name",
    species: "Species",
    breed: "Breed",
    gender: "Gender",
    birthDate: "Birth date",
    cat: "Cat",
    dog: "Dog",
    other: "Other",
    male: "Male",
    female: "Female",
    date: "Date",
    startTime: "Start",
    duration: "Duration",
    reasonPlaceholder: "Check-up, vaccination, follow-up...",
    notes: "Notes",
    notesPlaceholder: "Appointment notes...",
    save: "Save appointment",
    saving: "Saving...",
    close: "Close",
    saveClient: "Save client",
    savePet: "Save pet",
    saveBoth: "Save & continue",
    clientSaved: "Client saved.",
    petSaved: "Pet saved.",
    appointmentSaved: "Appointment saved.",
    error: "Something went wrong.",
    todaySummary: "Today",
    total: "Total",
    waiting: "Waiting",
    done: "Done",
    noShowShort: "No-show",
    loading: "Loading appointments...",
    language: "العربية",
  },
};

const statusClass: Record<Status | "late", string> = {
  pending: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  confirmed: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  arrived: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  in_progress: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  completed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  cancelled: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  no_show: "bg-red-500/10 text-red-400 border-red-500/20",
  late: "bg-orange-500/10 text-orange-400 border-orange-500/20",
};

function localDateInputValue() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function appointmentStart(a: Appointment) {
  return new Date(`${a.appointment_date}T${a.start_time}`);
}

function appointmentEnd(a: Appointment) {
  return new Date(`${a.appointment_date}T${a.end_time}`);
}

function timeLabel(a: Appointment, language: Language) {
  const locale = language === "ar" ? "ar-EG" : "en-US";
  return `${new Date(`${a.appointment_date}T${a.start_time}`).toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
  })} – ${new Date(`${a.appointment_date}T${a.end_time}`).toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function dayLabel(value: string, language: Language) {
  return new Intl.DateTimeFormat(language === "ar" ? "ar-EG" : "en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${value}T12:00:00`));
}

function displayStatus(a: Appointment, graceMinutes: number): Status | "late" {
  if (a.status === "pending" || a.status === "confirmed") {
    const now = Date.now();
    const start = appointmentStart(a).getTime();
    const grace = graceMinutes * 60 * 1000;
    if (now >= start + grace) return "no_show";
    if (now > start) return "late";
  }
  return a.status;
}

export default function AppointmentsPage() {
  const router = useRouter();

  const [language, setLanguage] = useState<Language>("ar");
  const [darkMode, setDarkMode] = useState(true);
  const [ready, setReady] = useState(false);

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [pets, setPets] = useState<Pet[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [clinicName, setClinicName] = useState("");

  const [tab, setTab] = useState<"today" | "upcoming" | "all">("today");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingAppointment, setSavingAppointment] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [modal, setModal] = useState<"appointment" | "client" | "pet" | "both" | null>(null);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);

  const [clientId, setClientId] = useState("");
  const [petId, setPetId] = useState("");
  const [appointmentDate, setAppointmentDate] = useState(localDateInputValue());
  const [startTime, setStartTime] = useState("09:00");
  const [duration, setDuration] = useState("30");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");

  const [newClientName, setNewClientName] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");
  const [newPetName, setNewPetName] = useState("");
  const [newPetSpecies, setNewPetSpecies] = useState("Cat");
  const [newPetBreed, setNewPetBreed] = useState("");
  const [newPetGender, setNewPetGender] = useState("");
  const [newPetBirthDate, setNewPetBirthDate] = useState("");

  const t = I[language];

  useEffect(() => {
    setLanguage(localStorage.getItem("vetra-language") === "en" ? "en" : "ar");
    setDarkMode(localStorage.getItem("vetra-theme") !== "light");
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem("vetra-language", language);
    localStorage.setItem("vetra-theme", darkMode ? "dark" : "light");
  }, [language, darkMode, ready]);

  async function loadData() {
    setLoading(true);
    setError("");

    try {
      const context = await getClinicContext();
      setClinicName(context.clinic_name);

      const db = await getClinicDb();

      const [aResult, cResult, pResult, sResult] = await Promise.all([
        db
          .from("appointments")
          .select("id, clinic_id, client_id, pet_id, appointment_date, start_time, end_time, reason, status, notes, source, created_at")
          .eq("clinic_id", context.clinic_id)
          .order("appointment_date", { ascending: true })
          .order("start_time", { ascending: true }),
        db.from("clients").select("id, client_code, name, phone").order("name"),
        db.from("pets").select("id, client_id, name, species, breed").order("name"),
        db.from("appointment_settings")
          .select("id, clinic_id, online_booking_enabled, today_booking_enabled, client_cancellation_enabled, client_rescheduling_enabled, no_show_grace_minutes, booking_start_time, booking_end_time, default_duration_minutes")
          .eq("clinic_id", context.clinic_id)
          .maybeSingle(),
      ]);

      if (aResult.error) throw aResult.error;
      if (cResult.error) throw cResult.error;
      if (pResult.error) throw pResult.error;
      if (sResult.error) throw sResult.error;

      const clientMap = new Map((cResult.data || []).map((c) => [c.id, c as Client]));
      const petMap = new Map((pResult.data || []).map((p) => [p.id, p as Pet]));

      const rows = ((aResult.data || []) as Appointment[]).map((a) => ({
        ...a,
        client: clientMap.get(a.client_id) || null,
        pet: petMap.get(a.pet_id) || null,
      }));

      setAppointments(rows);
      setClients((cResult.data || []) as Client[]);
      setPets((pResult.data || []) as Pet[]);

      if (sResult.data) {
        setSettings(sResult.data as Settings);
      } else {
        const initialPayload = {
          clinic_id: context.clinic_id,
          online_booking_enabled: true,
          today_booking_enabled: true,
          client_cancellation_enabled: true,
          client_rescheduling_enabled: false,
          no_show_grace_minutes: 30,
          booking_start_time: "09:00:00",
          booking_end_time: "21:00:00",
          default_duration_minutes: 30,
        };

        const { data: createdSettings, error: createSettingsError } = await db
          .from("appointment_settings")
          .insert(initialPayload)
          .select("*")
          .single();

        if (createSettingsError) throw createSettingsError;

        setSettings(createdSettings as Settings);
      }
    } catch (e) {
      console.error("APPOINTMENTS LOAD ERROR:", e);
      setError(e instanceof Error ? e.message : t.error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (ready) void loadData();
  }, [ready]);

  const today = localDateInputValue();

  const visibleAppointments = useMemo(() => {
    const q = search.trim().toLowerCase();
    const grace = settings?.no_show_grace_minutes ?? 30;

    return appointments
      .map((a) => ({ ...a, computedStatus: displayStatus(a, grace) }))
      .filter((a) => {
        const matchesSearch =
          !q ||
          (a.client?.name || "").toLowerCase().includes(q) ||
          (a.client?.phone || "").toLowerCase().includes(q) ||
          (a.client?.client_code || "").toLowerCase().includes(q) ||
          (a.pet?.name || "").toLowerCase().includes(q);

        const date = a.appointment_date;

        const matchesTab =
          tab === "today"
            ? date === today
            : tab === "upcoming"
              ? date > today
              : true;

        const status = a.computedStatus;
        const matchesStatus =
          statusFilter === "all"
            ? true
            : statusFilter === status;

        return matchesSearch && matchesTab && matchesStatus;
      });
  }, [appointments, search, statusFilter, tab, today, settings]);

  const stats = useMemo(() => {
    const todayRows = appointments.filter((a) => a.appointment_date === today);
    const grace = settings?.no_show_grace_minutes ?? 30;
    const computed = todayRows.map((a) => displayStatus(a, grace));

    return {
      total: todayRows.length,
      waiting: computed.filter((s) => s === "pending" || s === "confirmed" || s === "late").length,
      done: computed.filter((s) => s === "completed").length,
      noShow: computed.filter((s) => s === "no_show").length,
      cancelled: computed.filter((s) => s === "cancelled").length,
    };
  }, [appointments, settings, today]);

  function openNewAppointment() {
    setSelectedAppointment(null);
    setError("");
    setMessage("");
    setClientId("");
    setPetId("");
    setAppointmentDate(today);
    setStartTime("09:00");
    setDuration(String(settings?.default_duration_minutes ?? 30));
    setReason("");
    setNotes("");
    setModal("appointment");
  }

  function openEditAppointment(a: Appointment) {
    setSelectedAppointment(a);
    setClientId(a.client_id);
    setPetId(a.pet_id);
    setAppointmentDate(a.appointment_date);
    setStartTime(a.start_time.slice(0, 5));
    const mins = Math.max(
      15,
      Math.round((appointmentEnd(a).getTime() - appointmentStart(a).getTime()) / 60000)
    );
    setDuration(String(mins));
    setReason(a.reason || "");
    setNotes(a.notes || "");
    setModal("appointment");
  }

  async function ensureNoShow(a: Appointment) {
    if (!settings || (a.status !== "pending" && a.status !== "confirmed")) return;

    const status = displayStatus(a, settings.no_show_grace_minutes);
    if (status !== "no_show") return;

    try {
      const db = await getClinicDb();
      await db.from("appointments").update({ status: "no_show", updated_at: new Date().toISOString() }).eq("id", a.id);
    } catch (e) {
      console.warn("NO-SHOW UPDATE FAILED:", e);
    }
  }

  async function updateStatus(a: Appointment, status: Status) {
    setError("");
    setMessage("");

    try {
      const db = await getClinicDb();
      const patch: Record<string, unknown> = {
        status,
        updated_at: new Date().toISOString(),
      };

      if (status === "completed") patch.completed_at = new Date().toISOString();
      if (status === "arrived") patch.arrived_at = new Date().toISOString();
      if (status === "cancelled") patch.cancelled_at = new Date().toISOString();

      const { error: updateError } = await db
        .from("appointments")
        .update(patch)
        .eq("id", a.id);

      if (updateError) throw updateError;

      setMessage(t.appointmentSaved);
      await loadData();
    } catch (e) {
      console.error("APPOINTMENT STATUS ERROR:", e);
      setError(e instanceof Error ? e.message : t.error);
    }
  }

  async function saveAppointment() {
    if (!clientId || !petId || !appointmentDate || !startTime) {
      setError(t.error);
      return;
    }

    const ownerPet = pets.find((p) => p.id === petId);
    if (!ownerPet || ownerPet.client_id !== clientId) {
      setError(t.error);
      return;
    }

    setSavingAppointment(true);
    setError("");
    setMessage("");

    try {
      const db = await getClinicDb();
      const [h, m] = startTime.split(":").map(Number);
      const total = h * 60 + m + Number(duration || 30);
      const endH = Math.floor(total / 60) % 24;
      const endM = total % 60;
      const endTime = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}:00`;

      const payload = {
        client_id: clientId,
        pet_id: petId,
        appointment_date: appointmentDate,
        start_time: `${startTime}:00`,
        end_time: endTime,
        reason: reason.trim() || null,
        notes: notes.trim() || null,
        source: "clinic",
      };

      if (selectedAppointment) {
        const { error: updateError } = await db
          .from("appointments")
          .update(payload)
          .eq("id", selectedAppointment.id);

        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await db
          .from("appointments")
          .insert({ ...payload, status: "confirmed" });

        if (insertError) throw insertError;
      }

      setModal(null);
      setMessage(t.appointmentSaved);
      await loadData();
    } catch (e) {
      console.error("APPOINTMENT SAVE ERROR:", e);
      setError(e instanceof Error ? e.message : t.error);
    } finally {
      setSavingAppointment(false);
    }
  }

  async function saveNewClient(nextModal: "appointment" | "both" = "appointment") {
    if (!newClientName.trim()) {
      setError(t.error);
      return;
    }

    try {
      const db = await getClinicDb();
      const { data, error: insertError } = await db
        .from("clients")
        .insert({
          name: newClientName.trim(),
          phone: newClientPhone.trim() || null,
        })
        .select("id, client_code, name, phone")
        .single();

      if (insertError) throw insertError;

      setNewClientName("");
      setNewClientPhone("");
      setMessage(t.clientSaved);
      setClientId(data.id);
      await loadData();

      if (nextModal === "both") {
        setModal("pet");
      } else {
        setModal("appointment");
      }
    } catch (e) {
      console.error("NEW CLIENT ERROR:", e);
      setError(e instanceof Error ? e.message : t.error);
    }
  }

  async function saveNewPet(nextModal: "appointment" = "appointment") {
    if (!clientId || !newPetName.trim()) {
      setError(t.error);
      return;
    }

    try {
      const db = await getClinicDb();
      const { data, error: insertError } = await db
        .from("pets")
        .insert({
          client_id: clientId,
          name: newPetName.trim(),
          species: newPetSpecies,
          breed: newPetBreed.trim() || null,
          gender: newPetGender || null,
          birth_date: newPetBirthDate || null,
        })
        .select("id, client_id, name, species, breed")
        .single();

      if (insertError) throw insertError;

      setPetId(data.id);
      setNewPetName("");
      setNewPetBreed("");
      setNewPetGender("");
      setNewPetBirthDate("");
      setMessage(t.petSaved);
      await loadData();
      setModal(nextModal);
    } catch (e) {
      console.error("NEW PET ERROR:", e);
      setError(e instanceof Error ? e.message : t.error);
    }
  }

  async function saveBoth() {
    if (!newClientName.trim()) {
      setError(t.error);
      return;
    }

    try {
      const db = await getClinicDb();

      const { data: client, error: clientError } = await db
        .from("clients")
        .insert({
          name: newClientName.trim(),
          phone: newClientPhone.trim() || null,
        })
        .select("id, client_code, name, phone")
        .single();

      if (clientError) throw clientError;

      setClientId(client.id);

      const { data: pet, error: petError } = await db
        .from("pets")
        .insert({
          client_id: client.id,
          name: newPetName.trim(),
          species: newPetSpecies,
          breed: newPetBreed.trim() || null,
          gender: newPetGender || null,
          birth_date: newPetBirthDate || null,
        })
        .select("id, client_id, name, species, breed")
        .single();

      if (petError) {
        await db.from("clients").delete().eq("id", client.id);
        throw petError;
      }

      setPetId(pet.id);
      setNewClientName("");
      setNewClientPhone("");
      setNewPetName("");
      setNewPetBreed("");
      setNewPetGender("");
      setNewPetBirthDate("");
      setMessage(t.clientSaved + " " + t.petSaved);
      setModal("appointment");
      await loadData();
    } catch (e) {
      console.error("NEW CLIENT + PET ERROR:", e);
      setError(e instanceof Error ? e.message : t.error);
    }
  }

  async function toggleSetting(key: keyof Settings, value: boolean) {
    if (!settings) return;

    setSavingSettings(true);
    setError("");
    setMessage("");

    try {
      const db = await getClinicDb();
      const payload = {
        clinic_id: settings.clinic_id,
        online_booking_enabled: key === "online_booking_enabled" ? value : settings.online_booking_enabled,
        today_booking_enabled: key === "today_booking_enabled" ? value : settings.today_booking_enabled,
        client_cancellation_enabled: key === "client_cancellation_enabled" ? value : settings.client_cancellation_enabled,
        client_rescheduling_enabled: key === "client_rescheduling_enabled" ? value : settings.client_rescheduling_enabled,
        no_show_grace_minutes: settings.no_show_grace_minutes,
        booking_start_time: settings.booking_start_time,
        booking_end_time: settings.booking_end_time,
        default_duration_minutes: settings.default_duration_minutes,
      };

      if (settings.id) {
        const { error: updateError } = await db.from("appointment_settings").update(payload).eq("id", settings.id);
        if (updateError) throw updateError;
      } else {
        const { data, error: insertError } = await db.from("appointment_settings").insert(payload).select("*").single();
        if (insertError) throw insertError;
        setSettings(data as Settings);
      }

      setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
    } catch (e) {
      console.error("APPOINTMENT SETTINGS ERROR:", e);
      setError(e instanceof Error ? e.message : t.error);
    } finally {
      setSavingSettings(false);
    }
  }

  async function updateGrace(value: number) {
    if (!settings || !Number.isFinite(value)) return;
    const safe = Math.max(0, Math.min(240, Math.round(value)));

    try {
      const db = await getClinicDb();
      const payload = {
        clinic_id: settings.clinic_id,
        online_booking_enabled: settings.online_booking_enabled,
        today_booking_enabled: settings.today_booking_enabled,
        client_cancellation_enabled: settings.client_cancellation_enabled,
        client_rescheduling_enabled: settings.client_rescheduling_enabled,
        no_show_grace_minutes: safe,
        booking_start_time: settings.booking_start_time,
        booking_end_time: settings.booking_end_time,
        default_duration_minutes: settings.default_duration_minutes,
      };

      if (settings.id) {
        const { error } = await db.from("appointment_settings").update(payload).eq("id", settings.id);
        if (error) throw error;
      } else {
        const { data, error } = await db.from("appointment_settings").insert(payload).select("*").single();
        if (error) throw error;
        setSettings(data as Settings);
        return;
      }

      setSettings((prev) => (prev ? { ...prev, no_show_grace_minutes: safe } : prev));
    } catch (e) {
      console.error("GRACE UPDATE ERROR:", e);
      setError(e instanceof Error ? e.message : t.error);
    }
  }

  const resetFormFields = () => {
    setNewClientName("");
    setNewClientPhone("");
    setNewPetName("");
    setNewPetBreed("");
    setNewPetGender("");
    setNewPetBirthDate("");
    setError("");
  };

  if (!ready || loading) {
    return (
      <main dir={language === "ar" ? "rtl" : "ltr"} className={`min-h-screen flex items-center justify-center ${darkMode ? "bg-[#0F1115] text-white" : "bg-[#F7F8FA] text-slate-900"}`}>
        <div className="text-center">
          <div className="mb-3 text-4xl">📅</div>
          <p className="text-sm text-slate-500">{t.loading}</p>
        </div>
      </main>
    );
  }

  const statusText = (status: Status | "late") => {
    if (status === "late") return t.late;
    return ({
      pending: t.pending,
      confirmed: t.confirmed,
      arrived: t.arrived,
      in_progress: t.inProgress,
      completed: t.completed,
      cancelled: t.clinicCancelled,
      no_show: t.noShow,
    } as Record<Status, string>)[status];
  };

  return (
    <main
      dir={language === "ar" ? "rtl" : "ltr"}
      className={`min-h-screen transition-colors ${darkMode ? "bg-[#0F1115] text-white" : "bg-[#F7F8FA] text-slate-900"}`}
    >
      <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-7 lg:px-10">
        <header className="mb-7 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link href="/dashboard" className="text-sm font-semibold text-slate-500 hover:text-blue-500">
              ← {t.dashboard}
            </Link>
            <h1 className="mt-3 text-3xl font-black">{t.title}</h1>
            <p className="mt-1 text-sm text-slate-500">{t.subtitle} · {clinicName}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button onClick={() => setLanguage(language === "ar" ? "en" : "ar")} className={`rounded-2xl border px-4 py-3 text-sm font-bold ${darkMode ? "border-white/10 bg-[#171A20]" : "border-slate-200 bg-white"}`}>🌐 {t.language}</button>
            <button onClick={() => setDarkMode((v) => !v)} className={`rounded-2xl border px-4 py-3 text-sm font-bold ${darkMode ? "border-white/10 bg-[#171A20]" : "border-slate-200 bg-white"}`}>{darkMode ? "☀️" : "🌙"}</button>
            <button onClick={openNewAppointment} className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-blue-700">+ {t.newAppointment}</button>
          </div>
        </header>

        {(error || message) && (
          <div className={`mb-5 rounded-2xl border px-4 py-3 text-sm font-semibold ${error ? "border-rose-500/20 bg-rose-500/10 text-rose-400" : "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"}`}>
            {error || message}
          </div>
        )}

        <section className={`mb-6 rounded-3xl border p-4 ${darkMode ? "border-white/[0.06] bg-[#13161B]" : "border-slate-100 bg-white"}`}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black">{t.bookings}</h2>
              <p className="text-xs text-slate-500">Controls apply immediately to the Client Interface.</p>
            </div>
            <span className="rounded-full bg-blue-500/10 px-3 py-1.5 text-xs font-bold text-blue-400">{settings?.no_show_grace_minutes ?? 30} {t.minutes}</span>
          </div>

          <div className="grid gap-3 lg:grid-cols-4">
            {[
              ["online_booking_enabled", t.onlineBooking],
              ["today_booking_enabled", t.todayBooking],
              ["client_cancellation_enabled", t.clientCancel],
              ["client_rescheduling_enabled", t.clientReschedule],
            ].map(([key, label]) => {
              const settingKey = key as keyof Settings;
              const active = Boolean(settings?.[settingKey]);
              return (
                <button
                  key={key}
                  disabled={savingSettings}
                  onClick={() => toggleSetting(settingKey, !active)}
                  className={`flex items-center justify-between gap-3 rounded-2xl border p-4 text-right transition ${darkMode ? "border-white/[0.05] bg-white/[0.02] hover:bg-white/[0.04]" : "border-slate-100 bg-slate-50 hover:bg-slate-100"}`}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-bold">{label}</div>
                    <div className={`mt-1 text-xs font-semibold ${active ? "text-emerald-500" : "text-rose-400"}`}>{active ? t.open : t.closed}</div>
                  </div>
                  <span className={`relative h-7 w-12 rounded-full p-1 transition ${active ? "bg-emerald-500" : "bg-slate-600"}`}>
                    <span className={`block h-5 w-5 rounded-full bg-white shadow transition ${active ? "translate-x-5" : "translate-x-0"}`} />
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex flex-col gap-2 rounded-2xl border border-white/[0.05] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold">{t.grace}</p>
              <p className="mt-1 text-xs text-slate-500">{language === "ar" ? "بعدها يتحول الموعد تلقائيًا إلى لم يحضر." : "After this time, a pending/confirmed appointment becomes no-show."}</p>
            </div>
            <input
              type="number"
              min="0"
              max="240"
              value={settings?.no_show_grace_minutes ?? 30}
              onChange={(e) => setSettings((prev) => prev ? { ...prev, no_show_grace_minutes: Number(e.target.value) } : prev)}
              onBlur={(e) => void updateGrace(Number(e.target.value))}
              className={`w-28 rounded-xl border px-3 py-2 text-sm outline-none ${darkMode ? "border-white/10 bg-[#0F1115]" : "border-slate-200 bg-white"}`}
            />
          </div>
        </section>

        <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            [t.total, stats.total, "text-white"],
            [t.waiting, stats.waiting, "text-orange-400"],
            [t.confirmed, appointments.filter((a) => a.appointment_date === today && a.status === "confirmed").length, "text-blue-400"],
            [t.done, stats.done, "text-emerald-400"],
            [t.noShowShort, stats.noShow, "text-rose-400"],
          ].map(([label, value, color]) => (
            <div key={String(label)} className={`rounded-2xl border p-4 ${darkMode ? "border-white/[0.06] bg-[#13161B]" : "border-slate-100 bg-white"}`}>
              <p className="text-xs text-slate-500">{label}</p>
              <p className={`mt-2 text-2xl font-black ${color}`}>{value}</p>
            </div>
          ))}
        </section>

        <section className={`mb-5 rounded-3xl border p-4 ${darkMode ? "border-white/[0.06] bg-[#13161B]" : "border-slate-100 bg-white"}`}>
          <div className="grid gap-3 lg:grid-cols-[auto_1fr_auto]">
            <div className="flex gap-2 overflow-x-auto">
              {[
                ["today", t.today],
                ["upcoming", t.upcoming],
                ["all", t.all],
              ].map(([value, label]) => (
                <button key={value} onClick={() => setTab(value as "today" | "upcoming" | "all")} className={`rounded-xl px-4 py-3 text-sm font-bold ${tab === value ? "bg-blue-600 text-white" : darkMode ? "bg-white/[0.04] text-slate-400" : "bg-slate-50 text-slate-600"}`}>
                  {label}
                </button>
              ))}
            </div>

            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t.search} className={`rounded-2xl border px-4 py-3 outline-none focus:border-blue-500 ${darkMode ? "border-white/[0.07] bg-[#0F1115]" : "border-slate-200 bg-slate-50"}`} />

            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`rounded-2xl border px-4 py-3 outline-none ${darkMode ? "border-white/[0.07] bg-[#0F1115]" : "border-slate-200 bg-slate-50"}`}>
              <option value="all">{t.allStatuses}</option>
              <option value="pending">{t.pending}</option>
              <option value="confirmed">{t.confirmed}</option>
              <option value="arrived">{t.arrived}</option>
              <option value="in_progress">{t.inProgress}</option>
              <option value="completed">{t.completed}</option>
              <option value="no_show">{t.noShow}</option>
              <option value="cancelled">{t.clinicCancelled}</option>
            </select>
          </div>
        </section>

        <section className={`overflow-hidden rounded-3xl border ${darkMode ? "border-white/[0.06] bg-[#13161B]" : "border-slate-100 bg-white"}`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-sm">
              <thead>
                <tr className={`border-b text-right text-xs font-semibold text-slate-500 ${darkMode ? "border-white/[0.05]" : "border-slate-100"}`}>
                  <th className="px-5 py-4">{t.time}</th>
                  <th className="px-5 py-4">{t.pet}</th>
                  <th className="px-5 py-4">{t.owner}</th>
                  <th className="px-5 py-4">{t.reason}</th>
                  <th className="px-5 py-4">{t.status}</th>
                  <th className="px-5 py-4">{t.action}</th>
                </tr>
              </thead>
              <tbody>
                {visibleAppointments.map((a) => {
                  const computed = displayStatus(a, settings?.no_show_grace_minutes ?? 30);
                  const actual = computed === "late" ? "late" : computed;
                  const petIcon = (a.pet?.species || "").toLowerCase().includes("dog") ? "🐶" : (a.pet?.species || "").toLowerCase().includes("cat") ? "🐱" : "🐾";

                  if (computed === "no_show" && a.status !== "no_show" && a.status !== "cancelled") {
                    void ensureNoShow(a);
                  }

                  return (
                    <tr key={a.id} className={`border-b last:border-b-0 ${darkMode ? "border-white/[0.04] hover:bg-white/[0.02]" : "border-slate-100 hover:bg-slate-50"}`}>
                      <td className="px-5 py-4 font-black">{timeLabel(a, language)}</td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.04] text-xl">{petIcon}</div>
                          <div>
                            <div className="font-black">{a.pet?.name || "—"}</div>
                            <div className="text-xs text-slate-500">{dayLabel(a.appointment_date, language)}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="font-semibold">{a.client?.name || "—"}</div>
                        <div className="mt-1 text-xs text-slate-500" dir="ltr">{a.client?.phone || a.client?.client_code || "—"}</div>
                      </td>
                      <td className="px-5 py-4 text-slate-400">{a.reason || "—"}</td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex rounded-full border px-3 py-1.5 text-xs font-bold ${statusClass[actual]}`}>{statusText(actual)}</span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-2">
                          {(a.status === "pending" || a.status === "confirmed" || computed === "late") && (
                            <button onClick={() => void updateStatus(a, "arrived")} className="rounded-xl bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-400">{t.arrivedAction}</button>
                          )}

                          {(a.status === "arrived" || a.status === "in_progress") && (
                            <button onClick={() => router.push(`/visits/new?appointment=${a.id}&pet=${a.pet_id}`)} className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white">{t.startVisit}</button>
                          )}

                          {a.status === "confirmed" && (
                            <button onClick={() => void updateStatus(a, "confirmed")} className="rounded-xl bg-blue-500/10 px-3 py-2 text-xs font-bold text-blue-400">{t.confirm}</button>
                          )}

                          {!["completed", "cancelled", "no_show"].includes(a.status) && (
                            <>
                              <button onClick={() => openEditAppointment(a)} className="rounded-xl bg-white/[0.04] px-3 py-2 text-xs font-bold text-slate-400">{t.reschedule}</button>
                              <button onClick={() => void updateStatus(a, "cancelled")} className="rounded-xl bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-400">{t.cancelAction}</button>
                            </>
                          )}

                          {a.status === "completed" && (
                            <button onClick={() => router.push(`/pets/${a.pet_id}`)} className="rounded-xl bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-400">{t.view}</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {!visibleAppointments.length && (
            <div className="px-6 py-16 text-center text-slate-500">
              <div className="mb-3 text-5xl">📅</div>
              <p className="font-bold">{t.noAppointments}</p>
            </div>
          )}
        </section>

        <div className="mt-5 flex flex-wrap gap-3">
          <button onClick={() => { resetFormFields(); setModal("both"); }} className={`rounded-2xl border px-5 py-3 text-sm font-bold ${darkMode ? "border-white/10 bg-[#13161B]" : "border-slate-200 bg-white"}`}>＋ {t.addBoth}</button>
          <button onClick={() => { resetFormFields(); setModal("client"); }} className={`rounded-2xl border px-5 py-3 text-sm font-bold ${darkMode ? "border-white/10 bg-[#13161B]" : "border-slate-200 bg-white"}`}>＋ {t.addClient}</button>
          <button onClick={() => { resetFormFields(); setModal("pet"); }} className={`rounded-2xl border px-5 py-3 text-sm font-bold ${darkMode ? "border-white/10 bg-[#13161B]" : "border-slate-200 bg-white"}`}>＋ {t.addPet}</button>
        </div>

        {modal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
            <div className={`max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl border p-6 shadow-2xl ${darkMode ? "border-white/10 bg-[#13161B]" : "border-slate-100 bg-white"}`}>
              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-black">
                    {modal === "appointment" ? t.newAppointment : modal === "client" ? t.addClient : modal === "pet" ? t.addPet : t.addBoth}
                  </h2>
                </div>
                <button onClick={() => setModal(null)} className="rounded-xl px-3 py-2 text-slate-500 hover:bg-white/[0.04]">✕</button>
              </div>

              {error && <div className="mb-4 rounded-2xl bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-400">{error}</div>}

              {modal === "appointment" && (
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <button onClick={() => setModal("client")} className="flex-1 rounded-xl bg-white/[0.04] px-3 py-3 text-xs font-bold">＋ {t.addClient}</button>
                    <button onClick={() => setModal("both")} className="flex-1 rounded-xl bg-white/[0.04] px-3 py-3 text-xs font-bold">＋ {t.addBoth}</button>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-bold">{t.chooseClient}</label>
                    <select value={clientId} onChange={(e) => { setClientId(e.target.value); setPetId(""); }} className={`w-full rounded-2xl border px-4 py-3 ${darkMode ? "border-white/10 bg-[#0F1115]" : "border-slate-200 bg-slate-50"}`}>
                      <option value="">{t.chooseClient}</option>
                      {clients.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ""}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-bold">{t.choosePet}</label>
                    <select value={petId} onChange={(e) => setPetId(e.target.value)} disabled={!clientId} className={`w-full rounded-2xl border px-4 py-3 ${darkMode ? "border-white/10 bg-[#0F1115]" : "border-slate-200 bg-slate-50"}`}>
                      <option value="">{t.choosePet}</option>
                      {pets.filter((p) => p.client_id === clientId).map((p) => <option key={p.id} value={p.id}>{p.name}{p.breed ? ` · ${p.breed}` : ""}</option>)}
                    </select>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <div>
                      <label className="mb-2 block text-sm font-bold">{t.date}</label>
                      <input type="date" value={appointmentDate} onChange={(e) => setAppointmentDate(e.target.value)} className={`w-full rounded-2xl border px-4 py-3 ${darkMode ? "border-white/10 bg-[#0F1115]" : "border-slate-200 bg-slate-50"}`} />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-bold">{t.startTime}</label>
                      <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={`w-full rounded-2xl border px-4 py-3 ${darkMode ? "border-white/10 bg-[#0F1115]" : "border-slate-200 bg-slate-50"}`} />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-bold">{t.duration}</label>
                      <select value={duration} onChange={(e) => setDuration(e.target.value)} className={`w-full rounded-2xl border px-4 py-3 ${darkMode ? "border-white/10 bg-[#0F1115]" : "border-slate-200 bg-slate-50"}`}>
                        {[15, 30, 45, 60, 90, 120].map((n) => <option key={n} value={n}>{n} {t.minutes}</option>)}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-bold">{t.reason}</label>
                    <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t.reasonPlaceholder} className={`w-full rounded-2xl border px-4 py-3 ${darkMode ? "border-white/10 bg-[#0F1115]" : "border-slate-200 bg-slate-50"}`} />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-bold">{t.notes}</label>
                    <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder={t.notesPlaceholder} className={`w-full resize-none rounded-2xl border px-4 py-3 ${darkMode ? "border-white/10 bg-[#0F1115]" : "border-slate-200 bg-slate-50"}`} />
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button onClick={() => void saveAppointment()} disabled={savingAppointment} className="flex-1 rounded-2xl bg-blue-600 px-5 py-3.5 font-black text-white disabled:opacity-50">{savingAppointment ? t.saving : selectedAppointment ? t.reschedule : t.save}</button>
                    <button onClick={() => setModal(null)} className="rounded-2xl bg-white/[0.04] px-5 py-3.5 font-bold text-slate-400">{t.close}</button>
                  </div>
                </div>
              )}

              {(modal === "client" || modal === "both") && (
                <div className="space-y-4">
                  <div>
                    <label className="mb-2 block text-sm font-bold">{t.clientName}</label>
                    <input value={newClientName} onChange={(e) => setNewClientName(e.target.value)} className={`w-full rounded-2xl border px-4 py-3 ${darkMode ? "border-white/10 bg-[#0F1115]" : "border-slate-200 bg-slate-50"}`} />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-bold">{t.phone}</label>
                    <input value={newClientPhone} onChange={(e) => setNewClientPhone(e.target.value)} dir="ltr" className={`w-full rounded-2xl border px-4 py-3 ${darkMode ? "border-white/10 bg-[#0F1115]" : "border-slate-200 bg-slate-50"}`} />
                  </div>

                  {modal === "both" && (
                    <>
                      <div className="border-t border-white/10 pt-4">
                        <p className="text-sm font-black">{t.addPet}</p>
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-bold">{t.petName}</label>
                        <input value={newPetName} onChange={(e) => setNewPetName(e.target.value)} className={`w-full rounded-2xl border px-4 py-3 ${darkMode ? "border-white/10 bg-[#0F1115]" : "border-slate-200 bg-slate-50"}`} />
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <label className="mb-2 block text-sm font-bold">{t.species}</label>
                          <select value={newPetSpecies} onChange={(e) => setNewPetSpecies(e.target.value)} className={`w-full rounded-2xl border px-4 py-3 ${darkMode ? "border-white/10 bg-[#0F1115]" : "border-slate-200 bg-slate-50"}`}>
                            <option value="Cat">{t.cat}</option>
                            <option value="Dog">{t.dog}</option>
                            <option value="Other">{t.other}</option>
                          </select>
                        </div>

                        <div>
                          <label className="mb-2 block text-sm font-bold">{t.gender}</label>
                          <select value={newPetGender} onChange={(e) => setNewPetGender(e.target.value)} className={`w-full rounded-2xl border px-4 py-3 ${darkMode ? "border-white/10 bg-[#0F1115]" : "border-slate-200 bg-slate-50"}`}>
                            <option value="">—</option>
                            <option value="Male">{t.male}</option>
                            <option value="Female">{t.female}</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <label className="mb-2 block text-sm font-bold">{t.breed}</label>
                          <input value={newPetBreed} onChange={(e) => setNewPetBreed(e.target.value)} className={`w-full rounded-2xl border px-4 py-3 ${darkMode ? "border-white/10 bg-[#0F1115]" : "border-slate-200 bg-slate-50"}`} />
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-bold">{t.birthDate}</label>
                          <input type="date" value={newPetBirthDate} onChange={(e) => setNewPetBirthDate(e.target.value)} className={`w-full rounded-2xl border px-4 py-3 ${darkMode ? "border-white/10 bg-[#0F1115]" : "border-slate-200 bg-slate-50"}`} />
                        </div>
                      </div>

                      <div className="flex gap-3 pt-2">
                        <button onClick={() => void saveBoth()} className="flex-1 rounded-2xl bg-blue-600 px-5 py-3.5 font-black text-white">{t.saveBoth}</button>
                        <button onClick={() => setModal(null)} className="rounded-2xl bg-white/[0.04] px-5 py-3.5 font-bold text-slate-400">{t.close}</button>
                      </div>
                    </>
                  )}

                  {modal === "client" && (
                    <div className="flex gap-3 pt-2">
                      <button onClick={() => void saveNewClient("appointment")} className="flex-1 rounded-2xl bg-blue-600 px-5 py-3.5 font-black text-white">{t.saveClient}</button>
                      <button onClick={() => setModal(null)} className="rounded-2xl bg-white/[0.04] px-5 py-3.5 font-bold text-slate-400">{t.close}</button>
                    </div>
                  )}
                </div>
              )}

              {modal === "pet" && (
                <div className="space-y-4">
                  {!clientId && (
                    <div className="rounded-2xl bg-orange-500/10 px-4 py-3 text-sm font-semibold text-orange-400">
                      {language === "ar" ? "اختار العميل الأول من خلال موعد جديد أو أضف عميل." : "Choose or create a client first."}
                    </div>
                  )}

                  <div>
                    <label className="mb-2 block text-sm font-bold">{t.chooseClient}</label>
                    <select value={clientId} onChange={(e) => setClientId(e.target.value)} className={`w-full rounded-2xl border px-4 py-3 ${darkMode ? "border-white/10 bg-[#0F1115]" : "border-slate-200 bg-slate-50"}`}>
                      <option value="">{t.chooseClient}</option>
                      {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-bold">{t.petName}</label>
                    <input value={newPetName} onChange={(e) => setNewPetName(e.target.value)} className={`w-full rounded-2xl border px-4 py-3 ${darkMode ? "border-white/10 bg-[#0F1115]" : "border-slate-200 bg-slate-50"}`} />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-bold">{t.species}</label>
                      <select value={newPetSpecies} onChange={(e) => setNewPetSpecies(e.target.value)} className={`w-full rounded-2xl border px-4 py-3 ${darkMode ? "border-white/10 bg-[#0F1115]" : "border-slate-200 bg-slate-50"}`}>
                        <option value="Cat">{t.cat}</option>
                        <option value="Dog">{t.dog}</option>
                        <option value="Other">{t.other}</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-bold">{t.gender}</label>
                      <select value={newPetGender} onChange={(e) => setNewPetGender(e.target.value)} className={`w-full rounded-2xl border px-4 py-3 ${darkMode ? "border-white/10 bg-[#0F1115]" : "border-slate-200 bg-slate-50"}`}>
                        <option value="">—</option>
                        <option value="Male">{t.male}</option>
                        <option value="Female">{t.female}</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-bold">{t.breed}</label>
                      <input value={newPetBreed} onChange={(e) => setNewPetBreed(e.target.value)} className={`w-full rounded-2xl border px-4 py-3 ${darkMode ? "border-white/10 bg-[#0F1115]" : "border-slate-200 bg-slate-50"}`} />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-bold">{t.birthDate}</label>
                      <input type="date" value={newPetBirthDate} onChange={(e) => setNewPetBirthDate(e.target.value)} className={`w-full rounded-2xl border px-4 py-3 ${darkMode ? "border-white/10 bg-[#0F1115]" : "border-slate-200 bg-slate-50"}`} />
                    </div>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button onClick={() => void saveNewPet()} disabled={!clientId} className="flex-1 rounded-2xl bg-blue-600 px-5 py-3.5 font-black text-white disabled:opacity-50">{t.savePet}</button>
                    <button onClick={() => setModal(null)} className="rounded-2xl bg-white/[0.04] px-5 py-3.5 font-bold text-slate-400">{t.close}</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
