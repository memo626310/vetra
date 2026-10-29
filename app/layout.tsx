import type { Metadata } from "next";
import "./globals.css";
import AuthGuard from "@/components/AuthGuard";
import ClinicMobileNavigation from "@/components/ClinicMobileNavigation";
import PwaInstallProvider from "@/components/PwaInstallProvider";
import ThemeBridge from "@/components/ThemeBridge";
import { StaffPermissionsProvider } from "@/lib/use-staff-permissions";

export const metadata: Metadata = {
  title: "VETRA",
  description: "Veterinary Clinic Management System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <ThemeBridge />
        <PwaInstallProvider>
          <StaffPermissionsProvider>
            <AuthGuard>{children}</AuthGuard>
            <ClinicMobileNavigation />
          </StaffPermissionsProvider>
        </PwaInstallProvider>
      </body>
    </html>
  );
}
