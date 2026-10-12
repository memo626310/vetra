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
    icon: [
      {
        url: "/vetra-client-icons-20261012-androidfix/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        url: "/vetra-client-icons-20261012-androidfix/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
    apple: [
      {
        url: "/vetra-client-icons-20261012/icon-180.png",
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