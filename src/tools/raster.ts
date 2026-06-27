/**
 * Helper to draw 2D content (text, shapes) onto a layer: read the layer's current pixels
 * into a canvas (flipped to top-down), run a Canvas2D draw callback, and upload back. The
 * callback gets a y-down context plus a `cy(y)` helper to convert document y-up coords.
 */
import { ctx } from "../engine/gl";
import { RenderTarget } from "../engine/texture";
import { Layer } from "../core/layer";

export function rasterOnLayer(
  layer: Layer,
  draw: (g: CanvasRenderingContext2D, w: number, h: number, cy: (y: number) => number) => void
): void {
  const gl = ctx().gl;
  const w = layer.width;
  const h = layer.height;

  const rt = new RenderTarget(w, h, false);
  gl.bindFramebuffer(gl.FRAMEBUFFER, rt.fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, layer.texture.tex, 0);
  const raw = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, raw);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  rt.dispose();

  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const g = cv.getContext("2d")!;
  const img = g.createImageData(w, h);
  // raw is bottom-up; flip into top-down image data.
  for (let r = 0; r < h; r++) {
    const src = (h - 1 - r) * w * 4;
    const dst = r * w * 4;
    img.data.set(raw.subarray(src, src + w * 4), dst);
  }
  g.putImageData(img, 0, 0);

  draw(g, w, h, (y) => h - y);

  layer.texture.upload(cv, w, h);
}
