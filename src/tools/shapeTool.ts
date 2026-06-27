/**
 * Shape tool: drag to draw a rectangle, ellipse, or line into the active layer using the
 * current shape color. Previews live by re-rasterizing from a pixel snapshot each move.
 */
import { rasterOnLayer } from "./raster";
import { Tool, PointerInfo, ToolContext } from "./tool";

export type ShapeKind = "rect" | "ellipse" | "line";

export class ShapeTool implements Tool {
  id = "shape";
  kind: ShapeKind = "rect";
  color: [number, number, number] = [0.95, 0.85, 0.2];
  lineWidth = 6;
  fill = true;

  private start: { x: number; y: number } | null = null;
  private snapshot: ImageData | null = null;
  private dragging = false;

  onPointerDown(p: PointerInfo, c: ToolContext): void {
    const layer = c.doc.activeLayer;
    if (!layer) return;
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
    const col = `rgb(${Math.round(this.color[0] * 255)},${Math.round(this.color[1] * 255)},${Math.round(this.color[2] * 255)})`;
    // Snapshot once at drag start so previews don't accumulate.
    let snap = this.snapshot;
    rasterOnLayer(layer, (g, w, h, cy) => {
      if (!snap) {
        snap = g.getImageData(0, 0, w, h);
        this.snapshot = snap;
      } else {
        g.putImageData(snap, 0, 0);
      }
      g.fillStyle = col;
      g.strokeStyle = col;
      g.lineWidth = this.lineWidth;
      g.lineCap = "round";
      const x0 = a.x, y0 = cy(a.y), x1 = b.x, y1 = cy(b.y);
      if (this.kind === "line") {
        g.beginPath();
        g.moveTo(x0, y0);
        g.lineTo(x1, y1);
        g.stroke();
      } else if (this.kind === "rect") {
        const rx = Math.min(x0, x1), ry = Math.min(y0, y1);
        if (this.fill) g.fillRect(rx, ry, Math.abs(x1 - x0), Math.abs(y1 - y0));
        else g.strokeRect(rx, ry, Math.abs(x1 - x0), Math.abs(y1 - y0));
      } else {
        g.beginPath();
        g.ellipse((x0 + x1) / 2, (y0 + y1) / 2, Math.abs(x1 - x0) / 2, Math.abs(y1 - y0) / 2, 0, 0, Math.PI * 2);
        if (this.fill) g.fill();
        else g.stroke();
      }
    });
  }
}
