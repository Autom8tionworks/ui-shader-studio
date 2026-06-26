/**
 * Move / scale / rotate the active layer. On pointer down we snapshot the layer pixels into
 * an "origin" texture; every move resamples that origin through an affine into the layer, so
 * the operation is non-cumulative during the drag and fully reversible via history.
 *
 *   drag        → translate
 *   Shift+drag  → uniform scale (horizontal drag)
 *   Alt+drag    → rotate
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
    const layer = c.doc.activeLayer;
    if (!layer) return;
    c.beginHistory();
    this.dragging = true;
    this.start = { x: p.x, y: p.y };

    // Snapshot current layer pixels into an origin texture by copying via brushScratch.
    runPass({
      vert: QUAD_VERT,
      frag: COPY,
      inputs: { u_tex: layer.texture },
      target: c.doc.brushScratch
    });
    this.origin = new GLTexture(layer.width, layer.height);
    const gl = ctx().gl;
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, c.doc.brushScratch.fbo);
    gl.bindTexture(gl.TEXTURE_2D, this.origin.tex);
    gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 0, 0, layer.width, layer.height, 0);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
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
    if (p.alt) {
      rotate = (p.x - this.start.x) * 0.01;
    } else if (p.shift) {
      scale = Math.max(0.05, 1 + (p.x - this.start.x) / doc.width);
    } else {
      translate = [dx, dy];
    }

    runPass({
      vert: QUAD_VERT,
      frag: TRANSFORM_FRAG,
      inputs: { u_tex: this.origin },
      uniforms: {
        u_translate: translate,
        u_rotate: rotate,
        u_scale: scale,
        u_aspect: doc.width / doc.height
      },
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
