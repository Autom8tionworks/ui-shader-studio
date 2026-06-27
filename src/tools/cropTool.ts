/**
 * Interactive crop tool. Drag on the canvas to draw a crop rectangle; drag inside it to move,
 * or grab a corner/edge handle to resize. The rectangle is shown by a GPU overlay (dim
 * outside + border + handles + rule-of-thirds). Applying calls app.crop(). Coordinates are in
 * document px, y-up.
 */
import { Tool, PointerInfo, ToolContext } from "./tool";

export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Mode = "new" | "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw" | null;

export class CropTool implements Tool {
  id = "crop";
  rect: CropRect | null = null;

  private mode: Mode = null;
  private start: { x: number; y: number } | null = null;
  private startRect: CropRect | null = null;

  onPointerDown(p: PointerInfo, c: ToolContext): void {
    const tol = 12 / Math.max(c.zoom, 1e-3); // ~12 screen px of grab tolerance
    this.start = { x: p.x, y: p.y };
    if (this.rect) {
      const h = this.hitHandle(p, tol);
      if (h) {
        this.mode = h;
        this.startRect = { ...this.rect };
        return;
      }
      if (inside(this.rect, p)) {
        this.mode = "move";
        this.startRect = { ...this.rect };
        return;
      }
    }
    this.mode = "new";
    this.rect = { x: p.x, y: p.y, w: 0, h: 0 };
  }

  onPointerMove(p: PointerInfo, c: ToolContext): void {
    if (!this.start || !this.mode) return;
    const doc = c.doc;
    if (this.mode === "new") {
      this.rect = normFromTo(this.start, p);
    } else if (this.mode === "move" && this.startRect) {
      const dx = p.x - this.start.x;
      const dy = p.y - this.start.y;
      let x = this.startRect.x + dx;
      let y = this.startRect.y + dy;
      x = Math.max(0, Math.min(doc.width - this.startRect.w, x));
      y = Math.max(0, Math.min(doc.height - this.startRect.h, y));
      this.rect = { x, y, w: this.startRect.w, h: this.startRect.h };
    } else if (this.startRect) {
      this.resize(this.mode, p);
    }
    c.requestRender();
  }

  onPointerUp(_p: PointerInfo, c: ToolContext): void {
    if (this.rect) this.rect = clampToDoc(normalize(this.rect), c.doc.width, c.doc.height);
    this.mode = null;
    this.start = null;
    this.startRect = null;
    c.rebuildUI();
  }

  private resize(mode: Mode, p: PointerInfo): void {
    const r = this.startRect!;
    let x0 = r.x, y0 = r.y, x1 = r.x + r.w, y1 = r.y + r.h;
    if (mode!.includes("w")) x0 = p.x;
    if (mode!.includes("e")) x1 = p.x;
    if (mode!.includes("s")) y0 = p.y;
    if (mode!.includes("n")) y1 = p.y;
    this.rect = normalize({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  }

  /** Return which handle (if any) the point is on. */
  private hitHandle(p: PointerInfo, tol: number): Mode {
    const r = this.rect!;
    const x0 = r.x, y0 = r.y, x1 = r.x + r.w, y1 = r.y + r.h;
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    const near = (ax: number, ay: number) => Math.abs(p.x - ax) <= tol && Math.abs(p.y - ay) <= tol;
    if (near(x0, y1)) return "nw";
    if (near(x1, y1)) return "ne";
    if (near(x0, y0)) return "sw";
    if (near(x1, y0)) return "se";
    if (near(mx, y1)) return "n";
    if (near(mx, y0)) return "s";
    if (near(x1, my)) return "e";
    if (near(x0, my)) return "w";
    return null;
  }
}

function inside(r: CropRect, p: { x: number; y: number }): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}
function normFromTo(a: { x: number; y: number }, b: { x: number; y: number }): CropRect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
}
function normalize(r: CropRect): CropRect {
  const x = Math.min(r.x, r.x + r.w);
  const y = Math.min(r.y, r.y + r.h);
  return { x, y, w: Math.abs(r.w), h: Math.abs(r.h) };
}
function clampToDoc(r: CropRect, w: number, h: number): CropRect {
  const x0 = Math.max(0, Math.min(w, r.x));
  const y0 = Math.max(0, Math.min(h, r.y));
  const x1 = Math.max(0, Math.min(w, r.x + r.w));
  const y1 = Math.max(0, Math.min(h, r.y + r.h));
  return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
}
