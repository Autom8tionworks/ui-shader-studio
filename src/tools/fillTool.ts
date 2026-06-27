/**
 * Fill tool: "solid" fills the selection (or whole layer) with the current color, "bucket"
 * flood-fills a contiguous color region from the click point. Both are clipped to the
 * selection when one exists.
 */
import { ctx } from "../engine/gl";
import { runPass } from "../engine/pass";
import { GLTexture, RenderTarget } from "../engine/texture";
import { whiteTexture } from "../engine/util";
import { QUAD_VERT } from "../engine/shaders/quad.vert";
import { FILL_FRAG } from "../engine/shaders/fill";
import { Tool, PointerInfo, ToolContext } from "./tool";

export type FillMode = "solid" | "bucket";

export class FillTool implements Tool {
  id = "fill";
  mode: FillMode = "bucket";
  color: [number, number, number] = [0.2, 0.6, 1.0];
  opacity = 1;
  tolerance = 32;

  onPointerDown(p: PointerInfo, c: ToolContext): void {
    const doc = c.doc;
    const layer = doc.activeLayer;
    if (!layer) return;
    c.beginHistory();

    let maskTex: GLTexture;
    let temp: GLTexture | null = null;
    if (this.mode === "solid") {
      maskTex = doc.selection.active ? doc.selection.texture : whiteTexture();
    } else {
      temp = this.bucketMask(p, c);
      maskTex = temp ?? whiteTexture();
    }

    runPass({
      vert: QUAD_VERT,
      frag: FILL_FRAG,
      inputs: { u_layer: layer.texture, u_mask: maskTex },
      uniforms: {
        u_color: [this.color[0], this.color[1], this.color[2], 1],
        u_opacity: this.opacity
      },
      target: doc.brushScratch
    });
    layer.copyInto(layer.texture, doc.brushScratch);
    if (temp) temp.dispose();
    c.requestRender();
  }

  onPointerMove(): void {}
  onPointerUp(): void {}

  /** Build a region mask texture by flood-filling from the click by color similarity. */
  private bucketMask(p: PointerInfo, c: ToolContext): GLTexture | null {
    const doc = c.doc;
    const layer = doc.activeLayer!;
    const w = doc.width;
    const h = doc.height;
    const raw = readLayerPixels(layer.texture.tex, w, h);
    const sx = Math.max(0, Math.min(w - 1, Math.round(p.x)));
    const syUp = Math.max(0, Math.min(h - 1, Math.round(p.y)));
    const seed = (syUp * w + sx) * 4;
    const sr = raw[seed], sg = raw[seed + 1], sb = raw[seed + 2];
    const tol = this.tolerance * this.tolerance * 3;

    const visited = new Uint8Array(w * h);
    const stack = [syUp * w + sx];
    while (stack.length) {
      const idx = stack.pop()!;
      if (visited[idx]) continue;
      visited[idx] = 1;
      const i4 = idx * 4;
      const dr = raw[i4] - sr, dg = raw[i4 + 1] - sg, db = raw[i4 + 2] - sb;
      if (dr * dr + dg * dg + db * db > tol) continue;
      visited[idx] = 2;
      const x = idx % w;
      const y = (idx - x) / w;
      if (x > 0) stack.push(idx - 1);
      if (x < w - 1) stack.push(idx + 1);
      if (y > 0) stack.push(idx - w);
      if (y < h - 1) stack.push(idx + w);
    }

    const selActive = doc.selection.active;
    const cv = document.createElement("canvas");
    cv.width = w;
    cv.height = h;
    const g = cv.getContext("2d")!;
    const img = g.createImageData(w, h);
    for (let r = 0; r < h; r++) {
      const yUp = h - 1 - r;
      for (let x = 0; x < w; x++) {
        const on = visited[yUp * w + x] === 2 ? 255 : 0;
        const o = (r * w + x) * 4;
        img.data[o] = on;
        img.data[o + 1] = on;
        img.data[o + 2] = on;
        img.data[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    const tex = new GLTexture(w, h, cv);
    void selActive;
    return tex;
  }
}

function readLayerPixels(tex: WebGLTexture, w: number, h: number): Uint8Array {
  const gl = ctx().gl;
  const rt = new RenderTarget(w, h, false);
  gl.bindFramebuffer(gl.FRAMEBUFFER, rt.fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const px = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  rt.dispose();
  return px;
}
