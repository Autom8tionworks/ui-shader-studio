/**
 * Select / Move tool (the default). Click an object to select it (picks the topmost layer
 * with a non-transparent pixel under the cursor), then drag to move it. Modifier drags scale
 * and rotate. Moving resamples from a snapshot taken at pointer-down, so it's reversible.
 *
 *   click       → select the object under the cursor
 *   drag        → move the selected object
 *   Shift+drag  → scale   |   Alt+drag → rotate
 */
import { runPass } from "../engine/pass";
import { GLTexture } from "../engine/texture";
import { ctx } from "../engine/gl";
import { QUAD_VERT } from "../engine/shaders/quad.vert";
import { TRANSFORM_FRAG } from "../engine/shaders/transform";
import { COPY } from "../engine/shaders/adjust";
import { Tool, PointerInfo, ToolContext } from "./tool";

export class TransformTool implements Tool {
  id = "transform";
  private origin: GLTexture | null = null;
  private start: { x: number; y: number } | null = null;
  private dragging = false;

  onPointerDown(p: PointerInfo, c: ToolContext): void {
    const doc = c.doc;
    // Pick the topmost visible layer with an opaque pixel under the cursor.
    const x = Math.round(p.x), y = Math.round(p.y);
    if (x >= 0 && y >= 0 && x < doc.width && y < doc.height) {
      for (let i = doc.layers.length - 1; i >= 0; i--) {
        const L = doc.layers[i];
        if (!L.visible) continue;
        const ax = alphaAt(L.texture.tex, Math.min(L.width - 1, x), Math.min(L.height - 1, y));
        if (ax > 8) {
          if (doc.activeLayerId !== L.id) {
            doc.activeLayerId = L.id;
            c.rebuildUI();
          }
          break;
        }
      }
    }

    const layer = doc.activeLayer;
    if (!layer) return;
    c.beginHistory();
    this.dragging = true;
    this.start = { x: p.x, y: p.y };

    runPass({ vert: QUAD_VERT, frag: COPY, inputs: { u_tex: layer.texture }, target: doc.brushScratch });
    this.origin = new GLTexture(layer.width, layer.height);
    const gl = ctx().gl;
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, doc.brushScratch.fbo);
    gl.bindTexture(gl.TEXTURE_2D, this.origin.tex);
    gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 0, 0, layer.width, layer.height, 0);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    c.requestRender();
  }

  onPointerMove(p: PointerInfo, c: ToolContext): void {
    if (!this.dragging || !this.start || !this.origin) return;
    const doc = c.doc;
    const layer = doc.activeLayer;
    if (!layer) return;

    const dx = (p.x - this.start.x) / doc.width;
    const dy = (p.y - this.start.y) / doc.height;
    let translate: [number, number] = [0, 0];
    let rotate = 0;
    let scale = 1;
    if (p.alt) rotate = (p.x - this.start.x) * 0.01;
    else if (p.shift) scale = Math.max(0.05, 1 + (p.x - this.start.x) / doc.width);
    else translate = [dx, dy];

    runPass({
      vert: QUAD_VERT,
      frag: TRANSFORM_FRAG,
      inputs: { u_tex: this.origin },
      uniforms: { u_translate: translate, u_rotate: rotate, u_scale: scale, u_aspect: doc.width / doc.height },
      target: doc.brushScratch
    });
    layer.adoptFrom(doc.brushScratch);
    c.requestRender();
  }

  onPointerUp(): void {
    this.dragging = false;
    this.start = null;
    if (this.origin) {
      this.origin.dispose();
      this.origin = null;
    }
  }
}

/** Read a single pixel's alpha from a texture at (x,y) in document px (y-up). */
function alphaAt(tex: WebGLTexture, x: number, y: number): number {
  const gl = ctx().gl;
  const fb = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const px = new Uint8Array(4);
  gl.readPixels(Math.max(0, x), Math.max(0, y), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.deleteFramebuffer(fb);
  return px[3];
}
