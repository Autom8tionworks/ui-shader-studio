/**
 * Solid fill and linear gradient passes. Both read the current layer (straight alpha) plus
 * a coverage mask (selection mask, bucket region, or 1x1 white = whole layer) and paint
 * into it. Output is straight alpha.
 */
export const FILL_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 frag;
uniform sampler2D u_layer;
uniform sampler2D u_mask;   // coverage (r channel)
uniform vec4  u_color;      // straight rgba
uniform float u_opacity;
void main() {
  vec4 base = texture(u_layer, v_uv);
  float cover = texture(u_mask, v_uv).r * u_color.a * u_opacity;
  vec3 rgb = base.a > 1e-4
    ? mix(base.rgb * base.a, u_color.rgb, cover) / max(base.a + cover * (1.0 - base.a), 1e-4)
    : u_color.rgb;
  float a = base.a + cover * (1.0 - base.a);
  frag = vec4(rgb, a);
}
`;

export const GRADIENT_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 frag;
uniform sampler2D u_layer;
uniform sampler2D u_mask;
uniform vec2  u_p0;     // start point (uv)
uniform vec2  u_p1;     // end point (uv)
uniform vec4  u_c0;     // start color (straight rgba)
uniform vec4  u_c1;     // end color
uniform float u_opacity;
uniform float u_aspect; // width/height
void main() {
  vec4 base = texture(u_layer, v_uv);
  vec2 d = u_p1 - u_p0;
  d.x *= u_aspect;
  vec2 p = v_uv - u_p0;
  p.x *= u_aspect;
  float t = clamp(dot(p, d) / max(dot(d, d), 1e-6), 0.0, 1.0);
  vec4 g = mix(u_c0, u_c1, t);
  float cover = texture(u_mask, v_uv).r * g.a * u_opacity;
  vec3 rgb = base.a > 1e-4
    ? mix(base.rgb * base.a, g.rgb, cover) / max(base.a + cover * (1.0 - base.a), 1e-4)
    : g.rgb;
  float a = base.a + cover * (1.0 - base.a);
  frag = vec4(rgb, a);
}
`;
