"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getClinicContext, getClinicDb } from "@/lib/clinic-db";
import { clearClinicCache } from "@/lib/clinic-cache";
import { vetraCore } from "@/lib/vetra-core";
import { useStaffPermissions } from "@/lib/use-staff-permissions";
import ClinicCacheRefreshButton from "@/components/ClinicCacheRefreshButton";
import { buildPrescriptionPdfBlob, downloadBlob } from "@/lib/prescription-pdf";

type Language = "ar" | "en";

type LabRecord = {
  id: string;
  pet_id: string;
  client_id: string;
  visit_id: string | null;
  title: string;
  status: string | null;
  result: string | null;
  notes: string | null;
  performed_at: string | null;
  created_at: string;
};
type LabRequestGroup = { key: string; records: LabRecord[]; petId: string; clientId: string; visitId: string | null; createdAt: string };

type Pet = { id: string; name: string; species: string | null; client_id: string | null; birth_date: string | null };
type Client = { id: string; name: string; phone: string | null };
type LabCatalogItem = { id: string; name: string; category: string; clinicPrice: string; sampleType: string; turnaround: string };
type LabAttachment = { id: string; record_id: string; pet_id: string; file_name: string; storage_path: string; mime_type: string; size_bytes: number; created_at: string };

function errorMessage(value: unknown, fallback: string) {
  if (value instanceof Error && value.message) return value.message;
  const candidate = value as { message?: unknown } | null;
  return typeof candidate?.message === "string" && candidate.message ? candidate.message : fallback;
}

function formatDate(value: string | null, language: Language) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(language === "ar" ? "ar-EG" : "en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function LaboratoryDashboardPage() {
  const router = useRouter();
  const { loaded: permissionsLoaded, can } = useStaffPermissions();
  const [language, setLanguage] = useState<Language>("ar");
  const [records, setRecords] = useState<LabRecord[]>([]);
  const [attachmentsByRecord, setAttachmentsByRecord] = useState<Record<string, LabAttachment>>({});
  const [busyRecord, setBusyRecord] = useState<string | null>(null);
  const [sharingRequest, setSharingRequest] = useState<string | null>(null);
  const [petsById, setPetsById] = useState<Record<string, Pet>>({});
  const [clientsById, setClientsById] = useState<Record<string, Client>>({});
  const [clinicId, setClinicId] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [formPets, setFormPets] = useState<Pet[]>([]);
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [selectedClient, setSelectedClient] = useState("");
  const [selectedPet, setSelectedPet] = useState("");
  const [activePicker, setActivePicker] = useState<"client" | "pet" | null>(null);
  const [clientSearch, setClientSearch] = useState("");
  const [petSearch, setPetSearch] = useState("");
  const [newTests, setNewTests] = useState([""]);
  const [catalog, setCatalog] = useState<LabCatalogItem[]>([]);
  const [activeTestSearch, setActiveTestSearch] = useState<number | null>(null);
  const [newNotes, setNewNotes] = useState("");
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [success, setSuccess] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const ar = language === "ar";

  useEffect(() => {
    const saved = window.localStorage.getItem("vetra-language");
    if (saved === "en") setLanguage("en");
    void fetch("/data/lab-catalog.json")
      .then((response) => response.ok ? response.json() as Promise<LabCatalogItem[]> : [])
      .then((items) => setCatalog(Array.isArray(items) ? items : []))
      .catch((catalogError) => console.error("LAB CATALOG LOAD ERROR:", catalogError));
  }, []);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const context = await getClinicContext();
      setClinicId(context.clinic_id);
      const db = await getClinicDb();
      const result = await db
        .from("pet_medical_records")
        .select("id,pet_id,client_id,visit_id,title,status,result,notes,performed_at,created_at")
        .eq("clinic_id", context.clinic_id)
        .eq("record_type", "lab")
        .order("created_at", { ascending: false })
        .limit(500);
      if (result.error) throw result.error;

      const loaded = (result.data || []) as LabRecord[];
      const petIds = [...new Set(loaded.map((record) => record.pet_id).filter(Boolean))];
      const clientIds = [...new Set(loaded.map((record) => record.client_id).filter(Boolean))];
      const [petsResult, clientsResult] = await Promise.all([
        petIds.length
          ? db.from("pets").select("id,name,species,client_id,birth_date").in("id", petIds)
          : Promise.resolve({ data: [], error: null }),
        clientIds.length
          ? db.from("clients").select("id,name,phone").in("id", clientIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (petsResult.error) throw petsResult.error;
      if (clientsResult.error) throw clientsResult.error;
      const recordIds = loaded.map((record) => record.id);
      const attachmentsResult = recordIds.length
        ? await db.from("pet_medical_record_attachments").select("id,record_id,pet_id,file_name,storage_path,mime_type,size_bytes,created_at").in("record_id", recordIds)
        : { data: [], error: null };
      if (attachmentsResult.error) throw attachmentsResult.error;

      setRecords(loaded);
      setPetsById(Object.fromEntries(((petsResult.data || []) as Pet[]).map((pet) => [pet.id, pet])));
      setClientsById(Object.fromEntries(((clientsResult.data || []) as Client[]).map((client) => [client.id, client])));
      setAttachmentsByRecord(Object.fromEntries(((attachmentsResult.data || []) as LabAttachment[]).map((attachment) => [attachment.record_id, attachment])));
    } catch (loadError) {
      console.error("LABORATORY DASHBOARD LOAD ERROR:", loadError);
      setError(errorMessage(loadError, ar ? "تعذر تحميل طلبات التحاليل." : "Could not load laboratory requests."));
    } finally {
      setLoading(false);
    }
  }, [ar]);

  useEffect(() => {
    if (!permissionsLoaded) return;
    if (!can("medical_records", "view")) {
      router.replace("/dashboard");
      return;
    }
    void loadRecords();
  }, [permissionsLoaded, can, router, loadRecords]);

  const requestGroups = useMemo<LabRequestGroup[]>(() => {
    const groups = new Map<string, LabRequestGroup>();
    for (const record of records) {
      // Records saved in one insert share created_at. Visit requests are grouped by visit.
      const key = record.visit_id
        ? `visit:${record.visit_id}`
        : `standalone:${record.created_at}:${record.client_id}:${record.pet_id}`;
      const existing = groups.get(key);
      if (existing) existing.records.push(record);
      else groups.set(key, { key, records: [record], petId: record.pet_id, clientId: record.client_id, visitId: record.visit_id, createdAt: record.created_at });
    }
    return [...groups.values()].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [records]);

  const filteredGroups = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return requestGroups.filter((group) => {
      const pet = petsById[group.petId];
      const client = clientsById[group.clientId];
      const matchesStatus = statusFilter === "all" || group.records.some((record) => (record.status || "ordered") === statusFilter);
      const searchable = [...group.records.flatMap((record) => [record.title, record.result, record.notes]), pet?.name, pet?.species, client?.name, client?.phone]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase();
      return matchesStatus && (!normalized || searchable.includes(normalized));
    });
  }, [clientsById, petsById, query, requestGroups, statusFilter]);

  const statusLabel = (status: string | null) => {
    const value = status || "ordered";
    if (value === "completed") return ar ? "مكتمل" : "Completed";
    if (value === "cancelled") return ar ? "ملغي" : "Cancelled";
    if (value === "in_progress") return ar ? "قيد التنفيذ" : "In progress";
    return ar ? "مطلوب" : "Ordered";
  };

  const statusClass = (status: string | null) => {
    const value = status || "ordered";
    if (value === "completed") return "bg-emerald-400/10 text-emerald-300";
    if (value === "cancelled") return "bg-rose-400/10 text-rose-300";
    if (value === "in_progress") return "bg-amber-400/10 text-amber-200";
    return "bg-cyan-400/10 text-cyan-200";
  };

  const refresh = async () => {
    setRefreshing(true);
    if (clinicId) clearClinicCache(clinicId);
    try {
      await loadRecords();
    } finally {
      setRefreshing(false);
    }
  };

  const openNewOrder = async () => {
    setError("");
    setSuccess("");
    setShowNewOrder(true);
    if (clients.length) return;
    try {
      const db = await getClinicDb();
      const result = await db.from("clients").select("id,name,phone").order("name").limit(1000);
      if (result.error) throw result.error;
      setClients((result.data || []) as Client[]);
    } catch (loadError) {
      setError(errorMessage(loadError, ar ? "تعذر تحميل قائمة العملاء." : "Could not load clients."));
    }
  };

  const chooseClient = async (clientId: string) => {
    setSelectedClient(clientId);
    setSelectedPet("");
    setFormPets([]);
    if (!clientId) return;
    try {
      const db = await getClinicDb();
      const result = await db.from("pets").select("id,name,species,client_id,birth_date").eq("client_id", clientId).order("name");
      if (result.error) throw result.error;
      setFormPets((result.data || []) as Pet[]);
    } catch (loadError) {
      setError(errorMessage(loadError, ar ? "تعذر تحميل الحيوانات." : "Could not load pets."));
    }
  };

  const createStandaloneOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!can("medical_records", "create")) {
      setError(ar ? "ليس لديك صلاحية إنشاء طلبات التحاليل." : "You do not have permission to create lab requests.");
      return;
    }
    const titles = newTests.map((title) => title.trim()).filter(Boolean);
    if (!selectedClient || !selectedPet || !titles.length) {
      setError(ar ? "اختار العميل والحيوان واكتب اسم تحليل واحد على الأقل." : "Choose a client and pet, then enter at least one test.");
      return;
    }
    setCreatingOrder(true);
    setError("");
    setSuccess("");
    try {
      const context = await getClinicContext();
      const db = await getClinicDb();
      const result = await db.from("pet_medical_records").insert(titles.map((title) => ({
        clinic_id: context.clinic_id,
        pet_id: selectedPet,
        client_id: selectedClient,
        visit_id: null,
        record_type: "lab",
        title,
        status: "ordered",
        notes: newNotes.trim() || null,
      })));
      if (result.error) throw result.error;
      setShowNewOrder(false);
      setSelectedClient(""); setSelectedPet(""); setFormPets([]); setNewTests([""]); setNewNotes(""); setClientSearch(""); setPetSearch(""); setActivePicker(null);
      setSuccess(ar ? `تم إنشاء ${titles.length} طلب تحليل بنجاح.` : `${titles.length} lab request(s) created.`);
      await loadRecords();
    } catch (createError) {
      console.error("CREATE STANDALONE LAB ORDER ERROR:", createError);
      setError(errorMessage(createError, ar ? "تعذر إنشاء طلب التحليل." : "Could not create the lab request."));
    } finally {
      setCreatingOrder(false);
    }
  };

  const clinicToken = async () => {
    const { data } = await vetraCore.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error(ar ? "انتهت الجلسة. سجل الدخول مرة أخرى." : "Your session expired. Please sign in again.");
    return token;
  };

  const updateStatus = async (record: LabRecord, status: string) => {
    if (!can("medical_records", "edit")) return;
    setBusyRecord(record.id); setError(""); setSuccess("");
    try {
      const token = await clinicToken();
      const response = await fetch(`/api/pets/${encodeURIComponent(record.pet_id)}/lab-results`, {
        method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "status", record_id: record.id, status }),
      });
      const payload = await response.json() as { record?: LabRecord; error?: string };
      if (!response.ok || !payload.record) throw new Error(payload.error || (ar ? "تعذر تحديث الحالة." : "Could not update status."));
      setRecords((current) => current.map((item) => item.id === record.id ? payload.record! : item));
      if (clinicId) clearClinicCache(clinicId);
    } catch (updateError) {
      setError(errorMessage(updateError, ar ? "تعذر تحديث الحالة." : "Could not update status."));
    } finally { setBusyRecord(null); }
  };

  const updateRequestStatus = async (group: LabRequestGroup, status: string) => {
    if (!can("medical_records", "edit")) return false;
    const busyKey = `request:${group.key}`;
    setBusyRecord(busyKey); setError(""); setSuccess("");
    try {
      const token = await clinicToken();
      const response = await fetch(`/api/pets/${encodeURIComponent(group.petId)}/lab-results`, {
        method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "status-bulk", record_ids: group.records.map((record) => record.id), status }),
      });
      const payload = await response.json() as { records?: LabRecord[]; error?: string };
      if (!response.ok || !payload.records || payload.records.length !== group.records.length) throw new Error(payload.error || (ar ? "تعذر تحديث حالة الطلب." : "Could not update request status."));
      const updates = new Map(payload.records.map((record) => [record.id, record]));
      setRecords((current) => current.map((record) => updates.get(record.id) || record));
      if (clinicId) clearClinicCache(clinicId);
      return true;
    } catch (updateError) {
      setError(errorMessage(updateError, ar ? "تعذر تحديث حالة الطلب." : "Could not update request status."));
      return false;
    } finally { setBusyRecord(null); }
  };

  const uploadResult = async (record: LabRecord, file: File): Promise<boolean> => {
    setBusyRecord(record.id); setError(""); setSuccess("");
    try {
      const token = await clinicToken();
      const form = new FormData();
      form.append("record_id", record.id);
      form.append("title", record.title);
      form.append("notes", record.notes || "");
      form.append("performed_at", new Date().toISOString().slice(0, 10));
      form.append("result_rows", record.result || "[]");
      form.append("file", file);
      const response = await fetch(`/api/pets/${encodeURIComponent(record.pet_id)}/lab-results`, { method: "PATCH", headers: { Authorization: `Bearer ${token}` }, body: form });
      const payload = await response.json() as { record?: LabRecord; attachment?: LabAttachment; error?: string };
      if (!response.ok || !payload.record || !payload.attachment) throw new Error(payload.error || (ar ? "تعذر رفع التقرير." : "Could not upload report."));
      setRecords((current) => current.map((item) => item.id === record.id ? payload.record! : item));
      setAttachmentsByRecord((current) => ({ ...current, [record.id]: payload.attachment! }));
      setSuccess(ar ? `تم رفع تقرير ${record.title} وتحديث حالته إلى مكتمل.` : `${record.title} report uploaded and marked completed.`);
      if (clinicId) clearClinicCache(clinicId);
      return true;
    } catch (uploadError) {
      setError(errorMessage(uploadError, ar ? "تعذر رفع التقرير." : "Could not upload report."));
      return false;
    } finally { setBusyRecord(null); }
  };

  const uploadRequestReport = async (group: LabRequestGroup, file: File) => {
    const uploaded = await uploadResult(group.records[0], file);
    if (uploaded) {
      const updated = await updateRequestStatus(group, "completed");
      if (updated) setSuccess(ar ? "تم رفع تقرير الطلب وإكمال حالة كل التحاليل." : "Request report uploaded and all analyses marked completed.");
    }
  };

  const openReport = async (record: LabRecord, attachment: LabAttachment) => {
    setBusyRecord(record.id); setError("");
    let reportTab: Window | null = null;
    try {
      reportTab = window.open("about:blank", "_blank");
      if (!reportTab) throw new Error(ar ? "اسمح بالنوافذ المنبثقة لفتح تقرير التحليل." : "Allow pop-ups to open the lab report.");
      reportTab.opener = null;
      const token = await clinicToken();
      const response = await fetch(`/api/pets/${encodeURIComponent(record.pet_id)}/lab-results?attachment_id=${encodeURIComponent(attachment.id)}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const payload = await response.json() as { url?: string; error?: string };
      if (!response.ok || !payload.url) throw new Error(payload.error || (ar ? "تعذر فتح التقرير." : "Could not open report."));
      reportTab.location.replace(payload.url);
    } catch (openError) {
      reportTab?.close();
      setError(errorMessage(openError, ar ? "تعذر فتح التقرير." : "Could not open report."));
    } finally { setBusyRecord(null); }
  };

  const shareLabRequest = async (group: LabRequestGroup) => {
    const pet = petsById[group.petId];
    const client = clientsById[group.clientId];
    if (!pet || !client) {
      setError(ar ? "بيانات العميل أو الحيوان غير متاحة." : "Client or pet details are unavailable.");
      return;
    }
    setSharingRequest(group.key); setError(""); setSuccess("");
    try {
      const now = new Date();
      const dateParts = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", day: "2-digit", month: "2-digit", year: "2-digit" }).formatToParts(now);
      const datePart = (type: string) => dateParts.find((part) => part.type === type)?.value || "00";
      const orderDate = `${datePart("day")}/${datePart("month")}/${datePart("year")}`;
      let petAge = "Not available";
      if (pet.birth_date) {
        const birth = new Date(`${pet.birth_date.slice(0, 10)}T00:00:00`);
        const todayParts = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
        const todayPart = (type: string) => Number(todayParts.find((part) => part.type === type)?.value || 0);
        let years = todayPart("year") - birth.getFullYear();
        let months = todayPart("month") - (birth.getMonth() + 1);
        if (todayPart("day") < birth.getDate()) months -= 1;
        if (months < 0) { years -= 1; months += 12; }
        if (years < 0) petAge = "Not available";
        else petAge = [years ? `${years} ${ar ? "سنة" : years === 1 ? "year" : "years"}` : "", months ? `${months} ${ar ? "شهر" : months === 1 ? "month" : "months"}` : ""] .filter(Boolean).join(" ") || (ar ? "أقل من شهر" : "Less than a month");
      }
      const species = pet.species || "";
      const petType = /dog|canine|كلب/i.test(species) ? "DOG" : /cat|feline|قط/i.test(species) ? "CAT" : species.toUpperCase() || "DOG OR CAT";
      const normalizedTitle = (value: string) => value.toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
      const tests = group.records.map((record) => {
        const title = normalizedTitle(record.title);
        const catalogItem = catalog.find((item) => {
          const catalogName = normalizedTitle(item.name);
          return title === normalizedTitle(item.id) || title === catalogName || (title.length >= 3 && catalogName.includes(title));
        });
        return catalogItem ? `${record.title} (Test ID ${catalogItem.id})` : record.title;
      });

      const sheet = document.createElement("div");
      Object.assign(sheet.style, { position: "relative", width: "794px", height: "1123px", minHeight: "1123px", overflow: "hidden", backgroundColor: "#fff", color: "#17212b", fontFamily: "Arial, Helvetica, sans-serif", boxSizing: "border-box" });
      const background = document.createElement("img");
      background.src = "/vetra-prescription-template.png";
      background.alt = "";
      Object.assign(background.style, { position: "absolute", inset: "0", width: "794px", height: "1123px" });
      await background.decode();
      sheet.appendChild(background);
      const infoPanel = document.createElement("div");
      Object.assign(infoPanel.style, { position: "absolute", left: "337px", top: "77px", width: "430px", height: "220px", padding: "13px 12px 8px 20px", background: "#fff", borderLeft: "5px solid #20252a", boxSizing: "border-box", direction: "rtl" });
      const infoRows: Array<[string, string]> = [
        ["تاريخ الطلب", orderDate],
        ["اسم العميل", client.name || "—"],
        ["رقم الهاتف", client.phone || "—"],
        ["اسم الحيوان", pet.name || "—"],
        ["النوع", petType],
        ["العمر بتاريخ الطلب", petAge],
      ];
      for (const [label, value] of infoRows) {
        const row = document.createElement("div");
        Object.assign(row.style, { display: "grid", gridTemplateColumns: "135px minmax(0, 1fr)", alignItems: "center", minHeight: "32px", gap: "6px", borderBottom: "1px solid #e6e9eb", fontSize: "14px", lineHeight: "1.25" });
        const labelNode = document.createElement("div");
        labelNode.textContent = label;
        Object.assign(labelNode.style, { color: "#555e65", fontWeight: "700", textAlign: "right" });
        const valueNode = document.createElement("div");
        valueNode.textContent = value;
        valueNode.dir = "auto";
        Object.assign(valueNode.style, { color: "#111820", fontWeight: "800", textAlign: "right", overflowWrap: "anywhere" });
        row.append(labelNode, valueNode);
        infoPanel.appendChild(row);
      }
      sheet.appendChild(infoPanel);

      const heading = document.createElement("div");
      heading.textContent = "طلب تحاليل مخبرية  |  LABORATORY REQUEST";
      Object.assign(heading.style, { position: "absolute", top: "315px", left: "170px", width: "560px", paddingBottom: "12px", borderBottom: "2px solid #2674a9", color: "#12334a", fontSize: "19px", fontWeight: "800", textAlign: "center", direction: "rtl" });
      sheet.appendChild(heading);
      const testsList = document.createElement("div");
      Object.assign(testsList.style, { position: "absolute", top: "375px", left: "175px", width: "545px", direction: "rtl", color: "#17212b" });
      tests.forEach((test, index) => {
        const row = document.createElement("div");
        Object.assign(row.style, { display: "grid", gridTemplateColumns: "42px minmax(0, 1fr)", alignItems: "start", gap: "10px", minHeight: "39px", padding: "8px 4px", borderBottom: "1px solid #d7e0e5", boxSizing: "border-box", fontSize: "16px", lineHeight: "1.45" });
        const number = document.createElement("div");
        number.textContent = `${index + 1}.`;
        Object.assign(number.style, { color: "#1764a3", fontWeight: "800", direction: "ltr", textAlign: "center" });
        const title = document.createElement("div");
        title.textContent = test;
        title.dir = "auto";
        Object.assign(title.style, { color: "#101820", fontWeight: "700", overflowWrap: "anywhere" });
        row.append(number, title);
        testsList.appendChild(row);
      });
      sheet.appendChild(testsList);

      const rank = document.createElement("div");
      rank.innerHTML = `<span style="font-size:12px;color:#45535b">رقم العيادة</span><br><strong style="font-size:19px;color:#1764a3">53952</strong>`;
      Object.assign(rank.style, { position: "absolute", left: "170px", bottom: "157px", minWidth: "150px", textAlign: "center", lineHeight: "1.6" });
      sheet.appendChild(rank);
      const signature = document.createElement("div");
      signature.innerHTML = `<strong style="font-family:Georgia,serif;font-size:19px;color:#1764a3">VETRA Doctor</strong><div style="border-bottom:1px solid #1764a3;margin-top:8px"></div><span style="font-size:11px;color:#52616b">توقيع الطبيب البيطري</span>`;
      Object.assign(signature.style, { position: "absolute", right: "100px", bottom: "157px", width: "190px", textAlign: "center", lineHeight: "1.6" });
      sheet.appendChild(signature);

      const blob = await buildPrescriptionPdfBlob(sheet);
      sheet.remove();
      if (!blob.size) throw new Error(ar ? "تعذر إنشاء ملف PDF." : "Could not generate the PDF.");
      const safePetName = pet.name.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "Pet";
      const filename = `VETRA-Lab-Request-${safePetName}-${orderDate.replaceAll("/", "-")}.pdf`;
      const file = new File([blob], filename, { type: "application/pdf" });
      const shareFiles = [file];
      const canShareFile = typeof navigator !== "undefined" && typeof navigator.share === "function" && (!navigator.canShare || navigator.canShare({ files: shareFiles }));
      const summary = `VETRA lab request for ${pet.name}\nClient: ${client.name}\nTests: ${tests.join(", ")}`;
      if (canShareFile) {
        await navigator.share({ title: `VETRA Lab Request - ${pet.name}`, text: summary, files: shareFiles });
      } else {
        downloadBlob(blob, filename);
        const message = `${summary}\n\n${ar ? "تم تنزيل ملف الطلب. أرفقه في هذه المحادثة قبل الإرسال." : "The request PDF was downloaded. Attach it to this chat before sending."}`;
        window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
        setSuccess(ar ? "تم تجهيز الطلب. أرفق ملف PDF الذي تم تنزيله في محادثة واتساب." : "Request prepared. Attach the downloaded PDF in the WhatsApp chat.");
      }
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === "AbortError") return;
      setError(errorMessage(shareError, ar ? "تعذرت مشاركة طلب التحليل." : "Could not share the lab request."));
    } finally { setSharingRequest(null); }
  };

  const text = {
    title: ar ? "التحاليل" : "Laboratory",
    subtitle: ar ? "متابعة طلبات التحاليل ونتائجها في مكان واحد" : "Track laboratory requests and results in one place",
    back: ar ? "العودة للداشبورد" : "Back to dashboard",
    newOrder: ar ? "طلب تحليل جديد" : "New lab request",
    chooseClient: ar ? "اختر العميل" : "Choose client",
    choosePet: ar ? "اختر الحيوان" : "Choose pet",
    searchClient: ar ? "ابحث باسم العميل أو رقم الهاتف..." : "Search client name or phone...",
    searchPet: ar ? "ابحث باسم الحيوان أو النوع..." : "Search pet name or species...",
    noClientsFound: ar ? "لا يوجد عملاء مطابقون." : "No matching clients.",
    noPetsFound: ar ? "لا توجد حيوانات مطابقة لهذا العميل." : "No matching pets for this client.",
    testName: ar ? "اسم التحليل" : "Test name",
    addTest: ar ? "إضافة تحليل آخر" : "Add another test",
    labNotes: ar ? "ملاحظات للمعمل (اختياري)" : "Notes for the lab (optional)",
    createOrder: ar ? "إنشاء الطلب" : "Create request",
    cancel: ar ? "إلغاء" : "Cancel",
    openReport: ar ? "فتح التقرير" : "Open report",
    uploadReport: ar ? "رفع النتيجة" : "Upload result",
    cancelled: ar ? "ملغي" : "Cancelled",
    mixedStatus: ar ? "حالات مختلفة" : "Mixed statuses",
    requestReport: ar ? "تقرير الطلب" : "Request report",
    shareRequest: ar ? "مشاركة طلب PDF" : "Share request PDF",
    catalogHint: ar ? `ابحث في قائمة تحاليل المعمل (${catalog.length} تحليل)` : `Search the laboratory test catalog (${catalog.length} tests)`,
    noCatalogResults: ar ? "لا توجد نتائج في القائمة. يمكنك إدخال اسم مخصص." : "No catalog matches. You can enter a custom test name.",
    search: ar ? "ابحث باسم التحليل أو الحيوان أو العميل..." : "Search test, pet, or client...",
    all: ar ? "كل الحالات" : "All statuses",
    ordered: ar ? "مطلوب" : "Ordered",
    inProgress: ar ? "قيد التنفيذ" : "In progress",
    completed: ar ? "مكتمل" : "Completed",
    count: ar ? "طلب تحليل" : "lab requests",
    test: ar ? "التحليل" : "Test",
    pet: ar ? "الحيوان" : "Pet",
    client: ar ? "العميل" : "Client",
    status: ar ? "الحالة" : "Status",
    date: ar ? "تاريخ الطلب" : "Ordered on",
    details: ar ? "النتيجة والملاحظات" : "Result and notes",
    empty: ar ? "لا توجد طلبات تحاليل مطابقة." : "No matching laboratory requests.",
    loading: ar ? "جاري تحميل طلبات التحاليل..." : "Loading laboratory requests...",
    unavailable: ar ? "غير متاح" : "Unavailable",
    noResult: ar ? "لم تُسجل نتيجة بعد" : "No result yet",
    viewAnalyses: ar ? "عرض التحاليل" : "View lab results",
    setup: ar ? "تأكد من تشغيل جدول السجلات الطبية على قاعدة العيادة." : "Make sure the medical records table is enabled for this clinic.",
  };

  const total = requestGroups.length;
  const selectedClientRecord = clients.find((client) => client.id === selectedClient);
  const selectedPetRecord = formPets.find((pet) => pet.id === selectedPet);
  const filteredClients = clients.filter((client) => `${client.name} ${client.phone || ""}`.toLocaleLowerCase().includes(clientSearch.trim().toLocaleLowerCase())).slice(0, 50);
  const filteredPets = formPets.filter((pet) => `${pet.name} ${pet.species || ""}`.toLocaleLowerCase().includes(petSearch.trim().toLocaleLowerCase())).slice(0, 50);
  const completedCount = requestGroups.filter((group) => group.records.every((record) => record.status === "completed")).length;
  const pendingCount = requestGroups.filter((group) => group.records.some((record) => !record.status || ["ordered", "in_progress"].includes(record.status))).length;

  if (!permissionsLoaded) {
    return <main className="flex min-h-screen items-center justify-center bg-[#181c1d] p-6 text-sm font-semibold text-slate-400">{ar ? "جاري التحقق من الصلاحيات..." : "Checking permissions..."}</main>;
  }

  return (
    <main dir={ar ? "rtl" : "ltr"} className="min-h-screen overflow-x-hidden bg-[#181c1d] px-3 py-4 text-slate-100 sm:px-6 sm:py-8">
      <div className="mx-auto w-full max-w-7xl">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2 text-cyan-300"><span className="text-2xl" aria-hidden="true">🧪</span><span className="text-xs font-bold uppercase tracking-[0.16em]">VETRA LAB</span></div>
            <h1 className="text-2xl font-black sm:text-3xl">{text.title}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">{text.subtitle}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => { const next = ar ? "en" : "ar"; setLanguage(next); window.localStorage.setItem("vetra-language", next); }} className="rounded-lg border border-[#414849] bg-[#292e2f] px-3 py-2 text-sm font-bold">{ar ? "English" : "العربية"}</button>
            <ClinicCacheRefreshButton ar={ar} darkMode loading={refreshing} onRefresh={() => void refresh()} />
            {can("medical_records", "create") && <button type="button" onClick={() => void openNewOrder()} className="rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-bold text-slate-950">{text.newOrder}</button>}
            <Link href="/dashboard" className="rounded-xl bg-[#0B2540] px-4 py-2.5 text-sm font-bold text-white">{text.back}</Link>
          </div>
        </header>

        {error && <div role="alert" className="mb-4 rounded-xl border border-rose-400/30 bg-rose-400/10 p-3 text-sm font-semibold text-rose-200">{error}{!clients.length && <div className="mt-1 text-xs font-normal text-rose-200/70">{text.setup}</div>}</div>}
        {success && <div role="status" className="mb-4 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm font-semibold text-emerald-200">{success}</div>}

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cyan-400/20 bg-cyan-400/[0.06] p-4">
          <div><p className="font-black">{ar ? "إدارة طلبات المعمل" : "Manage laboratory requests"}</p><p className="mt-1 text-xs text-slate-400">{ar ? "أنشئ طلبًا مباشرًا للعميل والحيوان، أو تابع الطلبات ونتائجها أدناه." : "Create a request for a client and pet, then track requests and results below."}</p></div>
          {can("medical_records", "create") && <button type="button" onClick={() => void openNewOrder()} className="rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-black text-slate-950">＋ {text.newOrder}</button>}
        </div>

        {showNewOrder && can("medical_records", "create") && <div className="mb-4 rounded-2xl border border-cyan-400/20 bg-[#24292a] p-4 shadow-lg sm:p-6">
          <div className="mb-4 flex items-start justify-between gap-3"><div><h2 className="text-lg font-black">{text.newOrder}</h2><p className="mt-1 text-xs text-slate-400">{ar ? "هذا الطلب مستقل عن الزيارات." : "This request is independent of visits."}</p></div><button type="button" onClick={() => setShowNewOrder(false)} className="rounded-lg px-3 py-1 text-xl text-slate-400 hover:bg-white/5" aria-label={text.cancel}>×</button></div>
          <form onSubmit={(event) => void createStandaloneOrder(event)} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5 text-xs font-bold text-slate-300"><label htmlFor="lab-client-search">{text.chooseClient}</label><div className="relative"><input id="lab-client-search" type="search" value={activePicker === "client" ? clientSearch : selectedClientRecord ? `${selectedClientRecord.name}${selectedClientRecord.phone ? ` · ${selectedClientRecord.phone}` : ""}` : clientSearch} onFocus={() => { setClientSearch(""); setActivePicker("client"); }} onChange={(event) => { setClientSearch(event.target.value); setActivePicker("client"); }} placeholder={text.searchClient} autoComplete="off" aria-label={text.searchClient} aria-controls="lab-client-options" className="w-full rounded-lg border border-[#444b4d] bg-[#303536] px-3 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/15" />{activePicker === "client" && <div id="lab-client-options" role="listbox" className="absolute inset-x-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-xl border border-[#454d4e] bg-[#202526] p-1 shadow-2xl">{filteredClients.length ? filteredClients.map((client) => <button key={client.id} type="button" role="option" aria-selected={selectedClient === client.id} onMouseDown={(event) => event.preventDefault()} onClick={() => { setClientSearch(""); setActivePicker(null); void chooseClient(client.id); }} className="block w-full rounded-lg px-3 py-2.5 text-start hover:bg-cyan-400/10"><span className="block truncate text-sm font-bold text-slate-100">{client.name}</span>{client.phone && <span className="mt-0.5 block text-[11px] text-slate-400">{client.phone}</span>}</button>) : <p className="px-3 py-3 text-xs text-slate-400">{text.noClientsFound}</p>}</div>}</div></div>
              <div className="grid gap-1.5 text-xs font-bold text-slate-300"><label htmlFor="lab-pet-search">{text.choosePet}</label><div className="relative"><input id="lab-pet-search" type="search" value={activePicker === "pet" ? petSearch : selectedPetRecord ? `${selectedPetRecord.name}${selectedPetRecord.species ? ` · ${selectedPetRecord.species}` : ""}` : petSearch} onFocus={() => { setPetSearch(""); setActivePicker("pet"); }} onChange={(event) => { setPetSearch(event.target.value); setActivePicker("pet"); }} disabled={!selectedClient} placeholder={text.searchPet} autoComplete="off" aria-label={text.searchPet} aria-controls="lab-pet-options" className="w-full rounded-lg border border-[#444b4d] bg-[#303536] px-3 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/15 disabled:opacity-50" />{activePicker === "pet" && selectedClient && <div id="lab-pet-options" role="listbox" className="absolute inset-x-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-xl border border-[#454d4e] bg-[#202526] p-1 shadow-2xl">{filteredPets.length ? filteredPets.map((pet) => <button key={pet.id} type="button" role="option" aria-selected={selectedPet === pet.id} onMouseDown={(event) => event.preventDefault()} onClick={() => { setSelectedPet(pet.id); setPetSearch(""); setActivePicker(null); }} className="block w-full rounded-lg px-3 py-2.5 text-start hover:bg-cyan-400/10"><span className="block truncate text-sm font-bold text-slate-100">{pet.name}</span>{pet.species && <span className="mt-0.5 block text-[11px] text-slate-400">{pet.species}</span>}</button>) : <p className="px-3 py-3 text-xs text-slate-400">{text.noPetsFound}</p>}</div>}</div></div>
            </div>
            <div className="space-y-2">
              <div><div className="text-xs font-bold text-slate-300">{text.testName}</div><p className="mt-1 text-[11px] text-cyan-300/80">{text.catalogHint}</p></div>
              {newTests.map((test, index) => {
                const normalized = test.trim().toLocaleLowerCase();
                const matches = normalized ? catalog.filter((item) => [item.id, item.name, item.category].some((value) => value.toLocaleLowerCase().includes(normalized))).slice(0, 8) : [];
                return <div key={index} className="relative flex gap-2">
                  <div className="min-w-0 flex-1">
                    <input required={index === 0} value={test} onFocus={() => setActiveTestSearch(index)} onChange={(event) => setNewTests((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} placeholder={ar ? "ابحث باسم التحليل أو رقمه — مثال CBC" : "Search test name or ID — e.g. CBC"} aria-label={`${text.testName} ${index + 1}`} autoComplete="off" className="w-full min-w-0 rounded-lg border border-[#444b4d] bg-[#303536] px-3 py-3 text-sm text-slate-100 placeholder:text-slate-500" />
                    {normalized && activeTestSearch === index && <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-xl border border-[#454d4e] bg-[#202526] p-1 shadow-2xl">
                      {!catalog.length ? <p className="px-3 py-3 text-xs text-slate-400">{ar ? "جاري تحميل قائمة التحاليل..." : "Loading test catalog..."}</p> : matches.length ? matches.map((item) => <button key={`${index}-${item.id}`} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { setNewTests((current) => current.map((value, itemIndex) => itemIndex === index ? item.name : value)); setActiveTestSearch(null); }} className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-start hover:bg-cyan-400/10">
                        <span className="min-w-0"><span className="block truncate text-sm font-bold text-slate-100">{item.name}</span><span className="mt-1 block truncate text-[11px] text-slate-400">{item.category} · #{item.id}{item.sampleType ? ` · ${ar ? "العينة" : "Sample"}: ${item.sampleType}` : ""}</span></span>
                        <span className="shrink-0 text-end text-[11px] font-bold text-cyan-200">{item.clinicPrice ? `${item.clinicPrice} ${ar ? "ج.م" : "EGP"}` : ""}{item.turnaround ? <span className="mt-1 block font-medium text-slate-400">{item.turnaround}</span> : null}</span>
                      </button>) : <p className="px-3 py-3 text-xs text-slate-400">{text.noCatalogResults}</p>}
                    </div>}
                  </div>
                  {newTests.length > 1 && <button type="button" onClick={() => setNewTests((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="rounded-lg px-3 text-rose-300 hover:bg-rose-400/10" aria-label={ar ? "حذف التحليل" : "Remove test"}>×</button>}
                </div>;
              })}
              <button type="button" onClick={() => setNewTests((current) => [...current, ""])} className="rounded-lg border border-dashed border-cyan-400/30 px-3 py-2 text-xs font-bold text-cyan-200">＋ {text.addTest}</button>
            </div>
            <label className="grid gap-1.5 text-xs font-bold text-slate-300">{text.labNotes}<textarea value={newNotes} onChange={(event) => setNewNotes(event.target.value)} rows={2} className="rounded-lg border border-[#444b4d] bg-[#303536] px-3 py-3 text-sm text-slate-100 placeholder:text-slate-500" /></label>
            <div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={() => setShowNewOrder(false)} className="rounded-xl border border-[#444b4d] px-4 py-2.5 text-sm font-bold text-slate-300">{text.cancel}</button><button type="submit" disabled={creatingOrder || !clients.length} className="rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-black text-slate-950 disabled:opacity-50">{creatingOrder ? (ar ? "جاري الإنشاء..." : "Creating...") : text.createOrder}</button></div>
          </form>
        </div>}

        <section className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[[ar ? "إجمالي الطلبات" : "Total requests", total, "bg-cyan-400/10 text-cyan-200"], [ar ? "قيد المتابعة" : "Pending", pendingCount, "bg-amber-400/10 text-amber-200"], [ar ? "النتائج المكتملة" : "Completed results", completedCount, "bg-emerald-400/10 text-emerald-200"]].map(([label, value, color]) => <div key={String(label)} className="rounded-xl border border-[#343a3b] bg-[#24292a] p-4"><p className="text-xs font-bold text-slate-400">{label}</p><p className={`mt-2 text-2xl font-black ${color}`}>{value}</p></div>)}
        </section>

        <section className="mb-4 rounded-xl border border-[#343a3b] bg-[#24292a] p-3 sm:p-4">
          <div className="flex flex-col gap-3 lg:flex-row">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={text.search} aria-label={text.search} className="w-full min-w-0 rounded-lg border border-[#444b4d] bg-[#303536] px-3 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/15" />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label={text.status} className="rounded-lg border border-[#444b4d] bg-[#303536] px-3 py-3 text-sm font-semibold text-slate-100 outline-none focus:border-cyan-400 lg:w-52">
              <option value="all">{text.all}</option><option value="ordered">{text.ordered}</option><option value="in_progress">{text.inProgress}</option><option value="completed">{text.completed}</option>
            </select>
          </div>
          <div className="mt-3 text-sm font-semibold text-slate-400">{filteredGroups.length} {ar ? "طلب" : "requests"}</div>
        </section>

        <section className="overflow-hidden rounded-xl border border-[#343a3b] bg-[#24292a] shadow-sm">
          {loading ? <div className="py-14 text-center text-sm font-semibold text-slate-400">{text.loading}</div> : filteredGroups.length === 0 ? <div className="py-14 text-center text-sm text-slate-400">{text.empty}</div> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] text-start">
                <thead className="border-b border-[#3c4344] bg-[#303637] text-xs uppercase tracking-wider text-slate-400"><tr>{[text.test, text.pet, text.client, text.status, text.date, text.details].map((heading) => <th key={heading} className="px-4 py-4 font-bold">{heading}</th>)}</tr></thead>
                <tbody className="divide-y divide-[#3c4344]">
                  {filteredGroups.map((group) => {
                    const pet = petsById[group.petId];
                    const client = clientsById[group.clientId];
                    const notes = [...new Set(group.records.map((record) => record.notes).filter((note): note is string => Boolean(note)))];
                    const firstStatus = group.records[0]?.status || "ordered";
                    const requestStatus = group.records.every((record) => (record.status || "ordered") === firstStatus) ? firstStatus : "mixed";
                    const requestAttachment = group.records.map((record) => attachmentsByRecord[record.id]).find(Boolean);
                    const requestBusyKey = `request:${group.key}`;
                    return <tr key={group.key} className="transition hover:bg-white/[0.03]">
                      <td className="max-w-[320px] px-4 py-4 align-top"><div className="mb-2 flex flex-wrap items-center gap-2"><span className="rounded-md bg-cyan-400/10 px-2 py-1 text-[10px] font-black text-cyan-200">{group.records.length} {ar ? "تحاليل" : "tests"}</span>{group.visitId && <span className="text-[11px] text-slate-500">{ar ? "مرتبط بزيارة" : "Visit request"}</span>}{can("medical_records", "edit") ? <select aria-label={ar ? "حالة الطلب بالكامل" : "Full request status"} disabled={busyRecord === requestBusyKey} value={requestStatus} onChange={(event) => void updateRequestStatus(group, event.target.value)} className={`max-w-36 rounded-full border-0 px-2.5 py-1 text-xs font-bold outline-none ${requestStatus === "mixed" ? "bg-violet-400/10 text-violet-200" : statusClass(requestStatus)} disabled:opacity-50`}><option value="mixed" disabled>{text.mixedStatus}</option><option value="ordered">{ar ? "مطلوب" : "Ordered"}</option><option value="in_progress">{ar ? "قيد التنفيذ" : "In progress"}</option><option value="completed">{ar ? "مكتمل" : "Completed"}</option><option value="cancelled">{text.cancelled}</option></select> : <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${requestStatus === "mixed" ? "bg-violet-400/10 text-violet-200" : statusClass(requestStatus)}`}>{requestStatus === "mixed" ? text.mixedStatus : statusLabel(requestStatus)}</span>}</div><ul className="space-y-1.5">{group.records.map((record) => <li key={record.id} className="font-bold">{record.title}</li>)}</ul></td>
                      <td className="px-4 py-4 align-top"><p className="font-semibold">{pet?.name || text.unavailable}</p><p className="mt-1 text-xs text-slate-500">{pet?.species || ""}</p></td>
                      <td className="px-4 py-4 align-top"><p className="font-semibold">{client?.name || text.unavailable}</p><p className="mt-1 text-xs text-slate-500">{client?.phone || ""}</p></td>
                      <td className="min-w-[150px] px-4 py-4 align-top"><div className="space-y-2">{group.records.map((record) => <div key={record.id} className="flex items-center gap-2"><span className="max-w-28 truncate text-[11px] font-semibold text-slate-300" title={record.title}>{record.title}</span>{can("medical_records", "edit") ? <select aria-label={`${ar ? "حالة" : "Status"}: ${record.title}`} disabled={busyRecord === record.id} value={record.status || "ordered"} onChange={(event) => void updateStatus(record, event.target.value)} className={`max-w-32 rounded-full border-0 px-2.5 py-1 text-xs font-bold outline-none ${statusClass(record.status)} disabled:opacity-50`}><option value="ordered">{ar ? "مطلوب" : "Ordered"}</option><option value="in_progress">{ar ? "قيد التنفيذ" : "In progress"}</option><option value="completed">{ar ? "مكتمل" : "Completed"}</option><option value="cancelled">{text.cancelled}</option></select> : <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${statusClass(record.status)}`}>{statusLabel(record.status)}</span>}</div>)}</div></td>
                      <td className="whitespace-nowrap px-4 py-4 align-top text-sm text-slate-300">{formatDate(group.createdAt, language)}</td>
                      <td className="max-w-[290px] px-4 py-4 align-top text-sm text-slate-300"><div className="mb-3 flex flex-wrap gap-1.5"><button type="button" disabled={sharingRequest === group.key || !pet || !client} onClick={() => void shareLabRequest(group)} className="rounded-lg bg-emerald-400/10 px-2.5 py-1.5 text-[11px] font-black text-emerald-200 hover:bg-emerald-400/20 disabled:opacity-50">{sharingRequest === group.key ? "…" : `↗ ${text.shareRequest}`}</button>{requestAttachment && <button type="button" disabled={busyRecord === requestAttachment.record_id} onClick={() => { const record = group.records.find((item) => item.id === requestAttachment.record_id); if (record) void openReport(record, requestAttachment); }} className="rounded-lg bg-cyan-400 px-3 py-2 text-xs font-black text-slate-950 disabled:opacity-50">↗ {text.viewAnalyses}</button>}{can("medical_records", "edit") && <label className="cursor-pointer rounded-lg border border-cyan-300/30 px-2.5 py-1.5 text-[11px] font-black text-cyan-200 hover:bg-cyan-400/10">{busyRecord === requestBusyKey || busyRecord === group.records[0]?.id ? "…" : `↑ ${text.uploadReport} · ${text.requestReport}`}<input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="sr-only" disabled={busyRecord === requestBusyKey || busyRecord === group.records[0]?.id} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadRequestReport(group, file); event.currentTarget.value = ""; }} /></label>}</div><div className="space-y-3">{group.records.map((record) => { const attachment = attachmentsByRecord[record.id]; return <div key={record.id} className="min-w-40"><p className="line-clamp-2">{record.result || text.noResult}</p><div className="mt-1 flex flex-wrap gap-1.5">{attachment && attachment.id !== requestAttachment?.id && <button type="button" disabled={busyRecord === record.id} onClick={() => void openReport(record, attachment)} className="rounded-lg bg-cyan-400/10 px-2.5 py-1.5 text-[11px] font-black text-cyan-200 disabled:opacity-50">{text.openReport}</button>}{can("medical_records", "edit") && <label className="cursor-pointer rounded-lg border border-[#475152] px-2.5 py-1.5 text-[11px] font-bold text-slate-300 hover:border-cyan-300/40">{busyRecord === record.id ? "…" : attachment ? (ar ? "استبدال الملف" : "Replace file") : text.uploadReport}<input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="sr-only" disabled={busyRecord === record.id} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadResult(record, file); event.currentTarget.value = ""; }} /></label>}</div></div>; })}{notes.map((note) => <p key={note} className="line-clamp-2 text-xs text-slate-500">{note}</p>)}</div></td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
