/**
 * Minimal undo/redo for destructive edits (brush strokes). Before a stroke we snapshot the
 * active layer's pixels; undo restores them. Non-destructive adjustments don't need history
 * because their parameters are already reversible via the UI.
 */
import { ctx } from "../engine/gl";
import { RenderTarget } from "../engine/texture";
import { Layer } from "./layer";

interface Snapshot {
  layerId: number;
  width: number;
  height: number;
  pixels: Uint8Array;
}

export class History {
  private undoStack: Snapshot[] = [];
  private redoStack: Snapshot[] = [];
  private limit = 30;

  /** Capture the current pixels of a layer (call before a destructive edit). */
  snapshot(layer: Layer): void {
    this.redoStack = [];
    this.undoStack.push(readLayer(layer));
    if (this.undoStack.length > this.limit) this.undoStack.shift();
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(getLayer: (id: number) => Layer | undefined): void {
    const snap = this.undoStack.pop();
    if (!snap) return;
    const layer = getLayer(snap.layerId);
    if (layer) {
      this.redoStack.push(readLayer(layer));
      writeLayer(layer, snap);
    }
  }

  redo(getLayer: (id: number) => Layer | undefined): void {
    const snap = this.redoStack.pop();
    if (!snap) return;
    const layer = getLayer(snap.layerId);
    if (layer) {
      this.undoStack.push(readLayer(layer));
      writeLayer(layer, snap);
    }
  }
}

function readLayer(layer: Layer): Snapshot {
  const gl = ctx().gl;
  const rt = new RenderTarget(layer.width, layer.height, false);
  // Draw the layer texture into a readable RGBA8 target.
  gl.bindFramebuffer(gl.FRAMEBUFFER, rt.fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, layer.texture.tex, 0);
  const pixels = new Uint8Array(layer.width * layer.height * 4);
  gl.readPixels(0, 0, layer.width, layer.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  rt.dispose();
  return { layerId: layer.id, width: layer.width, height: layer.height, pixels };
}

function writeLayer(layer: Layer, snap: Snapshot): void {
  const gl = ctx().gl;
  gl.bindTexture(gl.TEXTURE_2D, layer.texture.tex);
  gl.texImage2D(
    gl.TEXTURE_2D, 0, gl.RGBA8, snap.width, snap.height, 0,
    gl.RGBA, gl.UNSIGNED_BYTE, snap.pixels
  );
  gl.bindTexture(gl.TEXTURE_2D, null);
}
