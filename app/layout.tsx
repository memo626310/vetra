import type { Metadata } from "next";
import "./globals.css";
import AuthGuard from "@/components/AuthGuard";
import ClinicMobileNavigation from "@/components/ClinicMobileNavigation";
import PwaInstallProvider from "@/components/PwaInstallProvider";

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
        <PwaInstallProvider>
          <AuthGuard>{children}</AuthGuard>
          <ClinicMobileNavigation />
        </PwaInstallProvider>
      </body>
    </html>
  );
}