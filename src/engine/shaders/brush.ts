/**
 * Brush stamping. We render the existing layer plus a set of soft-round stamps along the
 * current stroke segment into a fresh target, then copy it back into the layer texture.
 * Up to 64 stamp positions per dispatch keep strokes smooth without a draw per dab.
 * Coverage is multiplied by an optional selection mask so painting respects selections.
 */
import { GLSL_COMMON } from "./quad.vert";

export const MAX_STAMPS = 64;

export const BRUSH_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 frag;

uniform sampler2D u_layer;     // current layer (straight alpha)
uniform sampler2D u_sel;       // selection mask (r); 1x1 white when no selection
uniform vec2  u_stamps[${MAX_STAMPS}]; // stamp centers in uv space
uniform int   u_count;         // active stamps this dispatch
uniform float u_radius;        // brush radius in uv (relative to height)
uniform float u_aspect;        // width/height to keep stamps round
uniform float u_hardness;      // 0..1
uniform float u_flow;          // 0..1 per-stamp opacity
uniform vec3  u_color;
uniform float u_erase;         // 1.0 = erase, 0.0 = paint
uniform float u_useSel;        // 1.0 = clip to selection
${GLSL_COMMON}

void main() {
  vec4 base = texture(u_layer, v_uv);
  float cover = 0.0;
  for (int i = 0; i < ${MAX_STAMPS}; i++) {
    if (i >= u_count) break;
    vec2 d = v_uv - u_stamps[i];
    d.x *= u_aspect;                       // correct for non-square canvas
    float dist = length(d) / max(u_radius, 1e-4);
    float a = 1.0 - smoothstep(u_hardness, 1.0, dist);
    cover = max(cover, a * u_flow);        // max = no double-darkening within one stroke
  }

  if (u_useSel > 0.5) cover *= texture(u_sel, v_uv).r;

  if (u_erase > 0.5) {
    float na = base.a * (1.0 - cover);
    frag = vec4(base.rgb, na);
  } else {
    float na = base.a + cover * (1.0 - base.a);
    vec3 rgb = na > 1e-4 ? mix(base.rgb * base.a, u_color, cover) / na : u_color;
    frag = vec4(rgb, na);
  }
}
`;
