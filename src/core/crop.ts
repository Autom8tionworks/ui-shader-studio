/**
 * Crop the document to a sub-rectangle (in document px, y-up). Every layer is resampled to
 * the new size and the shared scratch/accum targets are reallocated.
 */
import { ctx } from "../engine/gl";
import { runPass } from "../engine/pass";
import { GLTexture, PingPong, RenderTarget } from "../engine/texture";
import { QUAD_VERT } from "../engine/shaders/quad.vert";
import { Document } from "./document";

const CROP_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 frag;
uniform sampler2D u_tex;
uniform vec2 u_origin;  // crop rect origin in source uv
uniform vec2 u_size;    // crop rect size in source uv
void main() {
  vec2 uv = u_origin + v_uv * u_size;
  frag = texture(u_tex, uv);
}
`;

export function cropDocument(doc: Document, x: number, y: number, w: number, h: number): void {
  w = Math.max(1, Math.round(w));
  h = Math.max(1, Math.round(h));
  const origin: [number, number] = [x / doc.width, y / doc.height];
  const size: [number, number] = [w / doc.width, h / doc.height];

  const gl = ctx().gl;
  for (const layer of doc.layers) {
    const tmp = new RenderTarget(w, h, false);
    runPass({
      vert: QUAD_VERT,
      frag: CROP_FRAG,
      inputs: { u_tex: layer.texture },
      uniforms: { u_origin: origin, u_size: size },
      target: tmp
    });
    // Move cropped pixels into a fresh layer texture.
    const newTex = new GLTexture(w, h);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, tmp.fbo);
    gl.bindTexture(gl.TEXTURE_2D, newTex.tex);
    gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 0, 0, w, h, 0);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    layer.texture.dispose();
    layer.texture = newTex;
    layer.width = w;
    layer.height = h;
    tmp.dispose();
  }

  doc.width = w;
  doc.height = h;
  const float = ctx().floatTargets;
  doc.accum.dispose();
  doc.scratch.dispose();
  doc.brushScratch.dispose();
  doc.accum = new PingPong(w, h, float);
  doc.scratch = new PingPong(w, h, float);
  doc.brushScratch = new RenderTarget(w, h, false);
}
