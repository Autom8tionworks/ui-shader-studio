/**
 * App wires the engine, document, tools, view and panels together and owns the render loop.
 * The loop is dirty-driven, except when a visible layer has an animated shader filter, in
 * which case it advances time and redraws every frame.
 */
import { createContext } from "../engine/gl";
import { Document } from "../core/document";
import { Layer } from "../core/layer";
import { History } from "../core/history";
import { composite, View } from "../core/compositor";
import { cropDocument } from "../core/crop";
import { downloadDocument } from "../core/exporter";
import { Tool, PointerInfo } from "../tools/tool";
import { BrushTool } from "../tools/brushTool";
import { TransformTool } from "../tools/transformTool";
import { SelectTool } from "../tools/selectTool";
import { FillTool } from "../tools/fillTool";
import { GradientTool } from "../tools/gradientTool";
import { EyedropperTool } from "../tools/eyedropperTool";
import { TextTool } from "../tools/textTool";
import { ShapeTool } from "../tools/shapeTool";
import { Viewport } from "./viewport";
import { buildToolbar } from "./toolbar";
import { buildLayersPanel } from "./layersPanel";
import { buildProperties } from "./properties";
import { gradientLayer, shapesLayer } from "./sample";

export class App {
  doc: Document;
  history = new History();
  view: View = { zoom: 1, panX: 0, panY: 0 };
  mouse: [number, number, number, number] = [0, 0, 0, 0];

  tools: Record<string, Tool>;
  brush: BrushTool;
  eraser: BrushTool;
  transform: TransformTool;
  select: SelectTool;
  fill: FillTool;
  gradient: GradientTool;
  eyedropper: EyedropperTool;
  text: TextTool;
  shape: ShapeTool;
  currentToolId = "brush";

  private dirty = true;
  private viewport: Viewport;
  private lastTime = performance.now();

  constructor() {
    const canvas = document.getElementById("gl") as HTMLCanvasElement;
    createContext(canvas);

    const W = 900;
    const H = 600;
    this.doc = new Document(W, H);
    this.doc.addLayer(new Layer("Background", W, H, gradientLayer(W, H)), false);
    this.doc.addLayer(new Layer("Shapes", W, H, shapesLayer(W, H)), true);

    this.brush = new BrushTool();
    this.eraser = new BrushTool();
    this.eraser.id = "eraser";
    this.eraser.settings.erase = true;
    this.transform = new TransformTool();
    this.select = new SelectTool();
    this.fill = new FillTool();
    this.gradient = new GradientTool();
    this.eyedropper = new EyedropperTool();
    this.eyedropper.onPick = (rgb) => {
      this.brush.settings.color = rgb;
      this.fill.color = rgb;
      this.shape.color = rgb;
      this.rebuildUI();
    };
    this.text = new TextTool();
    this.shape = new ShapeTool();

    this.tools = {
      brush: this.brush, eraser: this.eraser, transform: this.transform, select: this.select,
      fill: this.fill, gradient: this.gradient, eyedropper: this.eyedropper, text: this.text, shape: this.shape
    };

    this.viewport = new Viewport(canvas, this);
    this.fitView();
    this.rebuildUI();
    this.wireTopbar();
    this.history.onChange = () => this.updateTopbar();
    this.updateTopbar();
    this.loop();
    window.addEventListener("keydown", (e) => this.onKey(e));
  }

  get currentTool(): Tool | undefined {
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
      rebuildUI: () => this.rebuildUI(),
      addLayer: (layer: Layer) => this.addLayerUndoable(layer),
      beginHistory: () => {
        const l = this.doc.activeLayer;
        if (l) this.history.snapshot(l);
      }
    };
  }

  setMouse(p: PointerInfo, down: boolean): void {
    this.mouse[0] = p.x;
    this.mouse[1] = p.y;
    if (down) {
      this.mouse[2] = p.x;
      this.mouse[3] = p.y;
    }
  }

  dispatchPointer(kind: "down" | "move" | "up", p: PointerInfo): void {
    this.setMouse(p, kind === "down");
    if (this.currentTool || kind !== "up") this.requestRender();
    const tool = this.currentTool;
    if (!tool) return;
    const c = this.toolContext();
    if (kind === "down") tool.onPointerDown(p, c);
    else if (kind === "move") tool.onPointerMove(p, c);
    else tool.onPointerUp(p, c);
  }

  // ---- undo / redo ----
  undo(): void {
    this.history.undo((id) => this.doc.layers.find((l) => l.id === id));
    this.requestRender();
    this.rebuildUI();
  }
  redo(): void {
    this.history.redo((id) => this.doc.layers.find((l) => l.id === id));
    this.requestRender();
    this.rebuildUI();
  }

  // ---- layer ops (undoable) ----
  addLayerUndoable(layer: Layer, makeActive = true): void {
    const doc = this.doc;
    const prevActive = doc.activeLayerId;
    doc.addLayer(layer, makeActive);
    this.history.pushCommand(
      () => {
        doc.layers = doc.layers.filter((l) => l !== layer);
        doc.activeLayerId = prevActive;
        this.requestRender();
        this.rebuildUI();
      },
      () => {
        if (!doc.layers.includes(layer)) doc.layers.push(layer);
        if (makeActive) doc.activeLayerId = layer.id;
        this.requestRender();
        this.rebuildUI();
      }
    );
    this.requestRender();
    this.rebuildUI();
  }

  addBlankLayer(): void {
    this.addLayerUndoable(new Layer(`Layer ${this.doc.layers.length + 1}`, this.doc.width, this.doc.height));
  }

  deleteActiveLayer(): void {
    const doc = this.doc;
    const layer = doc.activeLayer;
    if (!layer) return;
    const index = doc.layers.indexOf(layer);
    const prevActive = doc.activeLayerId;
    const remove = () => {
      doc.layers = doc.layers.filter((l) => l !== layer);
      doc.activeLayerId = doc.layers.length ? doc.layers[doc.layers.length - 1].id : -1;
      this.requestRender();
      this.rebuildUI();
    };
    remove();
    this.history.pushCommand(
      () => {
        if (!doc.layers.includes(layer)) doc.layers.splice(index, 0, layer);
        doc.activeLayerId = prevActive;
        this.requestRender();
        this.rebuildUI();
      },
      remove
    );
  }

  crop(x: number, y: number, w: number, h: number): void {
    cropDocument(this.doc, x, y, w, h);
    this.fitView();
    this.requestRender();
    this.rebuildUI();
  }

  selectAll(): void {
    this.doc.selection.selectAll();
    this.requestRender();
  }
  deselect(): void {
    this.doc.selection.clear();
    this.requestRender();
  }

  // ---- import ----
  importImageDialog(): void {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const f = input.files?.[0];
      if (f) this.importImage(f);
    };
    input.click();
  }

  importImage(file: File): void {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const doc = this.doc;
      const cv = document.createElement("canvas");
      cv.width = doc.width;
      cv.height = doc.height;
      const g = cv.getContext("2d")!;
      const scale = Math.min(doc.width / img.width, doc.height / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      g.drawImage(img, (doc.width - w) / 2, (doc.height - h) / 2, w, h);
      const name = file.name.replace(/\.[^.]+$/, "").slice(0, 22) || "Imported";
      this.addLayerUndoable(new Layer(name, doc.width, doc.height, cv), true);
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      alert("Could not load that image.");
    };
    img.src = url;
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

  // ---- export (full document resolution) ----
  export(format: "png" | "jpeg"): void {
    composite(this.doc, this.view, { mouse: this.mouse }); // ensure accumulator is current
    downloadDocument(this.doc, format);
    this.requestRender();
  }

  private onKey(e: KeyboardEvent): void {
    const mod = e.ctrlKey || e.metaKey;
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "TEXTAREA" || tag === "INPUT") return;
    if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) this.redo();
      else this.undo();
      return;
    }
    if (mod && e.key.toLowerCase() === "y") {
      e.preventDefault();
      this.redo();
      return;
    }
    if (mod && e.key.toLowerCase() === "a") {
      e.preventDefault();
      this.selectAll();
      return;
    }
    if (mod && e.key.toLowerCase() === "d") {
      e.preventDefault();
      this.deselect();
      return;
    }
    if (mod) return;
    const map: Record<string, string> = {
      b: "brush", e: "eraser", v: "transform", c: "crop", m: "select",
      g: "gradient", k: "fill", i: "eyedropper", t: "text", u: "shape", s: "shader"
    };
    const id = map[e.key.toLowerCase()];
    if (id) this.setTool(id);
  }

  private wireTopbar(): void {
    const on = (id: string, fn: () => void) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("click", fn);
    };
    on("btn-import", () => this.importImageDialog());
    on("btn-undo", () => this.undo());
    on("btn-redo", () => this.redo());
    on("btn-export-png", () => this.export("png"));
    on("btn-export-jpg", () => this.export("jpeg"));
  }

  updateTopbar(): void {
    const u = document.getElementById("btn-undo") as HTMLButtonElement | null;
    const r = document.getElementById("btn-redo") as HTMLButtonElement | null;
    if (u) u.disabled = !this.history.canUndo();
    if (r) r.disabled = !this.history.canRedo();
  }

  rebuildUI(): void {
    buildToolbar(document.getElementById("toolbar")!, this);
    buildProperties(document.getElementById("properties")!, this);
    buildLayersPanel(document.getElementById("layers")!, this);
    this.updateTopbar();
  }

  private loop = (): void => {
    const now = performance.now();
    const dt = (now - this.lastTime) / 1000;
    this.lastTime = now;

    let animating = false;
    for (const l of this.doc.layers) {
      if (!l.visible) continue;
      if (l.shaderFilter?.animated) {
        l.shaderFilter.time += dt;
        animating = true;
      }
      if (l.liquidGlass) {
        l.liquidGlass.time += dt;
        animating = true;
      }
    }
    if (animating) this.dirty = true;

    if (this.dirty) {
      this.viewport.resizeToDisplay();
      composite(this.doc, this.view, { mouse: this.mouse });
      this.dirty = false;
    }
    requestAnimationFrame(this.loop);
  };
}
