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
import { LIQUID_GLASS_FRAG } from "../engine/shaders/liquidGlass";
import { Document } from "./document";
import { Layer } from "./layer";

export interface View {
  zoom: number;
  panX: number;
  panY: number;
}

export interface FrameInput {
  mouse: [number, number, number, number];
  crop?: { x: number; y: number; w: number; h: number } | null;
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

const CROP_OVERLAY = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 frag;
uniform vec2  u_viewport;
uniform vec2  u_docSize;
uniform vec2  u_offset;
uniform float u_zoom;
uniform vec4  u_rect; // x0,y0,x1,y1 in document px (y-up)
void main() {
  vec2 screenPx = v_uv * u_viewport;
  vec2 d = (screenPx - u_offset) / u_zoom;
  bool inDoc = d.x >= 0.0 && d.x <= u_docSize.x && d.y >= 0.0 && d.y <= u_docSize.y;
  if (!inDoc) { frag = vec4(0.0); return; }
  float x0 = u_rect.x, y0 = u_rect.y, x1 = u_rect.z, y1 = u_rect.w;
  bool inside = d.x >= x0 && d.x <= x1 && d.y >= y0 && d.y <= y1;

  float t = 1.5;
  float padX = 2.0 / u_zoom, padY = 2.0 / u_zoom;
  bool withinX = d.x >= x0 - padX && d.x <= x1 + padX;
  bool withinY = d.y >= y0 - padY && d.y <= y1 + padY;
  bool nearL = abs((d.x - x0) * u_zoom) < t, nearR = abs((d.x - x1) * u_zoom) < t;
  bool nearT = abs((d.y - y1) * u_zoom) < t, nearB = abs((d.y - y0) * u_zoom) < t;
  bool border = ((nearL || nearR) && withinY) || ((nearT || nearB) && withinX);

  float hs = 5.0;
  vec2 cs[8];
  cs[0] = vec2(x0, y0); cs[1] = vec2(x1, y0); cs[2] = vec2(x0, y1); cs[3] = vec2(x1, y1);
  cs[4] = vec2((x0 + x1) * 0.5, y0); cs[5] = vec2((x0 + x1) * 0.5, y1);
  cs[6] = vec2(x0, (y0 + y1) * 0.5); cs[7] = vec2(x1, (y0 + y1) * 0.5);
  bool handle = false;
  for (int i = 0; i < 8; i++) {
    vec2 dd = (d - cs[i]) * u_zoom;
    if (abs(dd.x) < hs && abs(dd.y) < hs) handle = true;
  }

  bool thirds = false;
  if (inside) {
    float va = x0 + (x1 - x0) / 3.0, vb = x0 + 2.0 * (x1 - x0) / 3.0;
    float ha = y0 + (y1 - y0) / 3.0, hb = y0 + 2.0 * (y1 - y0) / 3.0;
    if (abs((d.x - va) * u_zoom) < 0.8 || abs((d.x - vb) * u_zoom) < 0.8 ||
        abs((d.y - ha) * u_zoom) < 0.8 || abs((d.y - hb) * u_zoom) < 0.8) thirds = true;
  }

  if (handle) { frag = vec4(1.0, 1.0, 1.0, 1.0); return; }
  if (border) { frag = vec4(1.0, 1.0, 1.0, 1.0); return; }
  if (thirds) { frag = vec4(0.3, 0.3, 0.3, 0.3); return; } // premultiplied
  if (!inside) { frag = vec4(0.0, 0.0, 0.0, 0.55); return; }
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

  if (frame?.crop) {
    const cr = frame.crop;
    runPass({
      vert: QUAD_VERT,
      frag: CROP_OVERLAY,
      uniforms: {
        u_viewport: [vw, vh],
        u_docSize: [doc.width, doc.height],
        u_offset: [offX, offY],
        u_zoom: view.zoom,
        u_rect: [cr.x, cr.y, cr.x + cr.w, cr.y + cr.h]
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

  if (layer.liquidGlass) {
    const lg = layer.liquidGlass;
    pass(sc, LIQUID_GLASS_FRAG, {
      u_texel: texel,
      u_time: lg.time,
      u_strength: lg.strength,
      u_speed: lg.speed,
      u_scale: lg.scale,
      u_frost: lg.frost,
      u_tint: lg.tint,
      u_highlight: lg.highlight
    });
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
