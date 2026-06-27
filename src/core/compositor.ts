/**
 * The compositor turns a Document into pixels. For each visible layer it runs the
 * adjustment chain + optional material + optional ShaderToy filter into scratch, applies
 * the layer mask, then blends onto the accumulator. Finally it presents the accumulator to
 * the screen under the view transform.
 */
import { ctx } from "../engine/gl";
import { runPass } from "../engine/pass";
import { RenderTarget } from "../engine/texture";
import { QUAD_VERT } from "../engine/shaders/quad.vert";
import { BLEND_FRAG } from "../engine/shaders/blend";
import {
  ADJ_BRIGHTNESS_CONTRAST,
  ADJ_HSL,
  ADJ_INVERT,
  ADJ_BLUR,
  COPY
} from "../engine/shaders/adjust";
import { getMaterial } from "../engine/shaders/material";
import { buildShaderToy } from "../engine/shaders/shadertoy";
import { Document } from "./document";
import { Layer } from "./layer";

export interface View {
  zoom: number;
  panX: number;
  panY: number;
}

export interface FrameInput {
  mouse: [number, number, number, number];
}

const PRESENT_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 frag;
uniform sampler2D u_tex;     // accumulator (premultiplied)
uniform vec2  u_viewport;
uniform vec2  u_docSize;
uniform vec2  u_offset;
uniform float u_zoom;
void main() {
  vec2 screenPx = v_uv * u_viewport;
  vec2 docPx = (screenPx - u_offset) / u_zoom;
  vec2 uv = docPx / u_docSize;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { frag = vec4(0.0); return; }
  vec4 c = texture(u_tex, uv);
  frag = vec4(c.a > 1e-4 ? c.rgb / c.a : c.rgb, c.a);
}
`;

const MASK_APPLY = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 frag;
uniform sampler2D u_tex;
uniform sampler2D u_mask;
void main() {
  vec4 c = texture(u_tex, v_uv);
  frag = vec4(c.rgb, c.a * texture(u_mask, v_uv).r);
}
`;

const SELECTION_OVERLAY = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 frag;
uniform sampler2D u_sel;
uniform vec2  u_viewport;
uniform vec2  u_docSize;
uniform vec2  u_offset;
uniform float u_zoom;
uniform vec2  u_texel;
void main() {
  vec2 screenPx = v_uv * u_viewport;
  vec2 uv = (screenPx - u_offset) / u_zoom / u_docSize;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { frag = vec4(0.0); return; }
  float m = texture(u_sel, uv).r;
  float e = abs(m - texture(u_sel, uv + vec2(u_texel.x, 0.0)).r)
          + abs(m - texture(u_sel, uv + vec2(0.0, u_texel.y)).r);
  if (e > 0.2) { frag = vec4(1.0, 1.0, 1.0, 1.0); return; }   // border
  if (m < 0.5) { frag = vec4(0.0, 0.0, 0.0, 0.28); return; }  // dim unselected
  frag = vec4(0.0);
}
`;

export function composite(doc: Document, view: View, frame?: FrameInput): void {
  const gl = ctx().gl;
  doc.accum.read.clear(0, 0, 0, 0);

  for (const layer of doc.layers) {
    if (!layer.visible || layer.opacity <= 0) continue;
    const processed = processLayer(doc, layer, frame);
    runPass({
      vert: QUAD_VERT,
      frag: BLEND_FRAG,
      inputs: { u_src: processed.texture, u_dst: doc.accum.read.texture },
      uniforms: { u_mode: layer.blendMode, u_opacity: layer.opacity },
      target: doc.accum.write
    });
    doc.accum.swap();
  }

  const vw = gl.drawingBufferWidth;
  const vh = gl.drawingBufferHeight;
  const scaledW = doc.width * view.zoom;
  const scaledH = doc.height * view.zoom;
  const offX = (vw - scaledW) / 2 + view.panX;
  const offY = (vh - scaledH) / 2 - view.panY;

  gl.clearColor(0, 0, 0, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, vw, vh);
  gl.clear(gl.COLOR_BUFFER_BIT);

  runPass({
    vert: QUAD_VERT,
    frag: PRESENT_FRAG,
    inputs: { u_tex: doc.accum.read.texture },
    uniforms: {
      u_viewport: [vw, vh],
      u_docSize: [doc.width, doc.height],
      u_offset: [offX, offY],
      u_zoom: view.zoom
    },
    target: null,
    screenSize: [vw, vh]
  });

  if (doc.selection.active) {
    runPass({
      vert: QUAD_VERT,
      frag: SELECTION_OVERLAY,
      inputs: { u_sel: doc.selection.texture },
      uniforms: {
        u_viewport: [vw, vh],
        u_docSize: [doc.width, doc.height],
        u_offset: [offX, offY],
        u_zoom: view.zoom,
        u_texel: [1 / doc.width, 1 / doc.height]
      },
      target: null,
      screenSize: [vw, vh],
      blend: true
    });
  }
}

function processLayer(doc: Document, layer: Layer, frame?: FrameInput): RenderTarget {
  const sc = doc.scratch;
  runPass({ vert: QUAD_VERT, frag: COPY, inputs: { u_tex: layer.texture }, target: sc.write });
  sc.swap();

  const texel: [number, number] = [1 / doc.width, 1 / doc.height];

  for (const adj of layer.adjustments) {
    if (!adj.enabled) continue;
    switch (adj.type) {
      case "brightnessContrast":
        pass(sc, ADJ_BRIGHTNESS_CONTRAST, {
          u_brightness: adj.params.brightness,
          u_contrast: adj.params.contrast
        });
        break;
      case "hsl":
        pass(sc, ADJ_HSL, { u_hue: adj.params.hue, u_sat: adj.params.sat, u_light: adj.params.light });
        break;
      case "invert":
        pass(sc, ADJ_INVERT, { u_amount: adj.params.amount });
        break;
      case "blur":
        pass(sc, ADJ_BLUR, { u_texel: texel, u_dir: [1, 0], u_radius: adj.params.radius });
        pass(sc, ADJ_BLUR, { u_texel: texel, u_dir: [0, 1], u_radius: adj.params.radius });
        break;
    }
  }

  if (layer.material) {
    const mat = getMaterial(layer.material.id);
    if (mat) {
      const lp = layer.material.params;
      pass(sc, mat.frag, {
        u_texel: texel,
        u_amount: lp.u_amount ?? 0.8,
        u_depth: lp.u_depth ?? 4,
        u_light: [Math.cos(layer.material.lightAngle), Math.sin(layer.material.lightAngle)]
      });
    }
  }

  if (layer.shaderFilter) {
    const sf = layer.shaderFilter;
    try {
      runPass({
        vert: QUAD_VERT,
        frag: buildShaderToy(sf.code),
        inputs: { iChannel0: sc.read.texture },
        uniforms: {
          iResolution: [doc.width, doc.height, 1],
          iTime: sf.time,
          iMouse: frame?.mouse ?? [0, 0, 0, 0],
          uMix: sf.mix
        },
        target: sc.write
      });
      sc.swap();
    } catch (e) {
      // A broken user shader shouldn't kill the whole composite.
      console.warn("Shader filter error:", (e as Error).message);
    }
  }

  if (layer.mask) {
    runPass({
      vert: QUAD_VERT,
      frag: MASK_APPLY,
      inputs: { u_tex: sc.read.texture, u_mask: layer.mask },
      target: sc.write
    });
    sc.swap();
  }

  return sc.read;
}

function pass(sc: Document["scratch"], frag: string, uniforms: Record<string, any>): void {
  runPass({ vert: QUAD_VERT, frag, inputs: { u_tex: sc.read.texture }, uniforms, target: sc.write });
  sc.swap();
}
