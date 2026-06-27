/**
 * Undo/redo. Two kinds of entries share one stack:
 *  - pixel snapshots: capture a layer's pixels before a destructive edit (brush, fill,
 *    gradient, shape, transform). Redo is handled by lazily capturing the post-edit pixels.
 *  - commands: undo/redo closures for structural changes (add / delete / import layer).
 */
import { ctx } from "../engine/gl";
import { RenderTarget } from "../engine/texture";
import { Layer } from "./layer";

interface PixelSnap {
  kind: "pixels";
  layerId: number;
  width: number;
  height: number;
  pixels: Uint8Array;
}
interface Command {
  kind: "command";
  undo: () => void;
  redo: () => void;
}
type Entry = PixelSnap | Command;

export class History {
  private undoStack: Entry[] = [];
  private redoStack: Entry[] = [];
  private limit = 40;
  onChange: () => void = () => {};

  /** Snapshot a layer's pixels before a destructive edit. */
  snapshot(layer: Layer): void {
    this.redoStack = [];
    this.undoStack.push(readLayer(layer));
    this.trim();
    this.onChange();
  }

  /** Record a reversible structural change. */
  pushCommand(undo: () => void, redo: () => void): void {
    this.redoStack = [];
    this.undoStack.push({ kind: "command", undo, redo });
    this.trim();
    this.onChange();
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(getLayer: (id: number) => Layer | undefined): void {
    const e = this.undoStack.pop();
    if (!e) return;
    if (e.kind === "pixels") {
      const layer = getLayer(e.layerId);
      if (layer) {
        this.redoStack.push(readLayer(layer));
        writeLayer(layer, e);
      } else this.redoStack.push(e);
    } else {
      e.undo();
      this.redoStack.push(e);
    }
    this.onChange();
  }

  redo(getLayer: (id: number) => Layer | undefined): void {
    const e = this.redoStack.pop();
    if (!e) return;
    if (e.kind === "pixels") {
      const layer = getLayer(e.layerId);
      if (layer) {
        this.undoStack.push(readLayer(layer));
        writeLayer(layer, e);
      } else this.undoStack.push(e);
    } else {
      e.redo();
      this.undoStack.push(e);
    }
    this.onChange();
  }

  private trim(): void {
    if (this.undoStack.length > this.limit) this.undoStack.shift();
  }
}

function readLayer(layer: Layer): PixelSnap {
  const gl = ctx().gl;
  const rt = new RenderTarget(layer.width, layer.height, false);
  gl.bindFramebuffer(gl.FRAMEBUFFER, rt.fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, layer.texture.tex, 0);
  const pixels = new Uint8Array(layer.width * layer.height * 4);
  gl.readPixels(0, 0, layer.width, layer.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  rt.dispose();
  return { kind: "pixels", layerId: layer.id, width: layer.width, height: layer.height, pixels };
}

function writeLayer(layer: Layer, snap: PixelSnap): void {
  const gl = ctx().gl;
  gl.bindTexture(gl.TEXTURE_2D, layer.texture.tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, snap.width, snap.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, snap.pixels);
  gl.bindTexture(gl.TEXTURE_2D, null);
}
