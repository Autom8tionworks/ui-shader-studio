/**
 * Text tool. Click to place text on a new layer using the current text settings. The app's
 * properties panel can re-apply settings to re-render the most recent text layer.
 */
import { Layer } from "../core/layer";
import { rasterOnLayer } from "./raster";
import { Tool, PointerInfo, ToolContext } from "./tool";

export interface TextSettings {
  text: string;
  size: number;
  color: [number, number, number];
  font: string;
  bold: boolean;
}

export class TextTool implements Tool {
  id = "text";
  settings: TextSettings = {
    text: "Double-click to edit",
    size: 96,
    color: [1, 1, 1],
    font: "system-ui",
    bold: true
  };
  lastLayerId = -1;

  onPointerDown(p: PointerInfo, c: ToolContext): void {
    const doc = c.doc;
    const layer = new Layer(this.label(), doc.width, doc.height);
    this.lastLayerId = layer.id;
    this.render(layer, p.x, p.y);
    c.addLayer(layer); // undoable; also re-renders + rebuilds UI
  }

  private label(): string {
    return `Text: ${this.settings.text.slice(0, 16)}`;
  }

  /** Render text centered at (x,y) document coords (y-up). */
  render(layer: Layer, x: number, y: number): void {
    const s = this.settings;
    rasterOnLayer(layer, (g, _w, _h, cy) => {
      g.font = `${s.bold ? "bold " : ""}${s.size}px ${s.font}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillStyle = `rgb(${Math.round(s.color[0] * 255)},${Math.round(s.color[1] * 255)},${Math.round(s.color[2] * 255)})`;
      g.fillText(s.text, x, cy(y));
    });
    (layer as Layer & { textAnchor?: { x: number; y: number } }).textAnchor = { x, y };
    layer.name = this.label();
  }

  onPointerMove(): void {}
  onPointerUp(): void {}
}
