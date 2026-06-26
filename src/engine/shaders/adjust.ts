/**
 * Non-destructive adjustment shaders. Each samples one input texture (straight alpha)
 * and writes the adjusted result. They are chained one after another by the compositor.
 */
import { GLSL_COMMON } from "./quad.vert";

const HEADER = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 frag;
uniform sampler2D u_tex;
${GLSL_COMMON}
`;

/** Brightness (-1..1 added) + contrast (0..2 around 0.5). */
export const ADJ_BRIGHTNESS_CONTRAST = HEADER + /* glsl */ `
uniform float u_brightness;
uniform float u_contrast;
void main() {
  vec4 c = texture(u_tex, v_uv);
  vec3 rgb = c.rgb + u_brightness;
  rgb = (rgb - 0.5) * u_contrast + 0.5;
  frag = vec4(clamp(rgb, 0.0, 1.0), c.a);
}
`;

/** Hue shift (-0.5..0.5), saturation (0..2), lightness (-1..1). */
export const ADJ_HSL = HEADER + /* glsl */ `
uniform float u_hue;
uniform float u_sat;
uniform float u_light;
void main() {
  vec4 c = texture(u_tex, v_uv);
  vec3 hsl = rgb2hsl(c.rgb);
  hsl.x = fract(hsl.x + u_hue);
  hsl.y = clamp(hsl.y * u_sat, 0.0, 1.0);
  hsl.z = clamp(hsl.z + u_light, 0.0, 1.0);
  frag = vec4(hsl2rgb(hsl), c.a);
}
`;

/** Invert (amount 0..1 mixes toward inverted). */
export const ADJ_INVERT = HEADER + /* glsl */ `
uniform float u_amount;
void main() {
  vec4 c = texture(u_tex, v_uv);
  frag = vec4(mix(c.rgb, 1.0 - c.rgb, u_amount), c.a);
}
`;

/**
 * Separable Gaussian blur. Run twice: once with u_dir = (1,0) then (0,1).
 * u_radius is in pixels; u_texel is 1/textureSize.
 */
export const ADJ_BLUR = HEADER + /* glsl */ `
uniform vec2  u_texel;
uniform vec2  u_dir;
uniform float u_radius;
void main() {
  float r = u_radius;
  if (r < 0.5) { frag = texture(u_tex, v_uv); return; }
  float sigma = max(r * 0.5, 1.0);
  vec4 sum = vec4(0.0);
  float wsum = 0.0;
  for (int i = -32; i <= 32; i++) {
    float fi = float(i);
    if (abs(fi) > r) continue;
    float w = exp(-(fi*fi) / (2.0*sigma*sigma));
    sum  += texture(u_tex, v_uv + u_dir * u_texel * fi) * w;
    wsum += w;
  }
  frag = sum / max(wsum, 1e-4);
}
`;

/** Identity copy (used to move data between targets). */
export const COPY = HEADER + /* glsl */ `
void main() { frag = texture(u_tex, v_uv); }
`;
