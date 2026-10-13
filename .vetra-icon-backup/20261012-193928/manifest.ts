import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/client-interface",
    name: "VETRA Care",
    short_name: "VETRA",
    description: "Your pet's health records, vaccines, and care reminders.",
    start_url: "/client-interface",
    scope: "/client-interface",
    display: "standalone",
    display_override: ["standalone"],
    orientation: "portrait",
    background_color: "#08183B",
    theme_color: "#0B2D67",
    lang: "en",
    dir: "auto",
    categories: ["medical", "lifestyle"],
    icons: [
      {
        src: "/vetra-icons/vetra-client-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/vetra-icons/vetra-client-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/vetra-icons/vetra-client-icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}