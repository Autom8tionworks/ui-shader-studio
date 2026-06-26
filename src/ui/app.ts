/**
 * App wires the engine, document, tools, view and panels together and owns the dirty-driven
 * render loop. Panels call back into App; App re-renders panels when document structure
 * changes and asks the compositor to redraw when anything visual changes.
 */
import { createContext } from "../engine/gl";
import { Document } from "../core/document";
import { Layer } from "../core/layer";
import { History } from "../core/history";
import { composite, View } from "../core/compositor";
import { cropDocument } from "../core/crop";
import { Tool, PointerInfo } from "../tools/tool";
import { BrushTool } from "../tools/brushTool";
import { TransformTool } from "../tools/transformTool";
import { Viewport } from "./viewport";
import { buildToolbar } from "./toolbar";
import { buildLayersPanel } from "./layersPanel";
import { buildProperties } from "./properties";
import { gradientLayer, shapesLayer } from "./sample";

export class App {
  doc: Document;
  history = new History();
  view: View = { zoom: 1, panX: 0, panY: 0 };

  tools: Record<string, Tool>;
  brush: BrushTool;
  eraser: BrushTool;
  transform: TransformTool;
  currentToolId = "brush";

  private dirty = true;
  private viewport: Viewport;

  constructor() {
    const canvas = document.getElementById("gl") as HTMLCanvasElement;
    createContext(canvas);

    // Starter document.
    const W = 900;
    const H = 600;
    this.doc = new Document(W, H);
    const bg = new Layer("Background", W, H, gradientLayer(W, H));
    const shapes = new Layer("Shapes", W, H, shapesLayer(W, H));
    this.doc.addLayer(bg, false);
    this.doc.addLayer(shapes, true);

    this.brush = new BrushTool();
    this.eraser = new BrushTool();
    this.eraser.id = "eraser";
    this.eraser.settings.erase = true;
    this.transform = new TransformTool();
    this.tools = {
      brush: this.brush,
      eraser: this.eraser,
      transform: this.transform
    };

    this.viewport = new Viewport(canvas, this);
    this.fitView();

    this.rebuildUI();
    this.loop();
    window.addEventListener("keydown", (e) => this.onKey(e));
  }

  get currentTool(): Tool {
    return this.tools[this.currentToolId];
  }

  setTool(id: string): void {
    this.currentToolId = id;
    this.rebuildUI();
  }

  requestRender(): void {
    this.dirty = true;
  }

  toolContext() {
    return {
      doc: this.doc,
      requestRender: () => this.requestRender(),
      beginHistory: () => {
        const l = this.doc.activeLayer;
        if (l) this.history.snapshot(l);
      }
    };
  }

  dispatchPointer(kind: "down" | "move" | "up", p: PointerInfo): void {
    const tool = this.currentTool;
    if (!tool) return; // e.g. the Crop tool is panel-driven, not pointer-driven
    const c = this.toolContext();
    if (kind === "down") tool.onPointerDown(p, c);
    else if (kind === "move") tool.onPointerMove(p, c);
    else tool.onPointerUp(p, c);
  }

  // ---- layer operations used by panels ----
  addBlankLayer(): void {
    const l = new Layer(`Layer ${this.doc.layers.length + 1}`, this.doc.width, this.doc.height);
    this.doc.addLayer(l, true);
    this.requestRender();
    this.rebuildUI();
  }
  deleteActiveLayer(): void {
    if (this.doc.activeLayer) this.doc.removeLayer(this.doc.activeLayer.id);
    this.requestRender();
    this.rebuildUI();
  }
  crop(x: number, y: number, w: number, h: number): void {
    cropDocument(this.doc, x, y, w, h);
    this.fitView();
    this.requestRender();
    this.rebuildUI();
  }

  fitView(): void {
    const stage = document.getElementById("stage")!;
    const r = stage.getBoundingClientRect();
    const pad = 40;
    this.view.zoom = Math.min((r.width - pad) / this.doc.width, (r.height - pad) / this.doc.height, 4);
    this.view.panX = 0;
    this.view.panY = 0;
    this.requestRender();
  }

  exportPNG(): void {
    // Force a composite, then read the GL canvas into a PNG (already premultiplied-correct
    // because the present pass un-premultiplied for display).
    composite(this.doc, this.view);
    const src = document.getElementById("gl") as HTMLCanvasElement;
    const url = src.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = "shader-studio.png";
    a.click();
    this.requestRender();
  }

  private onKey(e: KeyboardEvent): void {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) this.history.redo((id) => this.doc.layers.find((l) => l.id === id));
      else this.history.undo((id) => this.doc.layers.find((l) => l.id === id));
      this.requestRender();
      return;
    }
    if (mod) return;
    const map: Record<string, string> = { b: "brush", e: "eraser", v: "transform", c: "crop" };
    const id = map[e.key.toLowerCase()];
    if (id) this.setTool(id);
  }

  rebuildUI(): void {
    buildToolbar(document.getElementById("toolbar")!, this);
    buildProperties(document.getElementById("properties")!, this);
    buildLayersPanel(document.getElementById("layers")!, this);
  }

  private loop = (): void => {
    if (this.dirty) {
      this.viewport.resizeToDisplay();
      composite(this.doc, this.view);
      this.dirty = false;
    }
    requestAnimationFrame(this.loop);
  };
}
