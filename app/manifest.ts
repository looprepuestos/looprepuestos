import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LOOP REPUESTOS",
    short_name: "LOOP",
    description: "Repuestos e insumos para celulares",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/logo-loop.png", sizes: "256x256", type: "image/png", purpose: "any" },
      { src: "/logo-loop.png", sizes: "256x256", type: "image/png", purpose: "maskable" },
    ],
  };
}
