/**
 * Magnetic Lasso. Trace roughly around an object; each point snaps to the strongest nearby
 * edge of the active layer (luminance/alpha gradient), so the selection hugs the object's
 * outline automatically. Falls back to a plain freehand lasso if "magnetic" is off.
 */
import { ctx } from "../engine/gl";
import { RenderTarget } from "../engine/texture";
import { Tool, PointerInfo, ToolContext } from "./tool";

export class LassoTool implements Tool {
  id = "lasso";
  magnetic = true;
  radius = 28; // px search window for edge snapping

  private points: { x: number; y: number }[] = [];
  private edge: Uint8Array | null = null;
  private w = 0;
  private h = 0;
  private dragging = false;
  private last: { x: number; y: number } | null = null;

  onPointerDown(p: PointerInfo, c: ToolContext): void {
    const doc = c.doc;
    this.w = doc.width;
    this.h = doc.height;
    this.edge = this.magnetic && doc.activeLayer ? edgeMap(doc.activeLayer.texture.tex, this.w, this.h) : null;
    this.dragging = true;
    const a = this.snap(p.x, p.y);
    this.points = [a];
    this.last = a;
  }

  onPointerMove(p: PointerInfo, c: ToolContext): void {
    if (!this.dragging || !this.last) return;
    const a = this.snap(p.x, p.y);
    if (Math.hypot(a.x - this.last.x, a.y - this.last.y) < 4) return;
    this.points.push(a);
    this.last = a;
    if (this.points.length >= 2) c.doc.selection.setPolygon(this.points);
    c.requestRender();
  }

  onPointerUp(p: PointerInfo, c: ToolContext): void {
    if (!this.dragging) return;
    this.dragging = false;
    this.points.push(this.snap(p.x, p.y));
    const enough = this.points.length >= 3;
    if (enough) c.doc.selection.setPolygon(this.points);
    else c.doc.selection.clear();
    this.points = [];
    this.last = null;
    this.edge = null;
    c.requestRender();
    // Turn the traced region into a movable object (lift to its own layer + Move tool).
    if (enough) c.liftSelection();
    else c.returnToSelect();
  }

  /** Snap (x,y) (document px, y-up) to the strongest edge within the search radius. */
  private snap(x: number, y: number): { x: number; y: number } {
    const w = this.w, h = this.h;
    const bx = Math.max(0, Math.min(w - 1, Math.round(x)));
    const by = Math.max(0, Math.min(h - 1, Math.round(y)));
    const e = this.edge;
    if (!e) return { x: bx, y: by };
    const rad = this.radius;
    let best = -1, rX = bx, rY = by, maxMag = 0;
    for (let dy = -rad; dy <= rad; dy++) {
      for (let dx = -rad; dx <= rad; dx++) {
        const X = bx + dx, Y = by + dy;
        if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
        const m = e[Y * w + X];
        if (m > maxMag) maxMag = m;
        // Prefer strong edges; small distance penalty so it can reach a nearby edge.
        const score = m - 0.18 * Math.hypot(dx, dy);
        if (score > best) { best = score; rX = X; rY = Y; }
      }
    }
    // No real edge nearby → keep the raw cursor point (acts as a freehand lasso there).
    if (maxMag < 18) return { x: bx, y: by };
    return { x: rX, y: rY };
  }
}

/** Build an edge-magnitude map (0..255) from a layer's luminance gradient. */
function edgeMap(tex: WebGLTexture, w: number, h: number): Uint8Array {
  const gl = ctx().gl;
  const rt = new RenderTarget(w, h, false);
  gl.bindFramebuffer(gl.FRAMEBUFFER, rt.fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const px = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  rt.dispose();

  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    // include alpha so an object on transparency has a strong boundary
    lum[i] = (0.299 * px[o] + 0.587 * px[o + 1] + 0.114 * px[o + 2]) * (px[o + 3] / 255);
  }
  const mag = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = lum[i - 1] - lum[i + 1];
      const gy = lum[i - w] - lum[i + w];
      mag[i] = Math.min(255, Math.round(Math.hypot(gx, gy)));
    }
  }
  return mag;
}
