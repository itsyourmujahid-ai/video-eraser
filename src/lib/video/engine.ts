import { formatBytes } from "@/lib/image/engine";
import type {
  CleanPatch,
  EraseResult,
  ExportCallbacks,
  ExportOptions,
  ExportResolution,
  MarkRegion,
  SourceVideo,
} from "./types";

export { formatBytes };

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function makeVideo(src: string): HTMLVideoElement {
  const video = document.createElement("video");
  video.preload = "auto";
  video.playsInline = true;
  video.muted = true;
  video.src = src;
  return video;
}

export function loadSourceVideo(file: File): Promise<SourceVideo> {
  if (!file.type.startsWith("video/")) {
    return Promise.reject(
      new Error("That file is not a video. Please upload an MP4, WebM or MOV."),
    );
  }

  const objectUrl = URL.createObjectURL(file);
  const video = makeVideo(objectUrl);

  return new Promise<SourceVideo>((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("error", onError);
    };
    const onLoaded = () => {
      cleanup();
      if (
        !video.videoWidth ||
        !video.videoHeight ||
        !Number.isFinite(video.duration) ||
        video.duration <= 0
      ) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("The video has no usable frames."));
        return;
      }
      const dot = file.name.lastIndexOf(".");
      resolve({
        file,
        name: file.name,
        baseName: dot > 0 ? file.name.slice(0, dot) : file.name,
        objectUrl,
        width: video.videoWidth,
        height: video.videoHeight,
        duration: video.duration,
        bytes: file.size,
      });
    };
    const onError = () => {
      cleanup();
      URL.revokeObjectURL(objectUrl);
      reject(new Error("The video could not be loaded. It may be corrupted or unsupported."));
    };
    video.addEventListener("loadedmetadata", onLoaded);
    video.addEventListener("error", onError);
  });
}

export function resolveExportSize(
  source: SourceVideo,
  resolution: ExportResolution,
): { width: number; height: number } {
  const caps: Record<ExportResolution, number> = {
    original: Infinity,
    "1080p": 1920,
    "720p": 1280,
    "480p": 854,
  };
  const maxDim = caps[resolution];
  const natural = Math.max(source.width, source.height);
  const scale = natural <= maxDim ? 1 : maxDim / natural;
  const width = Math.max(2, Math.round(source.width * scale));
  const height = Math.max(2, Math.round(source.height * scale));
  return { width: width & ~1, height: height & ~1 };
}

export function regionsToRects(
  regions: MarkRegion[],
  width: number,
  height: number,
): Array<{ x: number; y: number; w: number; h: number }> {
  return regions.map((r) => {
    const x = Math.round(r.x * width);
    const y = Math.round(r.y * height);
    const x2 = Math.min(width, x + Math.round(r.width * width));
    const y2 = Math.min(height, y + Math.round(r.height * height));
    return { x: Math.max(0, x), y: Math.max(0, y), w: Math.max(0, x2 - x), h: Math.max(0, y2 - y) };
  });
}

function seekTo(video: HTMLVideoElement, t: number): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (!settled) {
        settled = true;
        cleanup();
        resolve(true);
      }
    };
    const fail = () => {
      if (!settled) {
        settled = true;
        cleanup();
        resolve(false);
      }
    };
    const cleanup = () => {
      video.removeEventListener("seeked", done);
      video.removeEventListener("error", fail);
      window.clearTimeout(timer);
    };
    const timer = window.setTimeout(done, 3500);
    video.addEventListener("seeked", done);
    video.addEventListener("error", fail);
    try {
      video.currentTime = t;
    } catch {
      fail();
    }
  });
}

const PLATE_MARGIN = 3;
const STUCK_STDDEV = 6;

/**
 * Wavefront inpainting: fills "unknown" pixels by repeatedly averaging their
 * known neighbours, marching inward from the boundary. Only runs once on the
 * clean plate, so the per-frame export cost stays a single blit.
 */
function fillStuckPixels(
  w: number,
  h: number,
  data: Uint8ClampedArray,
  unknown: Uint8Array,
): void {
  const px = w * h;
  const known = new Uint8Array(px);
  const queued = new Uint8Array(px);
  for (let i = 0; i < px; i++) if (!unknown[i]) known[i] = 1;

  const neighbours = (i: number): number[] => {
    const x = i % w;
    const out: number[] = [];
    if (i - w >= 0) out.push(i - w);
    if (i + w < px) out.push(i + w);
    if (x > 0) out.push(i - 1);
    if (x < w - 1) out.push(i + 1);
    return out;
  };
  const hasKnownNeighbour = (i: number) => neighbours(i).some((j) => known[j]);

  let frontier: number[] = [];
  for (let i = 0; i < px; i++) {
    if (!known[i] && hasKnownNeighbour(i)) {
      queued[i] = 1;
      frontier.push(i);
    }
  }

  while (frontier.length) {
    const next: number[] = [];
    for (const i of frontier) {
      if (known[i]) continue;
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (const j of neighbours(i)) {
        if (known[j]) {
          r += data[j * 4];
          g += data[j * 4 + 1];
          b += data[j * 4 + 2];
          n++;
        }
      }
      if (!n) continue;
      data[i * 4] = r / n;
      data[i * 4 + 1] = g / n;
      data[i * 4 + 2] = b / n;
      known[i] = 1;
      for (const j of neighbours(i)) {
        if (!known[j] && !queued[j] && hasKnownNeighbour(j)) {
          queued[j] = 1;
          next.push(j);
        }
      }
    }
    frontier = next;
  }
}

function boxBlurRegion(
  w: number,
  h: number,
  data: Uint8ClampedArray,
  x0: number,
  y0: number,
  rw: number,
  rh: number,
  passes: number,
): void {
  const src = new Uint8ClampedArray(data);
  for (let pass = 0; pass < passes; pass++) {
    src.set(data);
    for (let y = y0; y < y0 + rh; y++) {
      for (let x = x0; x < x0 + rw; x++) {
        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
            const o = (yy * w + xx) * 4;
            r += src[o];
            g += src[o + 1];
            b += src[o + 2];
            n++;
          }
        }
        const o = (y * w + x) * 4;
        data[o] = r / n;
        data[o + 1] = g / n;
        data[o + 2] = b / n;
      }
    }
  }
}

/**
 * Builds a background "clean plate" for every marked region. It samples frames
 * across the clip, keeps the per-pixel median colour, and detects pixels that
 * never changed (the static logo / watermark). Those stuck pixels are
 * re-synthesised by filling from the surrounding background — so the logo is
 * replaced with the same background even when the footage is completely static.
 */
export async function buildCleanPlates(
  source: SourceVideo,
  regions: MarkRegion[],
  width: number,
  height: number,
  onProgress?: (pct: number) => void,
): Promise<CleanPatch[]> {
  const rectsRaw = regionsToRects(regions, width, height);
  const valid = rectsRaw.filter((r) => r.w > 0 && r.h > 0);
  if (!valid.length) return [];

  const margin = PLATE_MARGIN;
  const expanded = valid.map((r) => {
    const ex = Math.max(0, r.x - margin);
    const ey = Math.max(0, r.y - margin);
    return {
      ...r,
      ex,
      ey,
      ew: Math.min(width, r.x + r.w + margin) - ex,
      eh: Math.min(height, r.y + r.h + margin) - ey,
      ix: r.x - ex,
      iy: r.y - ey,
    };
  });

  const duration = Math.max(0.5, source.duration);
  const count = Math.max(12, Math.min(40, Math.round(duration * 8)));
  const times: number[] = [];
  for (let i = 0; i < count; i++) {
    times.push(count === 1 ? duration / 2 : (i / (count - 1)) * Math.max(0.05, duration - 0.05));
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas is not supported in this browser.");

  const video = makeVideo(source.objectUrl);
  await new Promise<void>((resolve, reject) => {
    const onLoaded = () => resolve();
    const onError = () => reject(new Error("The video could not be read."));
    video.addEventListener("loadeddata", onLoaded, { once: true });
    video.addEventListener("error", onError, { once: true });
  });

  const samples = expanded.map((r) => new Uint8Array(count * r.ew * r.eh * 3));
  const pxPerRegion = expanded.map((r) => r.ew * r.eh);

  for (let s = 0; s < count; s++) {
    await seekTo(video, times[s]);
    ctx.drawImage(video, 0, 0, width, height);
    for (let ri = 0; ri < expanded.length; ri++) {
      const r = expanded[ri];
      if (!r.ew || !r.eh) continue;
      const img = ctx.getImageData(r.ex, r.ey, r.ew, r.eh);
      const d = img.data;
      const base = s * pxPerRegion[ri] * 3;
      let i = 0;
      for (let p = 0; p < d.length; p += 4) {
        samples[ri][base + i] = d[p];
        samples[ri][base + i + 1] = d[p + 1];
        samples[ri][base + i + 2] = d[p + 2];
        i += 3;
      }
    }
    onProgress?.(s / count);
  }

  const patches: CleanPatch[] = [];
  const scratch = new Uint8Array(count);
  for (let ri = 0; ri < expanded.length; ri++) {
    const e = expanded[ri];
    const ep = pxPerRegion[ri];
    const plate = new ImageData(e.ew, e.eh);
    const pd = plate.data;
    const meanF = new Float64Array(ep * 3);
    const sqF = new Float64Array(ep * 3);

    for (let p = 0; p < ep; p++) {
      for (let c = 0; c < 3; c++) {
        const base = p * 3 + c;
        let sum = 0;
        let sq = 0;
        for (let s = 0; s < count; s++) {
          const v = samples[ri][s * ep * 3 + base];
          sum += v;
          sq += v * v;
          scratch[s] = v;
        }
        meanF[base] = sum / count;
        sqF[base] = sq / count;
        scratch.sort();
        const m = count >> 1;
        pd[p * 4 + c] = count & 1 ? scratch[m] : (scratch[m - 1] + scratch[m]) >> 1;
      }
      pd[p * 4 + 3] = 255;
    }

    const unknown = new Uint8Array(e.ew * e.eh);
    let anyStuck = false;
    for (let py = e.iy; py < e.iy + e.h; py++) {
      for (let px = e.ix; px < e.ix + e.w; px++) {
        let maxStd = 0;
        for (let c = 0; c < 3; c++) {
          const base = (py * e.ew + px) * 3 + c;
          const variance = sqF[base] - meanF[base] * meanF[base];
          const sd = variance > 0 ? Math.sqrt(variance) : 0;
          if (sd > maxStd) maxStd = sd;
        }
        if (maxStd < STUCK_STDDEV) {
          unknown[py * e.ew + px] = 1;
          anyStuck = true;
        }
      }
    }

    if (anyStuck) {
      fillStuckPixels(e.ew, e.eh, pd, unknown);
      boxBlurRegion(e.ew, e.eh, pd, e.ix, e.iy, e.w, e.h, 2);
    }

    const out = new ImageData(e.w, e.h);
    for (let py = 0; py < e.h; py++) {
      for (let px = 0; px < e.w; px++) {
        const so = ((py + e.iy) * e.ew + (px + e.ix)) * 4;
        const dof = (py * e.w + px) * 4;
        out.data[dof] = pd[so];
        out.data[dof + 1] = pd[so + 1];
        out.data[dof + 2] = pd[so + 2];
        out.data[dof + 3] = 255;
      }
    }
    patches.push({ rect: valid[ri], data: out.data });
  }
  return patches;
}

/**
 * Paints the clean plate back over each region for the current frame, with
 * per-channel exposure drift correction (from the ring just outside the
 * region) and a feathered blend so edges don't look cut out.
 */
export function applyPatches(
  canvas: HTMLCanvasElement,
  patches: CleanPatch[],
  feather: number,
): void {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;

  const MARGIN = 3;
  for (const patch of patches) {
    const { rect, data } = patch;
    if (rect.w <= 0 || rect.h <= 0) continue;

    const x0 = Math.max(0, rect.x - MARGIN);
    const y0 = Math.max(0, rect.y - MARGIN);
    const x1 = Math.min(canvas.width, rect.x + rect.w + MARGIN);
    const y1 = Math.min(canvas.height, rect.y + rect.h + MARGIN);
    const bw = x1 - x0;
    const bh = y1 - y0;
    if (bw <= 0 || bh <= 0) continue;

    const block = ctx.getImageData(x0, y0, bw, bh);
    const bd = block.data;

    let ringR = 0;
    let ringG = 0;
    let ringB = 0;
    let ringCount = 0;
    let patchR = 0;
    let patchG = 0;
    let patchB = 0;
    let patchCount = 0;

    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        const gx = x0 + x;
        const gy = y0 + y;
        const inside =
          gx >= rect.x && gx < rect.x + rect.w && gy >= rect.y && gy < rect.y + rect.h;
        const o = (y * bw + x) * 4;
        if (!inside) {
          ringR += bd[o];
          ringG += bd[o + 1];
          ringB += bd[o + 2];
          ringCount++;
        } else {
          const lx = gx - rect.x;
          const ly = gy - rect.y;
          const nearEdge =
            lx < MARGIN ||
            ly < MARGIN ||
            rect.w - 1 - lx < MARGIN ||
            rect.h - 1 - ly < MARGIN;
          if (nearEdge) {
            const po = (ly * rect.w + lx) * 4;
            patchR += data[po];
            patchG += data[po + 1];
            patchB += data[po + 2];
            patchCount++;
          }
        }
      }
    }

    const gain = [1, 1, 1];
    if (ringCount && patchCount) {
      const fr = ringR / ringCount;
      const fg = ringG / ringCount;
      const fb = ringB / ringCount;
      const pr = patchR / patchCount;
      const pg = patchG / patchCount;
      const pb = patchB / patchCount;
      const clampGain = (v: number) => Math.max(0.5, Math.min(2, v));
      if (fr > 0 && pr > 0) gain[0] = clampGain(fr / pr);
      if (fg > 0 && pg > 0) gain[1] = clampGain(fg / pg);
      if (fb > 0 && pb > 0) gain[2] = clampGain(fb / pb);
    }

    const f = Math.max(1, Math.min(feather, Math.floor(Math.min(rect.w, rect.h) / 3)));

    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        const gx = x0 + x;
        const gy = y0 + y;
        const inside =
          gx >= rect.x && gx < rect.x + rect.w && gy >= rect.y && gy < rect.y + rect.h;
        const o = (y * bw + x) * 4;
        if (!inside) continue;
        const dx = Math.min(gx - rect.x, rect.x + rect.w - 1 - gx);
        const dy = Math.min(gy - rect.y, rect.y + rect.h - 1 - gy);
        const d = Math.min(dx, dy);
        let alpha = Math.min(1, d / f);
        alpha = alpha * alpha * (3 - 2 * alpha);
        const po = ((gy - rect.y) * rect.w + (gx - rect.x)) * 4;
        bd[o] = bd[o] * (1 - alpha) + Math.min(255, Math.max(0, data[po] * gain[0])) * alpha;
        bd[o + 1] = bd[o + 1] * (1 - alpha) + Math.min(255, Math.max(0, data[po + 1] * gain[1])) * alpha;
        bd[o + 2] = bd[o + 2] * (1 - alpha) + Math.min(255, Math.max(0, data[po + 2] * gain[2])) * alpha;
        bd[o + 3] = 255;
      }
    }

    ctx.putImageData(block, x0, y0);
  }
}

function pickMimeType(): string {
  const candidates = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4;codecs=avc1.42E01E",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=av1,opus",
    "video/webm",
  ];
  if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported) {
    for (const candidate of candidates) {
      if (MediaRecorder.isTypeSupported(candidate)) return candidate;
    }
  }
  return "";
}

export function extensionForMime(mime: string): string {
  return mime.includes("mp4") ? "mp4" : "webm";
}

type VideoWithExtra = HTMLVideoElement & {
  captureStream?(frameRate?: number): MediaStream;
};

/**
 * Erases the marked regions and records the result to a downloadable file.
 * The clip plays back in real time while each frame is patched onto a canvas
 * that a MediaRecorder captures — audio is carried through when supported.
 */
export async function eraseAndExport(
  source: SourceVideo,
  regions: MarkRegion[],
  opts: ExportOptions,
  cb: ExportCallbacks,
): Promise<EraseResult> {
  const valid = regions.filter((r) => r.width > 0.004 && r.height > 0.004);
  if (!valid.length) {
    throw new Error("Draw at least one eraser region before exporting.");
  }
  const size = resolveExportSize(source, opts.resolution);

  cb.onStage("plates");
  cb.onProgress(0);
  const patches = await buildCleanPlates(source, valid, size.width, size.height, (p) =>
    cb.onProgress(p * 0.25),
  );
  cb.onStage("export");
  cb.onProgress(0.25);

  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas is not supported in this browser.");

  const video = makeVideo(source.objectUrl);
  video.volume = 0;
  video.muted = false;
  await new Promise<void>((resolve, reject) => {
    const onLoaded = () => resolve();
    const onError = () => reject(new Error("The video could not be read."));
    video.addEventListener("loadeddata", onLoaded, { once: true });
    video.addEventListener("error", onError, { once: true });
  });

  const canvasVideo = canvas as HTMLCanvasElement & { captureStream?(fps?: number): MediaStream };
  const stream = canvasVideo.captureStream?.(30);
  if (!stream) {
    throw new Error("This browser can't record canvas output — try Chrome, Edge or Firefox.");
  }
  const videoTrack = stream.getVideoTracks()[0];
  if (!videoTrack) throw new Error("This browser could not open a video capture stream.");

  let audioTrack: MediaStreamTrack | null = null;
  try {
    const audioStream = (video as VideoWithExtra).captureStream?.(30);
    audioTrack = audioStream?.getAudioTracks()[0] ?? null;
  } catch {
    audioTrack = null;
  }

  const tracks: MediaStreamTrack[] = [videoTrack, ...(audioTrack ? [audioTrack] : [])];
  const combined = new MediaStream(tracks);
  const mimeType = pickMimeType();
  const recorderOptions: MediaRecorderOptions = {
    videoBitsPerSecond: opts.bitrate,
    audioBitsPerSecond: 128000,
  };
  if (mimeType) recorderOptions.mimeType = mimeType;
  const recorder = new MediaRecorder(combined, recorderOptions);

  return new Promise<EraseResult>((resolve, reject) => {
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size) chunks.push(event.data);
    };
    recorder.onerror = () => reject(new Error("Export failed while recording."));
    recorder.onstop = () => {
      for (const track of tracks) track.stop();
      const type = mimeType || "video/webm";
      const blob = new Blob(chunks, { type });
      resolve({
        blob,
        objectUrl: URL.createObjectURL(blob),
        width: size.width,
        height: size.height,
        mime: type,
        ext: extensionForMime(type),
      });
    };

    const duration = Math.max(0.001, source.duration);
    let last = -1;
    const draw = () => {
      ctx.drawImage(video, 0, 0, size.width, size.height);
      applyPatches(canvas, patches, opts.featherPx);
    };

    const step = () => {
      if (recorder.state === "inactive") return;
      const t = video.currentTime;
      if (t !== last) {
        last = t;
        draw();
      }
      cb.onProgress(Math.min(0.99, 0.25 + 0.75 * (t / duration)));
      if (video.ended) {
        draw();
        window.setTimeout(() => {
          if (recorder.state !== "inactive") recorder.stop();
        }, 80);
        return;
      }
      window.requestAnimationFrame(step);
    };

    video.onended = () => {
      if (recorder.state === "recording") recorder.stop();
    };

    video.currentTime = 0;
    video
      .play()
      .then(() => {
        draw();
        recorder.start(250);
        window.requestAnimationFrame(step);
      })
      .catch(() => {
        for (const track of tracks) track.stop();
        reject(new Error("The video could not play for export."));
      });
  });
}