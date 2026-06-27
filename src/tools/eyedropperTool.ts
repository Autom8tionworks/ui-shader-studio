/**
 * Eyedropper: samples the color under the pointer from the active layer and reports it back
 * via a callback (the app routes it into the brush/fill color).
 */
import { ctx } from "../engine/gl";
import { RenderTarget } from "../engine/texture";
import { Tool, PointerInfo, ToolContext } from "./tool";

export class EyedropperTool implements Tool {
  id = "eyedropper";
  onPick: (rgb: [number, number, number]) => void = () => {};

  onPointerDown(p: PointerInfo, c: ToolContext): void {
    const layer = c.doc.activeLayer;
    if (!layer) return;
    const gl = ctx().gl;
    const rt = new RenderTarget(layer.width, layer.height, false);
    gl.bindFramebuffer(gl.FRAMEBUFFER, rt.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, layer.texture.tex, 0);
    const px = new Uint8Array(4);
    const x = Math.max(0, Math.min(layer.width - 1, Math.round(p.x)));
    const y = Math.max(0, Math.min(layer.height - 1, Math.round(p.y)));
    gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    rt.dispose();
    this.onPick([px[0] / 255, px[1] / 255, px[2] / 255]);
    c.requestRender();
  }

  onPointerMove(): void {}
  onPointerUp(): void {}
}
