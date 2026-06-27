/**
 * Selection tool with four modes: rectangular marquee, elliptical marquee, freehand lasso,
 * and magic wand (color flood fill). Rect/ellipse preview live while dragging; lasso traces
 * a polygon; wand reads the active layer pixels and flood-fills by color similarity.
 */
import { ctx } from "../engine/gl";
import { RenderTarget } from "../engine/texture";
import { Tool, PointerInfo, ToolContext } from "./tool";

export type SelectMode = "rect" | "ellipse" | "lasso" | "wand";

export class SelectTool implements Tool {
  id = "select";
  mode: SelectMode = "rect";
  tolerance = 32; // wand color tolerance (0..255)

  private start: { x: number; y: number } | null = null;
  private points: { x: number; y: number }[] = [];
  private dragging = false;

  onPointerDown(p: PointerInfo, c: ToolContext): void {
    if (this.mode === "wand") {
      this.wand(p, c);
      return;
    }
    this.dragging = true;
    this.start = { x: p.x, y: p.y };
    this.points = [{ x: p.x, y: p.y }];
  }

  onPointerMove(p: PointerInfo, c: ToolContext): void {
    if (!this.dragging || !this.start) return;
    if (this.mode === "rect") {
      c.doc.selection.setRect(this.start.x, this.start.y, p.x - this.start.x, p.y - this.start.y);
    } else if (this.mode === "ellipse") {
      c.doc.selection.setEllipse(this.start.x, this.start.y, p.x - this.start.x, p.y - this.start.y);
    } else if (this.mode === "lasso") {
      this.points.push({ x: p.x, y: p.y });
      c.doc.selection.setPolygon(this.points);
    }
    c.requestRender();
  }

  onPointerUp(p: PointerInfo, c: ToolContext): void {
    if (!this.dragging || !this.start) return;
    this.dragging = false;
    const moved = Math.hypot(p.x - this.start.x, p.y - this.start.y);
    if (moved < 2 && this.mode !== "lasso") {
      c.doc.selection.clear(); // a click = deselect
    } else if (this.mode === "lasso") {
      c.doc.selection.setPolygon(this.points);
    }
    c.requestRender();
  }

  private wand(p: PointerInfo, c: ToolContext): void {
    const doc = c.doc;
    const layer = doc.activeLayer;
    if (!layer) return;
    const w = doc.width;
    const h = doc.height;

    const raw = readLayerPixels(layer.texture.tex, w, h); // bottom-up rows (y-up)
    const sx = Math.max(0, Math.min(w - 1, Math.round(p.x)));
    const syUp = Math.max(0, Math.min(h - 1, Math.round(p.y)));
    const seedIdx = (syUp * w + sx) * 4;
    const sr = raw[seedIdx], sg = raw[seedIdx + 1], sb = raw[seedIdx + 2];
    const tol = this.tolerance * this.tolerance * 3;

    const visited = new Uint8Array(w * h);
    const stack = [syUp * w + sx];
    while (stack.length) {
      const idx = stack.pop()!;
      if (visited[idx]) continue;
      visited[idx] = 1;
      const i4 = idx * 4;
      const dr = raw[i4] - sr, dg = raw[i4 + 1] - sg, db = raw[i4 + 2] - sb;
      if (dr * dr + dg * dg + db * db > tol) continue;
      const x = idx % w;
      const y = (idx - x) / w;
      visited[idx] = 2; // selected
      if (x > 0) stack.push(idx - 1);
      if (x < w - 1) stack.push(idx + 1);
      if (y > 0) stack.push(idx - w);
      if (y < h - 1) stack.push(idx + w);
    }

    // Build a top-down RGBA coverage buffer (selection canvas is y-down).
    const cov = new Uint8ClampedArray(w * h * 4);
    for (let r = 0; r < h; r++) {
      const yUp = h - 1 - r;
      for (let x = 0; x < w; x++) {
        const on = visited[yUp * w + x] === 2 ? 255 : 0;
        const o = (r * w + x) * 4;
        cov[o] = on;
        cov[o + 1] = on;
        cov[o + 2] = on;
        cov[o + 3] = 255;
      }
    }
    doc.selection.setCoverage(cov);
    c.requestRender();
  }
}

function readLayerPixels(tex: WebGLTexture, w: number, h: number): Uint8Array {
  const gl = ctx().gl;
  const rt = new RenderTarget(w, h, false);
  gl.bindFramebuffer(gl.FRAMEBUFFER, rt.fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const px = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  rt.dispose();
  return px;
}
