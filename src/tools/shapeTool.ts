/**
 * Shape tool: drag a bounding box to draw a preset shape into the active layer. Supports
 * basic 2D shapes (rectangle, ellipse, line, triangle, diamond, pentagon, hexagon, star,
 * heart, arrow) and shaded "3D-looking" shapes (cube, sphere, cylinder, cone, pyramid)
 * rendered with Canvas2D gradients/face shading. Previews live from a pixel snapshot.
 */
import { rasterOnLayer } from "./raster";
import { Tool, PointerInfo, ToolContext } from "./tool";

export type ShapeKind =
  | "rect" | "ellipse" | "line"
  | "triangle" | "diamond" | "pentagon" | "hexagon" | "star" | "heart" | "arrow"
  | "cube" | "sphere" | "cylinder" | "cone" | "pyramid";

/** Shapes that honor the Fill/Stroke + line-width options (the flat 2D ones). */
export const FILLABLE_2D: ShapeKind[] = [
  "rect", "ellipse", "triangle", "diamond", "pentagon", "hexagon", "star", "heart", "arrow"
];

export const SHAPE_OPTIONS: { id: ShapeKind; label: string; group: string }[] = [
  { id: "rect", label: "Rectangle", group: "Basic" },
  { id: "ellipse", label: "Ellipse", group: "Basic" },
  { id: "line", label: "Line", group: "Basic" },
  { id: "triangle", label: "Triangle", group: "2D" },
  { id: "diamond", label: "Diamond", group: "2D" },
  { id: "pentagon", label: "Pentagon", group: "2D" },
  { id: "hexagon", label: "Hexagon", group: "2D" },
  { id: "star", label: "Star", group: "2D" },
  { id: "heart", label: "Heart", group: "2D" },
  { id: "arrow", label: "Arrow", group: "2D" },
  { id: "cube", label: "Cube (3D)", group: "3D" },
  { id: "sphere", label: "Sphere (3D)", group: "3D" },
  { id: "cylinder", label: "Cylinder (3D)", group: "3D" },
  { id: "cone", label: "Cone (3D)", group: "3D" },
  { id: "pyramid", label: "Pyramid (3D)", group: "3D" }
];

export class ShapeTool implements Tool {
  id = "shape";
  kind: ShapeKind = "cube";
  color: [number, number, number] = [0.32, 0.55, 0.95];
  lineWidth = 6;
  fill = true;

  private start: { x: number; y: number } | null = null;
  private snapshot: ImageData | null = null;
  private dragging = false;

  onPointerDown(p: PointerInfo, c: ToolContext): void {
    if (!c.doc.activeLayer) return;
    c.beginHistory();
    this.dragging = true;
    this.start = { x: p.x, y: p.y };
  }

  onPointerMove(p: PointerInfo, c: ToolContext): void {
    if (!this.dragging || !this.start) return;
    this.draw(this.start, p, c);
    c.requestRender();
  }

  onPointerUp(p: PointerInfo, c: ToolContext): void {
    if (!this.dragging || !this.start) return;
    this.draw(this.start, p, c);
    this.dragging = false;
    this.start = null;
    this.snapshot = null;
    c.requestRender();
  }

  private draw(a: { x: number; y: number }, b: PointerInfo, c: ToolContext): void {
    const layer = c.doc.activeLayer!;
    let snap = this.snapshot;
    rasterOnLayer(layer, (g, w, h, cy) => {
      if (!snap) {
        snap = g.getImageData(0, 0, w, h);
        this.snapshot = snap;
      } else {
        g.putImageData(snap, 0, 0);
      }
      const ends = { ax: a.x, ay: cy(a.y), bx: b.x, by: cy(b.y) };
      drawShape(g, this.kind, this.color, this.fill, this.lineWidth, ends);
    });
  }
}

// ---------- drawing ----------

interface Ends { ax: number; ay: number; bx: number; by: number; }

function shade(c: [number, number, number], f: number): string {
  const ch = (n: number) => Math.max(0, Math.min(255, Math.round(n * 255 * f)));
  return `rgb(${ch(c[0])},${ch(c[1])},${ch(c[2])})`;
}

function drawShape(
  g: CanvasRenderingContext2D,
  kind: ShapeKind,
  color: [number, number, number],
  fill: boolean,
  lineWidth: number,
  e: Ends
): void {
  const x = Math.min(e.ax, e.bx);
  const y = Math.min(e.ay, e.by);
  const w = Math.abs(e.bx - e.ax);
  const h = Math.abs(e.by - e.ay);
  if (w < 1 && h < 1 && kind !== "line") return;

  const base = shade(color, 1);
  const light = shade(color, 1.45);
  const mid = shade(color, 0.95);
  const dark = shade(color, 0.62);
  const darker = shade(color, 0.45);

  g.lineJoin = "round";
  g.lineCap = "round";
  g.strokeStyle = base;
  g.fillStyle = base;
  g.lineWidth = lineWidth;

  const fillOrStroke = () => { if (fill) g.fill(); else g.stroke(); };
  const cx = x + w / 2, cy = y + h / 2;

  switch (kind) {
    case "line":
      g.beginPath(); g.moveTo(e.ax, e.ay); g.lineTo(e.bx, e.by); g.stroke(); break;

    case "rect":
      if (fill) g.fillRect(x, y, w, h); else g.strokeRect(x, y, w, h); break;

    case "ellipse":
      g.beginPath(); g.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2); fillOrStroke(); break;

    case "triangle":
      g.beginPath(); g.moveTo(cx, y); g.lineTo(x + w, y + h); g.lineTo(x, y + h); g.closePath(); fillOrStroke(); break;

    case "diamond":
      g.beginPath(); g.moveTo(cx, y); g.lineTo(x + w, cy); g.lineTo(cx, y + h); g.lineTo(x, cy); g.closePath(); fillOrStroke(); break;

    case "pentagon": polygon(g, cx, cy, w / 2, h / 2, 5); fillOrStroke(); break;
    case "hexagon": polygon(g, cx, cy, w / 2, h / 2, 6, 0); fillOrStroke(); break;

    case "star": starPath(g, cx, cy, w / 2, h / 2, 5, 0.45); fillOrStroke(); break;

    case "heart": heartPath(g, x, y, w, h); fillOrStroke(); break;

    case "arrow": arrowPath(g, x, y, w, h); fillOrStroke(); break;

    case "cube": cube(g, x, y, w, h, light, base, dark, darker); break;
    case "sphere": sphere(g, x, y, w, h, light, base, dark); break;
    case "cylinder": cylinder(g, x, y, w, h, light, mid, dark); break;
    case "cone": cone(g, x, y, w, h, light, mid, dark); break;
    case "pyramid": pyramid(g, x, y, w, h, light, mid, dark); break;
  }
}

function polygon(g: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, n: number, rot = -Math.PI / 2): void {
  g.beginPath();
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    const px = cx + Math.cos(a) * rx, py = cy + Math.sin(a) * ry;
    if (i) g.lineTo(px, py); else g.moveTo(px, py);
  }
  g.closePath();
}

function starPath(g: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, points: number, inner: number): void {
  g.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : 1;
    const a = -Math.PI / 2 + (i / (points * 2)) * Math.PI * 2;
    const px = cx + Math.cos(a) * rx * r, py = cy + Math.sin(a) * ry * r;
    if (i) g.lineTo(px, py); else g.moveTo(px, py);
  }
  g.closePath();
}

function heartPath(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const cx = x + w / 2;
  const top = y + h * 0.3;
  g.beginPath();
  g.moveTo(cx, y + h);
  g.bezierCurveTo(x - w * 0.08, y + h * 0.55, x + w * 0.18, y, cx, top);
  g.bezierCurveTo(x + w * 0.82, y, x + w * 1.08, y + h * 0.55, cx, y + h);
  g.closePath();
}

function arrowPath(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const yc = y + h / 2;
  const sh = h * 0.34;
  const headX = x + w * 0.58;
  g.beginPath();
  g.moveTo(x, yc - sh / 2);
  g.lineTo(headX, yc - sh / 2);
  g.lineTo(headX, y);
  g.lineTo(x + w, yc);
  g.lineTo(headX, y + h);
  g.lineTo(headX, yc + sh / 2);
  g.lineTo(x, yc + sh / 2);
  g.closePath();
}

// ---------- 3D-looking shapes ----------

function cube(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, light: string, base: string, dark: string, darker: string): void {
  const d = Math.min(w, h) * 0.32; // depth of the extrusion
  const fw = w - d, fh = h - d;
  const fx = x, fy = y + d; // front face top-left
  // front face
  g.fillStyle = base;
  g.fillRect(fx, fy, fw, fh);
  // top face (parallelogram going up-right)
  g.fillStyle = light;
  g.beginPath();
  g.moveTo(fx, fy);
  g.lineTo(fx + fw, fy);
  g.lineTo(fx + fw + d, fy - d);
  g.lineTo(fx + d, fy - d);
  g.closePath();
  g.fill();
  // right face
  g.fillStyle = dark;
  g.beginPath();
  g.moveTo(fx + fw, fy);
  g.lineTo(fx + fw + d, fy - d);
  g.lineTo(fx + fw + d, fy - d + fh);
  g.lineTo(fx + fw, fy + fh);
  g.closePath();
  g.fill();
  // crisp edges
  g.strokeStyle = darker;
  g.lineWidth = Math.max(1, Math.min(w, h) * 0.012);
  g.stroke();
  void darker;
}

function sphere(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, light: string, base: string, dark: string): void {
  const cx = x + w / 2, cy = y + h / 2;
  const grad = g.createRadialGradient(x + w * 0.35, y + h * 0.32, Math.min(w, h) * 0.04, cx, cy, Math.max(w, h) * 0.62);
  grad.addColorStop(0, light);
  grad.addColorStop(0.55, base);
  grad.addColorStop(1, dark);
  g.fillStyle = grad;
  g.beginPath();
  g.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
  g.fill();
}

function cylinder(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, light: string, mid: string, dark: string): void {
  const eh = Math.min(h * 0.22, w * 0.45); // ellipse "thickness" for top/bottom
  const bodyTop = y + eh / 2;
  const bodyH = h - eh;
  // body with horizontal cylindrical gradient
  const grad = g.createLinearGradient(x, 0, x + w, 0);
  grad.addColorStop(0, dark);
  grad.addColorStop(0.45, light);
  grad.addColorStop(0.6, mid);
  grad.addColorStop(1, dark);
  g.fillStyle = grad;
  g.fillRect(x, bodyTop, w, bodyH);
  // bottom front arc
  g.fillStyle = dark;
  g.beginPath();
  g.ellipse(x + w / 2, bodyTop + bodyH, w / 2, eh / 2, 0, 0, Math.PI);
  g.fill();
  // top ellipse
  g.fillStyle = light;
  g.beginPath();
  g.ellipse(x + w / 2, bodyTop, w / 2, eh / 2, 0, 0, Math.PI * 2);
  g.fill();
}

function cone(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, light: string, mid: string, dark: string): void {
  const eh = Math.min(h * 0.18, w * 0.45);
  const baseY = y + h - eh / 2;
  // base ellipse
  g.fillStyle = dark;
  g.beginPath();
  g.ellipse(x + w / 2, baseY, w / 2, eh / 2, 0, 0, Math.PI * 2);
  g.fill();
  // cone body with horizontal gradient
  const grad = g.createLinearGradient(x, 0, x + w, 0);
  grad.addColorStop(0, dark);
  grad.addColorStop(0.45, light);
  grad.addColorStop(0.6, mid);
  grad.addColorStop(1, dark);
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(x + w / 2, y);
  g.lineTo(x + w, baseY);
  g.lineTo(x, baseY);
  g.closePath();
  g.fill();
}

function pyramid(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, light: string, mid: string, dark: string): void {
  const apexX = x + w * 0.5, apexY = y;
  const blX = x, brX = x + w, bY = y + h;
  const bMidX = x + w * 0.42; // front bottom edge offset for a slight 3/4 view
  // left (front-left) face — lit
  g.fillStyle = light;
  g.beginPath();
  g.moveTo(apexX, apexY);
  g.lineTo(blX, bY);
  g.lineTo(bMidX, bY);
  g.closePath();
  g.fill();
  // right (front-right) face — mid
  g.fillStyle = mid;
  g.beginPath();
  g.moveTo(apexX, apexY);
  g.lineTo(bMidX, bY);
  g.lineTo(brX, bY);
  g.closePath();
  g.fill();
  // subtle base shadow line
  g.strokeStyle = dark;
  g.lineWidth = Math.max(1, Math.min(w, h) * 0.01);
  g.beginPath();
  g.moveTo(blX, bY);
  g.lineTo(brX, bY);
  g.stroke();
}
