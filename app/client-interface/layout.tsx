import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import ClientAppInstallPrompt from "@/components/client-interface/ClientAppInstallPrompt";

export const metadata: Metadata = {
  title: "VETRA Care",
  description: "Your pet's health records, vaccines, and care reminders.",
  applicationName: "VETRA Care",
  manifest: "/client-interface/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "VETRA",
    statusBarStyle: "default",
  },
  icons: {
    apple: [
      {
        url: "/client-interface/icons/icon-180",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0B2540",
};

export default function ClientInterfaceLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <>
      {children}
      <ClientAppInstallPrompt />
    </>
  );
}