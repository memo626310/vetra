import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "VETRA Pet Care",
    short_name: "VETRA",
    description: "VETRA Pet Care Portal",
    start_url: "/client-interface",
    display: "standalone",
    background_color: "#F8FBFF",
    theme_color: "#07111C",
    orientation: "portrait",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
