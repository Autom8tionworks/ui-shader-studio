/**
 * Document = canvas size + ordered layer list + shared scratch render targets + the active
 * selection. It owns no rendering logic itself (that's the compositor) but provides the
 * targets and selection that passes and tools use.
 */
import { PingPong, RenderTarget } from "../engine/texture";
import { ctx } from "../engine/gl";
import { Layer } from "./layer";
import { Selection } from "./selection";

export class Document {
  width: number;
  height: number;
  layers: Layer[] = [];
  activeLayerId = -1;
  selection: Selection;

  /** Accumulator the compositor blends each layer onto. */
  accum: PingPong;
  /** Scratch pair for a single layer's adjustment chain. */
  scratch: PingPong;
  /** Brush scratch target. */
  brushScratch: RenderTarget;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    const float = ctx().floatTargets;
    this.accum = new PingPong(width, height, float);
    this.scratch = new PingPong(width, height, float);
    this.brushScratch = new RenderTarget(width, height, false);
    this.selection = new Selection(width, height);
  }

  get activeLayer(): Layer | null {
    return this.layers.find((l) => l.id === this.activeLayerId) ?? null;
  }

  addLayer(layer: Layer, makeActive = true): void {
    this.layers.push(layer);
    if (makeActive) this.activeLayerId = layer.id;
  }

  removeLayer(id: number): void {
    const layer = this.layers.find((l) => l.id === id);
    if (!layer) return;
    layer.dispose();
    this.layers = this.layers.filter((l) => l.id !== id);
    if (this.activeLayerId === id) {
      this.activeLayerId = this.layers.length ? this.layers[this.layers.length - 1].id : -1;
    }
  }

  moveLayer(id: number, dir: -1 | 1): void {
    const i = this.layers.findIndex((l) => l.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= this.layers.length) return;
    [this.layers[i], this.layers[j]] = [this.layers[j], this.layers[i]];
  }

  dispose(): void {
    this.layers.forEach((l) => l.dispose());
    this.accum.dispose();
    this.scratch.dispose();
    this.brushScratch.dispose();
  }
}
