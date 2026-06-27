/**
 * Records the live canvas to a WebM via MediaRecorder + canvas.captureStream while a
 * playback routine runs (timeline + any animated shaders/liquid glass/live layers). The
 * caller supplies a `startPlayback` promise that resolves when the take is finished.
 */
export function videoExportSupported(): boolean {
  return (
    typeof MediaRecorder !== "undefined" &&
    typeof HTMLCanvasElement !== "undefined" &&
    "captureStream" in HTMLCanvasElement.prototype
  );
}

function pickMime(): string | undefined {
  const candidates = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  return candidates.find((m) => MediaRecorder.isTypeSupported?.(m));
}

export async function recordCanvas(
  canvas: HTMLCanvasElement,
  fps: number,
  startPlayback: () => Promise<void>
): Promise<Blob> {
  const stream = (canvas as HTMLCanvasElement & { captureStream(fps?: number): MediaStream }).captureStream(fps);
  const mime = pickMime();
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 8_000_000 } : undefined);
  const chunks: BlobPart[] = [];
  rec.ondataavailable = (e) => {
    if (e.data && e.data.size) chunks.push(e.data);
  };
  const stopped = new Promise<void>((res) => {
    rec.onstop = () => res();
  });

  rec.start();
  await startPlayback();
  // Let the recorder capture the final frame before stopping.
  await new Promise((r) => setTimeout(r, 150));
  rec.stop();
  await stopped;
  return new Blob(chunks, { type: mime || "video/webm" });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
