/**
 * GPU brush. On each pointer move we interpolate stamp centers between the last and current
 * point (so fast strokes stay continuous), run the brush shader reading the active layer and
 * writing into brushScratch, then copy the result back into the layer texture.
 */
import { runPass } from "../engine/pass";
import { QUAD_VERT } from "../engine/shaders/quad.vert";
import { BRUSH_FRAG, MAX_STAMPS } from "../engine/shaders/brush";
import { Tool, PointerInfo, ToolContext } from "./tool";

export interface BrushSettings {
  size: number; // diameter in document px
  hardness: number; // 0..1
  flow: number; // 0..1
  color: [number, number, number]; // 0..1
  erase: boolean;
}

export class BrushTool implements Tool {
  id = "brush";
  settings: BrushSettings = {
    size: 60,
    hardness: 0.5,
    flow: 0.5,
    color: [0.95, 0.3, 0.35],
    erase: false
  };

  private painting = false;
  private last: { x: number; y: number } | null = null;

  onPointerDown(p: PointerInfo, c: ToolContext): void {
    if (!c.doc.activeLayer) return;
    c.beginHistory();
    this.painting = true;
    this.last = { x: p.x, y: p.y };
    this.stampSegment(p.x, p.y, p.x, p.y, c);
    c.requestRender();
  }

  onPointerMove(p: PointerInfo, c: ToolContext): void {
    if (!this.painting || !this.last) return;
    this.stampSegment(this.last.x, this.last.y, p.x, p.y, c);
    this.last = { x: p.x, y: p.y };
    c.requestRender();
  }

  onPointerUp(): void {
    this.painting = false;
    this.last = null;
  }

  private stampSegment(x0: number, y0: number, x1: number, y1: number, c: ToolContext): void {
    const layer = c.doc.activeLayer;
    if (!layer) return;
    const doc = c.doc;

    const radiusPx = this.settings.size * 0.5;
    const spacing = Math.max(radiusPx * 0.25, 1); // ~25% of radius between dabs
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dist = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.min(MAX_STAMPS, Math.ceil(dist / spacing)));

    const stamps = new Float32Array(MAX_STAMPS * 2);
    let count = 0;
    for (let i = 0; i < steps && count < MAX_STAMPS; i++) {
      const t = steps === 1 ? 0 : i / (steps - 1);
      const px = x0 + dx * t;
      const py = y0 + dy * t;
      stamps[count * 2] = px / doc.width;
      stamps[count * 2 + 1] = py / doc.height;
      count++;
    }

    // Run brush into scratch reading the layer, then adopt back into the layer.
    runPass({
      vert: QUAD_VERT,
      frag: BRUSH_FRAG,
      inputs: { u_layer: layer.texture },
      uniforms: {
        u_stamps: stamps,
        u_count: count,
        u_radius: radiusPx / doc.height,
        u_aspect: doc.width / doc.height,
        u_hardness: this.settings.hardness,
        u_flow: this.settings.flow,
        u_color: this.settings.color,
        u_erase: this.settings.erase ? 1 : 0
      },
      target: doc.brushScratch
    });
    layer.adoptFrom(doc.brushScratch);
  }
}
