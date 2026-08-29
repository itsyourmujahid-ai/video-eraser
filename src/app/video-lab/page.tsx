import type { Metadata } from "next";

import { VideoLab } from "@/components/video-lab/VideoLab";

export const metadata: Metadata = {
  title: "Video Lab",
  description:
    "Remove logos, watermarks and burned-in text from videos — 100% in your browser, nothing ever uploaded. Video Eraser.",
  openGraph: {
    type: "website",
    siteName: "Video Eraser",
    title: "Video Lab · Video Eraser",
    description:
      "Remove logos, watermarks and burned-in text from videos — 100% in your browser, nothing ever uploaded.",
  },
};

export default function VideoLabPage() {
  return <VideoLab />;
}