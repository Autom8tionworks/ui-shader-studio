/**
 * Export the composited document at its NATIVE resolution (not the on-screen viewport).
 * Reads the compositor's accumulator (premultiplied), un-premultiplies, flips to top-down,
 * and downloads as PNG or JPEG.
 */
import { ctx } from "../engine/gl";
import { runPass } from "../engine/pass";
import { RenderTarget } from "../engine/texture";
import { QUAD_VERT } from "../engine/shaders/quad.vert";
import { COPY } from "../engine/shaders/adjust";
import { Document } from "./document";

/** Build a canvas holding the document image at full resolution. */
export function documentToCanvas(doc: Document): HTMLCanvasElement {
  const gl = ctx().gl;
  const w = doc.width;
  const h = doc.height;

  // Copy the (possibly float) accumulator into an RGBA8 target we can read as bytes.
  const tmp = new RenderTarget(w, h, false);
  runPass({ vert: QUAD_VERT, frag: COPY, inputs: { u_tex: doc.accum.read.texture }, target: tmp });
  const px = new Uint8Array(w * h * 4);
  gl.bindFramebuffer(gl.FRAMEBUFFER, tmp.fbo);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  tmp.dispose();

  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const g = cv.getContext("2d")!;
  const img = g.createImageData(w, h);
  for (let r = 0; r < h; r++) {
    const srcRow = (h - 1 - r) * w * 4; // readPixels is bottom-up
    const dstRow = r * w * 4;
    for (let x = 0; x < w * 4; x += 4) {
      const a = px[srcRow + x + 3];
      const inv = a > 0 ? 255 / a : 0;
      img.data[dstRow + x] = Math.min(255, px[srcRow + x] * inv);
      img.data[dstRow + x + 1] = Math.min(255, px[srcRow + x + 1] * inv);
      img.data[dstRow + x + 2] = Math.min(255, px[srcRow + x + 2] * inv);
      img.data[dstRow + x + 3] = a;
    }
  }
  g.putImageData(img, 0, 0);
  return cv;
}

export function downloadDocument(doc: Document, format: "png" | "jpeg"): void {
  const cv = documentToCanvas(doc);
  let out = cv;
  if (format === "jpeg") {
    // Flatten onto white for JPEG (no alpha).
    const flat = document.createElement("canvas");
    flat.width = cv.width;
    flat.height = cv.height;
    const g = flat.getContext("2d")!;
    g.fillStyle = "#fff";
    g.fillRect(0, 0, flat.width, flat.height);
    g.drawImage(cv, 0, 0);
    out = flat;
  }
  const mime = format === "png" ? "image/png" : "image/jpeg";
  const a = document.createElement("a");
  a.href = out.toDataURL(mime, 0.92);
  a.download = `shader-studio.${format === "png" ? "png" : "jpg"}`;
  a.click();
}
