/**
 * Linear gradient tool. Drag to set the gradient axis; release applies a color0->color1
 * gradient into the active layer, clipped to the selection. Previews live by re-applying
 * from a snapshot of the layer taken at pointer-down.
 */
import { ctx } from "../engine/gl";
import { runPass } from "../engine/pass";
import { whiteTexture } from "../engine/util";
import { QUAD_VERT } from "../engine/shaders/quad.vert";
import { GRADIENT_FRAG } from "../engine/shaders/fill";
import { GLTexture } from "../engine/texture";
import { Tool, PointerInfo, ToolContext } from "./tool";

export class GradientTool implements Tool {
  id = "gradient";
  color0: [number, number, number, number] = [0.1, 0.5, 1.0, 1];
  color1: [number, number, number, number] = [1.0, 0.2, 0.6, 0];
  opacity = 1;

  private start: { x: number; y: number } | null = null;
  private origin: GLTexture | null = null;
  private dragging = false;

  onPointerDown(p: PointerInfo, c: ToolContext): void {
    const layer = c.doc.activeLayer;
    if (!layer) return;
    c.beginHistory();
    this.dragging = true;
    this.start = { x: p.x, y: p.y };
    this.origin = copyTexture(layer.texture, layer.width, layer.height);
  }

  onPointerMove(p: PointerInfo, c: ToolContext): void {
    if (!this.dragging || !this.start || !this.origin) return;
    this.apply(this.start, p, c);
    c.requestRender();
  }

  onPointerUp(p: PointerInfo, c: ToolContext): void {
    if (!this.dragging || !this.start || !this.origin) return;
    this.apply(this.start, p, c);
    this.dragging = false;
    this.origin.dispose();
    this.origin = null;
    c.requestRender();
  }

  private apply(a: { x: number; y: number }, b: PointerInfo, c: ToolContext): void {
    const doc = c.doc;
    const layer = doc.activeLayer!;
    runPass({
      vert: QUAD_VERT,
      frag: GRADIENT_FRAG,
      inputs: {
        u_layer: this.origin!,
        u_mask: doc.selection.active ? doc.selection.texture : whiteTexture()
      },
      uniforms: {
        u_p0: [a.x / doc.width, a.y / doc.height],
        u_p1: [b.x / doc.width, b.y / doc.height],
        u_c0: this.color0,
        u_c1: this.color1,
        u_opacity: this.opacity,
        u_aspect: doc.width / doc.height
      },
      target: doc.brushScratch
    });
    layer.copyInto(layer.texture, doc.brushScratch);
  }
}

function copyTexture(src: GLTexture, w: number, h: number): GLTexture {
  const gl = ctx().gl;
  const out = new GLTexture(w, h);
  const fb = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, src.tex, 0);
  gl.bindTexture(gl.TEXTURE_2D, out.tex);
  gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 0, 0, w, h, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.deleteFramebuffer(fb);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return out;
}
