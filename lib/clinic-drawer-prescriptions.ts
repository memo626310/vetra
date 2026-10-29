export type DrawerMedication = {
  id: string;
  product_id: string;
  quantity: number;
  prescriptionName?: string;
  prescriptionUnit?: string;
};

type ClinicDrawerPrescription = {
  productId: string;
  quantity: number;
  unit: string;
  showOnPrescription: boolean;
};

export type ClinicMedicationEntry = { id: string; name: string; quantity: number; unit: string };

const PREFIX = "[Clinic drawer medication:v1] ";

export function serializeClinicDrawerPrescription(value: ClinicDrawerPrescription): string {
  return PREFIX + JSON.stringify(value);
}

export function parseClinicDrawerPrescription(value: unknown): ClinicDrawerPrescription | null {
  if (typeof value !== "string" || !value.startsWith(PREFIX)) return null;
  try {
    const data = JSON.parse(value.slice(PREFIX.length));
    if (!data || typeof data !== "object" || typeof data.productId !== "string" || !data.productId
      || typeof data.quantity !== "number" || !Number.isFinite(data.quantity) || data.quantity <= 0
      || typeof data.unit !== "string" || typeof data.showOnPrescription !== "boolean") return null;
    return { productId: data.productId, quantity: data.quantity, unit: data.unit, showOnPrescription: data.showOnPrescription };
  } catch { return null; }
}

export function isClinicDrawerPrescription(value: { prescription?: unknown }): boolean {
  return parseClinicDrawerPrescription(value.prescription) !== null;
}

export function clinicDrawerPrescriptionRows(
  medications: DrawerMedication[],
  products: { id: string; name: string; unit: string | null }[],
  clinicId: string,
  visitId: string,
  showOnPrescription: boolean,
) {
  return medications.flatMap((item) => {
    const product = products.find((candidate) => candidate.id === item.product_id);
    const name = product?.name || item.prescriptionName;
    if (!name || !Number.isFinite(item.quantity) || item.quantity <= 0) return [];
    return [{
      id: item.id, clinic_id: clinicId, visit_id: visitId,
      // These rows only control prescription display. Drawer billing and stock
      // remain attached to the existing medication-drawer workflow.
      product_id: null,
      medication_name: name,
      active_ingredient: null,
      prescription: serializeClinicDrawerPrescription({
        productId: item.product_id, quantity: item.quantity,
        unit: product?.unit || item.prescriptionUnit || "", showOnPrescription,
      }),
      source: "manual" as const,
    }];
  });
}

export function clinicDrawerMedicationEntries(rows: { id: string; medication_name: string; prescription?: unknown }[]): ClinicMedicationEntry[] {
  return rows.flatMap((row) => {
    const prescription = parseClinicDrawerPrescription(row.prescription);
    return prescription?.showOnPrescription
      ? [{ id: row.id, name: row.medication_name, quantity: prescription.quantity, unit: prescription.unit }]
      : [];
  });
}
