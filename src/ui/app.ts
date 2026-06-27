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
import { runPass } from "../engine/pass";
import { QUAD_VERT } from "../engine/shaders/quad.vert";
import { CUTOUT_FRAG, ERASE_FRAG } from "../engine/shaders/cutout";
import { cropDocument, resizeDocBuffers, readTexturePixels, textureFromPixels } from "../core/crop";
import { downloadDocument } from "../core/exporter";
import { Timeline } from "../core/timeline";
import { recordCanvas, downloadBlob, videoExportSupported } from "../core/videoExport";
import { serializeProject, deserializeProject, applyTimeline } from "../core/project";
import { buildTimeline } from "./timelinePanel";
import { Tool, PointerInfo } from "../tools/tool";
import { BrushTool } from "../tools/brushTool";
import { TransformTool } from "../tools/transformTool";
import { SelectTool } from "../tools/selectTool";
import { FillTool } from "../tools/fillTool";
import { GradientTool } from "../tools/gradientTool";
import { EyedropperTool } from "../tools/eyedropperTool";
import { TextTool } from "../tools/textTool";
import { ShapeTool } from "../tools/shapeTool";
import { CropTool } from "../tools/cropTool";
import { LassoTool } from "../tools/lassoTool";
import { Viewport } from "./viewport";
import { buildToolbar } from "./toolbar";
import { buildLayersPanel } from "./layersPanel";
import { buildProperties } from "./properties";
import { gradientLayer, shapesLayer } from "./sample";

export class App {
  doc: Document;
  history = new History();
  timeline = new Timeline();
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
  cropTool: CropTool;
  lasso: LassoTool;
  currentToolId = "transform";

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
    this.cropTool = new CropTool();
    this.lasso = new LassoTool();

    this.tools = {
      brush: this.brush, eraser: this.eraser, transform: this.transform, select: this.select,
      fill: this.fill, gradient: this.gradient, eyedropper: this.eyedropper, text: this.text, shape: this.shape, crop: this.cropTool, lasso: this.lasso
    };

    this.viewport = new Viewport(canvas, this);
    this.fitView();
    this.rebuildUI();
    this.wireTopbar();
    this.history.onChange = () => this.updateTopbar();
    this.updateTopbar();
    this.setupTransfer();
    this.loop();
    window.addEventListener("keydown", (e) => this.onKey(e));
  }

  get currentTool(): Tool | undefined {
    return this.tools[this.currentToolId];
  }

  setTool(id: string): void {
    this.currentToolId = id;
    if (id === "crop" && !this.cropTool.rect) {
      this.cropTool.rect = { x: 0, y: 0, w: this.doc.width, h: this.doc.height };
    }
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
      zoom: this.view.zoom,
      returnToSelect: () => this.setTool("transform"),
      liftSelection: () => this.liftSelectionToLayer(),
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
    const doc = this.doc;
    const oldW = doc.width;
    const oldH = doc.height;
    // Snapshot pre-crop pixels (and masks) so the crop can be undone.
    const snaps = doc.layers.map((l) => ({
      id: l.id,
      pixels: readTexturePixels(l.texture, l.width, l.height),
      mask: l.mask ? readTexturePixels(l.mask, l.width, l.height) : null
    }));

    const applyCrop = () => {
      cropDocument(doc, x, y, w, h);
      this.cropTool.rect = { x: 0, y: 0, w: doc.width, h: doc.height };
      this.fitView();
      this.requestRender();
      this.rebuildUI();
    };
    applyCrop();

    this.history.pushCommand(
      () => {
        // undo: restore previous size + pixels into the same layer instances
        for (const s of snaps) {
          const l = doc.layers.find((L) => L.id === s.id);
          if (!l) continue;
          l.texture.dispose();
          l.texture = textureFromPixels(s.pixels, oldW, oldH);
          l.width = oldW;
          l.height = oldH;
          if (s.mask) {
            if (l.mask) l.mask.dispose();
            l.mask = textureFromPixels(s.mask, oldW, oldH);
          } else if (l.mask) {
            l.mask.dispose();
            l.mask = null;
          }
        }
        resizeDocBuffers(doc, oldW, oldH);
        this.cropTool.rect = { x: 0, y: 0, w: oldW, h: oldH };
        this.fitView();
        this.requestRender();
        this.rebuildUI();
      },
      applyCrop
    );
  }

  selectAll(): void {
    this.doc.selection.selectAll();
    this.requestRender();
  }
  deselect(): void {
    this.doc.selection.clear();
    this.requestRender();
  }

  /** Cut the active layer's pixels inside the selection into a new movable layer (one undo step). */
  liftSelectionToLayer(): void {
    const doc = this.doc;
    const src = doc.activeLayer;
    if (!doc.selection.active || !src) {
      this.setTool("transform");
      return;
    }
    const w = doc.width, h = doc.height;
    const beforeSrc = readTexturePixels(src.texture, w, h);

    // 1) Cutout = source pixels inside the selection -> new layer.
    runPass({ vert: QUAD_VERT, frag: CUTOUT_FRAG, inputs: { u_layer: src.texture, u_mask: doc.selection.texture }, target: doc.brushScratch });
    const cut = new Layer(`${src.name} cutout`, w, h);
    cut.copyInto(cut.texture, doc.brushScratch);

    // 2) Erase those pixels from the source so the object truly moves out.
    runPass({ vert: QUAD_VERT, frag: ERASE_FRAG, inputs: { u_layer: src.texture, u_mask: doc.selection.texture }, target: doc.brushScratch });
    src.copyInto(src.texture, doc.brushScratch);
    const afterSrc = readTexturePixels(src.texture, w, h);

    doc.selection.clear();
    const idx = doc.layers.length;
    doc.addLayer(cut, true);
    this.setTool("transform");
    this.requestRender();
    this.rebuildUI();

    this.history.pushCommand(
      () => {
        src.texture.dispose();
        src.texture = textureFromPixels(beforeSrc, w, h);
        doc.layers = doc.layers.filter((l) => l !== cut);
        doc.activeLayerId = src.id;
        this.requestRender();
        this.rebuildUI();
      },
      () => {
        src.texture.dispose();
        src.texture = textureFromPixels(afterSrc, w, h);
        if (!doc.layers.includes(cut)) doc.layers.splice(idx, 0, cut);
        doc.activeLayerId = cut.id;
        this.requestRender();
        this.rebuildUI();
      }
    );
  }

  // ---- import ----
  importImageDialog(): void {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*,video/*";
    input.multiple = true;
    input.onchange = () => {
      for (const f of Array.from(input.files || [])) this.importFile(f);
    };
    input.click();
  }

  /** Route one file to the right importer (image vs. video), each as its own layer. */
  importFile(f: File): void {
    if (f.type.startsWith("video/")) this.addVideoLayer(f);
    else this.importImage(f);
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

  // ---- clipboard paste + drag-and-drop ----
  private setupTransfer(): void {
    window.addEventListener("paste", (e) => {
      const items = (e as ClipboardEvent).clipboardData?.items;
      if (!items) return;
      for (const it of items) {
        if (it.type.startsWith("image/")) {
          const f = it.getAsFile();
          if (f) { e.preventDefault(); this.importImage(f); }
          return;
        }
      }
    });
    const dz = document.getElementById("dropzone");
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files");
    let depth = 0;
    window.addEventListener("dragenter", (e) => { if (hasFiles(e)) { e.preventDefault(); depth++; dz?.classList.add("show"); } });
    window.addEventListener("dragover", (e) => { if (hasFiles(e)) { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = "copy"; } });
    window.addEventListener("dragleave", (e) => { if (hasFiles(e)) { depth--; if (depth <= 0) { depth = 0; dz?.classList.remove("show"); } } });
    window.addEventListener("drop", (e) => { e.preventDefault(); depth = 0; dz?.classList.remove("show"); this.handleDrop(e.dataTransfer); });
  }

  private handleDrop(dt: DataTransfer | null): void {
    if (!dt) return;
    for (const f of Array.from(dt.files)) {
      if (f.type.startsWith("image/")) this.importImage(f);
      else if (f.type.startsWith("video/")) this.addVideoLayer(f);
      else if (f.name.toLowerCase().endsWith(".json") || f.type === "application/json") {
        const r = new FileReader();
        r.onload = () => void this.loadProjectText(String(r.result));
        r.readAsText(f);
      }
    }
  }

  // ---- live input layers ----
  async addWebcamLayer(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: false });
      const video = document.createElement("video");
      video.srcObject = stream;
      video.muted = true;
      (video as HTMLVideoElement & { playsInline: boolean }).playsInline = true;
      await video.play();
      const cv = document.createElement("canvas");
      cv.width = this.doc.width;
      cv.height = this.doc.height;
      const layer = new Layer("Webcam", this.doc.width, this.doc.height);
      layer.liveSource = { kind: "camera", video, canvas: cv, stream };
      this.addLayerUndoable(layer, true);
    } catch (e) {
      alert("Could not access the camera: " + (e as Error).message);
    }
  }

  addVideoLayerDialog(): void {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "video/*";
    input.multiple = true;
    input.onchange = () => {
      for (const f of Array.from(input.files || [])) this.addVideoLayer(f);
    };
    input.click();
  }

  addVideoLayer(file: File): void {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.src = url;
    video.muted = true;
    video.loop = this.timeline.loop;
    (video as HTMLVideoElement & { playsInline: boolean }).playsInline = true;
    video.addEventListener("loadedmetadata", () => {
      if (isFinite(video.duration) && video.duration > 0) {
        // Match the timeline length to the clip so the scrubber maps to it.
        this.timeline.duration = Math.min(600, Math.max(0.5, video.duration));
        this.rebuildUI();
      }
    });
    const cv = document.createElement("canvas");
    cv.width = this.doc.width;
    cv.height = this.doc.height;
    const name = file.name.replace(/\.[^.]+$/, "").slice(0, 18) || "Video";
    const layer = new Layer(name, this.doc.width, this.doc.height);
    layer.liveSource = { kind: "video", video, canvas: cv, url };
    this.addLayerUndoable(layer, true);
    // Start playing through the transport so play/pause/scrub control it.
    this.setTimelinePlaying(true);
  }

  /** First visible imported-video element (the seekable clock for the timeline). */
  private primaryVideo(): HTMLVideoElement | null {
    for (const l of this.doc.layers) {
      if (l.visible && l.liveSource?.kind === "video") return l.liveSource.video;
    }
    return null;
  }

  // ---- timeline transport (also drives imported video layers) ----
  setTimelinePlaying(on: boolean): void {
    const tl = this.timeline;
    if (on && tl.time >= tl.duration) tl.time = 0;
    tl.playing = on;
    for (const l of this.doc.layers) {
      const ls = l.liveSource;
      if (ls?.kind === "video") {
        ls.video.loop = tl.loop;
        if (on) void ls.video.play().catch(() => {});
        else ls.video.pause();
      }
    }
    this.requestRender();
    this.rebuildUI();
  }

  stopTimeline(): void {
    const tl = this.timeline;
    tl.playing = false;
    tl.time = 0;
    for (const l of this.doc.layers) {
      const ls = l.liveSource;
      if (ls?.kind === "video") {
        ls.video.pause();
        try { ls.video.currentTime = 0; } catch { /* not seekable yet */ }
      }
    }
    tl.evaluate(this.doc, 0);
    this.updateTimelinePlayhead();
    this.requestRender();
    this.rebuildUI();
  }

  seekTimeline(frac: number): void {
    const tl = this.timeline;
    frac = Math.max(0, Math.min(1, frac));
    tl.time = frac * tl.duration;
    for (const l of this.doc.layers) {
      const ls = l.liveSource;
      if (ls?.kind === "video" && isFinite(ls.video.duration) && ls.video.duration > 0) {
        try { ls.video.currentTime = frac * ls.video.duration; } catch { /* ignore */ }
      }
    }
    tl.evaluate(this.doc, tl.time);
    this.updateTimelinePlayhead();
    this.requestRender();
  }

  // ---- timeline video export ----
  async exportVideo(): Promise<void> {
    if (!videoExportSupported()) {
      alert("Video export needs a Chromium-based browser (Chrome/Edge).");
      return;
    }
    const canvas = document.getElementById("gl") as HTMLCanvasElement;
    const tl = this.timeline;
    const prevLoop = tl.loop;
    tl.loop = false;
    tl.time = 0;
    const playback = new Promise<void>((res) => { tl.onComplete = () => res(); });
    tl.playing = true;
    for (const l of this.doc.layers) {
      const ls = l.liveSource;
      if (ls?.kind === "video") { ls.video.loop = false; try { ls.video.currentTime = 0; } catch { /* */ } void ls.video.play().catch(() => {}); }
    }
    this.requestRender();
    try {
      const blob = await recordCanvas(canvas, tl.fps, () => playback);
      downloadBlob(blob, "shader-studio.webm");
    } finally {
      tl.onComplete = null;
      tl.loop = prevLoop;
      tl.playing = false;
      tl.time = 0;
      this.requestRender();
      this.rebuildUI();
    }
  }

  // ---- project save / open (parametric .json) ----
  saveProject(): void {
    const json = serializeProject(this.doc, this.timeline);
    downloadBlob(new Blob([json], { type: "application/json" }), "shader-studio-project.json");
  }

  openProjectDialog(): void {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json,.ssp";
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => void this.loadProjectText(String(reader.result));
      reader.readAsText(f);
    };
    input.click();
  }

  async loadProjectText(text: string): Promise<void> {
    try {
      const { project, doc, indexToId } = await deserializeProject(text);
      const old = this.doc;
      this.doc = doc;
      applyTimeline(this.timeline, project, indexToId);
      old.dispose();
      this.fitView();
      this.requestRender();
      this.rebuildUI();
    } catch (e) {
      alert("Could not open project: " + (e as Error).message);
    }
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
    if (mod && e.key.toLowerCase() === "s") {
      e.preventDefault();
      this.saveProject();
      return;
    }
    if (mod && e.key.toLowerCase() === "o") {
      e.preventDefault();
      this.openProjectDialog();
      return;
    }
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
      g: "gradient", k: "fill", i: "eyedropper", t: "text", u: "shape", s: "shader", l: "lasso"
    };
    const id = map[e.key.toLowerCase()];
    if (id) this.setTool(id);
  }

  private wireTopbar(): void {
    const on = (id: string, fn: () => void) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("click", fn);
    };
    on("btn-save", () => this.saveProject());
    on("btn-open", () => this.openProjectDialog());
    on("btn-import", () => this.importImageDialog());
    on("btn-webcam", () => void this.addWebcamLayer());
    on("btn-video", () => this.addVideoLayerDialog());
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
    const tl = document.getElementById("timeline");
    if (tl) buildTimeline(tl, this);
    this.updateTopbar();
  }

  private loop = (): void => {
    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;

    let animating = false;
    for (const l of this.doc.layers) {
      if (l.liveSource) {
        l.updateLiveTexture();
        if (l.visible) animating = true;
      }
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

    if (this.timeline.playing) {
      const vid = this.primaryVideo();
      if (vid && isFinite(vid.duration) && vid.duration > 0) {
        vid.loop = this.timeline.loop;
        this.timeline.time = Math.min(vid.currentTime, this.timeline.duration);
        if (vid.ended && !this.timeline.loop) {
          const cb = this.timeline.onComplete;
          this.setTimelinePlaying(false);
          cb?.();
        }
      } else {
        this.timeline.advance(dt);
      }
      this.timeline.evaluate(this.doc, this.timeline.time);
      this.updateTimelinePlayhead();
      animating = true;
    }

    if (animating) this.dirty = true;

    if (this.dirty) {
      this.viewport.resizeToDisplay();
      composite(this.doc, this.view, {
        mouse: this.mouse,
        crop: this.currentToolId === "crop" ? this.cropTool.rect : null
      });
      this.dirty = false;
    }
    requestAnimationFrame(this.loop);
  };

  updateTimelinePlayhead(): void {
    const ph = document.getElementById("tl-playhead");
    const tt = document.getElementById("tl-time");
    const frac = this.timeline.duration > 0 ? this.timeline.time / this.timeline.duration : 0;
    if (ph) ph.style.left = `calc(150px + ${frac} * (100% - 162px))`;
    const knob = document.getElementById("tl-knob");
    if (knob) knob.style.left = `${frac * 100}%`;
    if (tt) tt.textContent = `${this.timeline.time.toFixed(2)} / ${this.timeline.duration.toFixed(1)}s`;
  }
}
