/**
 * One fragment shader implementing 12 Photoshop blend modes, selected by u_mode.
 * Works in premultiplied alpha and composites the (adjusted) source layer over the
 * accumulated backdrop. Output is premultiplied.
 */
export const BLEND_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 frag;

uniform sampler2D u_src;   // the layer being blended (straight alpha)
uniform sampler2D u_dst;   // the backdrop accumulator (premultiplied)
uniform int   u_mode;      // blend mode index (see blendModes.ts)
uniform float u_opacity;   // 0..1 layer opacity

vec3 blendRGB(int mode, vec3 b, vec3 s) {
  if (mode == 0)  return s;                                   // Normal
  if (mode == 1)  return b * s;                               // Multiply
  if (mode == 2)  return 1.0 - (1.0 - b) * (1.0 - s);         // Screen
  if (mode == 3)  return mix(2.0*b*s, 1.0-2.0*(1.0-b)*(1.0-s), step(0.5, b)); // Overlay
  if (mode == 4)  return min(b, s);                           // Darken
  if (mode == 5)  return max(b, s);                           // Lighten
  if (mode == 6)  return b / max(1.0 - s, 1e-4);              // Color Dodge
  if (mode == 7)  return 1.0 - (1.0 - b) / max(s, 1e-4);      // Color Burn
  if (mode == 8)  return mix(2.0*b*s, 1.0-2.0*(1.0-b)*(1.0-s), step(0.5, s)); // Hard Light
  if (mode == 9) {                                            // Soft Light
    vec3 d = mix(((16.0*b-12.0)*b+4.0)*b, sqrt(b), step(0.25, b));
    return mix(b - (1.0-2.0*s)*b*(1.0-b), b + (2.0*s-1.0)*(d-b), step(0.5, s));
  }
  if (mode == 10) return abs(b - s);                          // Difference
  if (mode == 11) return b + s - 2.0*b*s;                     // Exclusion
  return s;
}

void main() {
  vec4 dpm = texture(u_dst, v_uv);                 // premultiplied backdrop
  vec4 s   = texture(u_src, v_uv);                 // straight-alpha source
  s.a *= u_opacity;

  vec3 db = dpm.a > 1e-4 ? dpm.rgb / dpm.a : vec3(0.0); // un-premultiply backdrop
  vec3 blended = blendRGB(u_mode, db, s.rgb);

  // Standard "over" with the blended color as the source color.
  vec3 outRGB = s.a * blended + dpm.rgb * (1.0 - s.a);
  float outA  = s.a + dpm.a * (1.0 - s.a);
  frag = vec4(outRGB, outA);
}
`;
