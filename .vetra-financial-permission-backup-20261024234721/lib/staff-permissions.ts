export type PermissionAction = "view" | "create" | "edit" | "delete" | "export";

export type StaffPermissions = Record<string, Partial<Record<PermissionAction, boolean>>>;

export type PermissionDefinition = {
  key: string;
  ar: string;
  en: string;
  actions: PermissionAction[];
};

export const permissionActions: Array<{ key: PermissionAction; ar: string; en: string }> = [
  { key: "view", ar: "عرض", en: "View" },
  { key: "create", ar: "إضافة", en: "Add" },
  { key: "edit", ar: "تعديل", en: "Edit" },
  { key: "delete", ar: "حذف", en: "Delete" },
  { key: "export", ar: "تصدير", en: "Export" },
];

export const permissionDefinitions: PermissionDefinition[] = [
  { key: "patients", ar: "المرضى والعملاء", en: "Patients and clients", actions: ["view", "create", "edit", "delete", "export"] },
  { key: "all_patients", ar: "مشاهدة كل المرضى", en: "View all patients", actions: ["view"] },
  { key: "appointments", ar: "المواعيد", en: "Appointments", actions: ["view", "create", "edit", "delete"] },
  { key: "medical_records", ar: "الملفات والسجلات الطبية", en: "Medical records", actions: ["view", "create", "edit", "delete", "export"] },
  { key: "prescriptions", ar: "الوصفات والأدوية", en: "Prescriptions and medications", actions: ["view", "create", "edit", "delete", "export"] },
  { key: "vaccinations", ar: "التطعيمات", en: "Vaccinations", actions: ["view", "create", "edit", "delete", "export"] },
  { key: "invoices_page", ar: "صفحة الفواتير", en: "Invoices page", actions: ["view"] },
  { key: "invoices", ar: "الفواتير", en: "Invoices", actions: ["view", "create", "edit", "delete", "export"] },
  { key: "finance_page", ar: "صفحة المالية", en: "Finance page", actions: ["view"] },
  { key: "payments", ar: "المدفوعات والخزينة", en: "Payments and cash register", actions: ["view", "create", "edit", "delete", "export"] },
  { key: "inventory", ar: "المخزون والمنتجات", en: "Inventory and products", actions: ["view", "create", "edit", "delete", "export"] },
  { key: "reports", ar: "التقارير", en: "Reports", actions: ["view", "export"] },
  { key: "messages", ar: "الرسائل", en: "Messages", actions: ["view", "create", "delete"] },
  { key: "staff", ar: "الموظفون والصلاحيات", en: "Staff and permissions", actions: ["view", "create", "edit", "delete"] },
  { key: "clinic_settings", ar: "إعدادات العيادة", en: "Clinic settings", actions: ["view", "edit"] },
];

export function defaultStaffPermissions(staffType: "doctor" | "assistant" | "front_desk"): StaffPermissions {
  const result: StaffPermissions = {};
  for (const definition of permissionDefinitions) {
    result[definition.key] = {};
  }
  const grant = (key: string, actions: PermissionAction[]) => {
    result[key] = Object.fromEntries(actions.map((action) => [action, true]));
  };
  if (staffType === "doctor") {
    for (const key of ["patients", "all_patients", "appointments", "medical_records", "prescriptions", "vaccinations"]) grant(key, ["view", "create", "edit"]);
    grant("reports", ["view"]);
  } else if (staffType === "assistant") {
    for (const key of ["patients", "appointments", "medical_records", "vaccinations"]) grant(key, ["view", "create", "edit"]);
  } else {
    grant("patients", ["view", "create", "edit"]);
    grant("appointments", ["view", "create", "edit", "delete"]);
    grant("invoices", ["view", "create"]);
    grant("invoices_page", ["view"]);
    grant("payments", ["view", "create"]);
    grant("finance_page", ["view"]);
  }
  return result;
}

export function fullStaffPermissions(): StaffPermissions {
  return Object.fromEntries(permissionDefinitions.map((definition) => [
    definition.key,
    Object.fromEntries(definition.actions.map((action) => [action, true])),
  ]));
}

export function permissionForPath(pathname: string): { key: string; action: PermissionAction } | null {
  if (pathname.startsWith("/finance")) return { key: "finance_page", action: "view" };
  if (pathname.startsWith("/visits/new")) return { key: "medical_records", action: "create" };
  if (pathname.startsWith("/invoices/new")) return { key: "invoices", action: "create" };
  if (pathname.startsWith("/invoices")) return { key: "invoices_page", action: "view" };
  if (pathname.startsWith("/inventory/purchases")) return { key: "inventory", action: "create" };
  if (pathname.startsWith("/inventory")) return { key: "inventory", action: "view" };
  if (pathname.startsWith("/barcode-test")) return { key: "inventory", action: "view" };
  if (pathname.startsWith("/clients") || pathname.startsWith("/pets")) return { key: "patients", action: "view" };
  if (pathname.startsWith("/appointments")) return { key: "appointments", action: "view" };
  if (pathname.startsWith("/visits") || pathname.startsWith("/dashboard/visits")) return { key: "medical_records", action: "view" };
  if (pathname.startsWith("/vaccinations")) return { key: "vaccinations", action: "view" };
  if (pathname.startsWith("/reports")) return { key: "reports", action: "view" };
  if (pathname.startsWith("/messages")) return { key: "messages", action: "view" };
  if (pathname.startsWith("/staff")) return { key: "staff", action: "view" };
  if (pathname.startsWith("/settings")) return { key: "clinic_settings", action: "edit" };
  if (pathname.startsWith("/dashboard/clients-activity")) return { key: "patients", action: "view" };
  return null;
}

export function normalizeStaffPermissions(value: unknown, fallbackType: "doctor" | "assistant" | "front_desk" = "doctor"): StaffPermissions {
  const fallback = defaultStaffPermissions(fallbackType);
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const source = value as Record<string, unknown>;
  for (const definition of permissionDefinitions) {
    const sourceGroup = source[definition.key];
    if (!sourceGroup || typeof sourceGroup !== "object" || Array.isArray(sourceGroup)) continue;
    const group = sourceGroup as Record<string, unknown>;
    fallback[definition.key] = Object.fromEntries(definition.actions.map((action) => [action, group[action] === true]));
  }
  return fallback;
}

export function hasStaffPermission(permissions: StaffPermissions, key: string, action: PermissionAction) {
  return permissions[key]?.[action] === true;
}
