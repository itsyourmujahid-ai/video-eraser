import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Video Eraser",
    short_name: "Video Eraser",
    description:
      "Remove logos, watermarks and burned-in text from videos — 100% in your browser, nothing ever uploaded.",
    start_url: "/video-lab",
    display: "standalone",
    background_color: "#070910",
    theme_color: "#070910",
    icons: [
      {
        src: "/video-eraser/icon.png",
        sizes: "any",
        type: "image/png",
      },
    ],
  };
}