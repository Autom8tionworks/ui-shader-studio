/**
 * Crop the document to a sub-rectangle (in document px, y-up). Every layer (and its mask)
 * is resampled to the new size; the shared scratch/accum targets and the selection are
 * reallocated.
 */
import { ctx } from "../engine/gl";
import { runPass } from "../engine/pass";
import { GLTexture, PingPong, RenderTarget } from "../engine/texture";
import { QUAD_VERT } from "../engine/shaders/quad.vert";
import { Document } from "./document";
import { Selection } from "./selection";

const CROP_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 frag;
uniform sampler2D u_tex;
uniform vec2 u_origin;
uniform vec2 u_size;
void main() {
  vec2 uv = u_origin + v_uv * u_size;
  frag = texture(u_tex, uv);
}
`;

function cropTexture(src: GLTexture, w: number, h: number, origin: [number, number], size: [number, number]): GLTexture {
  const gl = ctx().gl;
  const tmp = new RenderTarget(w, h, false);
  runPass({ vert: QUAD_VERT, frag: CROP_FRAG, inputs: { u_tex: src }, uniforms: { u_origin: origin, u_size: size }, target: tmp });
  const out = new GLTexture(w, h);
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, tmp.fbo);
  gl.bindTexture(gl.TEXTURE_2D, out.tex);
  gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 0, 0, w, h, 0);
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  tmp.dispose();
  return out;
}

export function cropDocument(doc: Document, x: number, y: number, w: number, h: number): void {
  w = Math.max(1, Math.round(w));
  h = Math.max(1, Math.round(h));
  const origin: [number, number] = [x / doc.width, y / doc.height];
  const size: [number, number] = [w / doc.width, h / doc.height];

  for (const layer of doc.layers) {
    const newTex = cropTexture(layer.texture, w, h, origin, size);
    layer.texture.dispose();
    layer.texture = newTex;
    if (layer.mask) {
      const newMask = cropTexture(layer.mask, w, h, origin, size);
      layer.mask.dispose();
      layer.mask = newMask;
    }
    layer.width = w;
    layer.height = h;
  }

  resizeDocBuffers(doc, w, h);
}

/** Reallocate the document's shared scratch/accum targets and selection at a new size. */
export function resizeDocBuffers(doc: Document, w: number, h: number): void {
  doc.width = w;
  doc.height = h;
  const float = ctx().floatTargets;
  doc.accum.dispose();
  doc.scratch.dispose();
  doc.brushScratch.dispose();
  doc.accum = new PingPong(w, h, float);
  doc.scratch = new PingPong(w, h, float);
  doc.brushScratch = new RenderTarget(w, h, false);
  doc.selection = new Selection(w, h);
}

/** Read a straight-alpha texture's pixels (GL bottom-up order) for snapshotting. */
export function readTexturePixels(tex: GLTexture, w: number, h: number): Uint8Array {
  const gl = ctx().gl;
  const rt = new RenderTarget(w, h, false);
  gl.bindFramebuffer(gl.FRAMEBUFFER, rt.fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex.tex, 0);
  const px = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  rt.dispose();
  return px;
}

/** Recreate a texture from raw pixels (same bottom-up order readTexturePixels produced). */
export function textureFromPixels(px: Uint8Array, w: number, h: number): GLTexture {
  const gl = ctx().gl;
  const t = new GLTexture(w, h);
  gl.bindTexture(gl.TEXTURE_2D, t.tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, px);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return t;
}
