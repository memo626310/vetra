import { redirect } from "next/navigation";

// Legacy URL only. Review now lives at /settings/import/review.
export default function LegacyImportDryRunRedirect() {
  redirect("/settings/import/review");
}
