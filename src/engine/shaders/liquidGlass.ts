/**
 * Animated "liquid glass" effect. The layer is refracted through a flowing, time-varying
 * displacement field (two octaves of moving waves), softened with a small frosted blur,
 * tinted cool, and lit with moving caustic-like highlights. Driven by u_time so it ripples
 * continuously. Samples u_tex (the layer after adjustments/material).
 */
export const LIQUID_GLASS_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 frag;
uniform sampler2D u_tex;
uniform vec2  u_texel;
uniform float u_time;
uniform float u_strength;   // refraction amount
uniform float u_speed;      // flow speed
uniform float u_scale;      // ripple frequency
uniform float u_frost;      // frosted blur amount
uniform float u_tint;       // cool glass tint
uniform float u_highlight;  // caustic highlight strength

void main() {
  float t = u_time * u_speed;
  vec2 q = v_uv * u_scale;

  vec2 disp;
  disp.x = sin(q.y * 3.0 + t * 1.3) + 0.5 * sin(q.x * 2.0 - t);
  disp.y = cos(q.x * 3.0 - t * 1.1) + 0.5 * cos(q.y * 2.0 + t * 0.9);
  disp.x += 0.4 * sin((q.x + q.y) * 2.5 + t * 1.7);
  disp.y += 0.4 * cos((q.x - q.y) * 2.5 - t * 1.5);
  disp *= u_strength * 0.03;

  vec2 base = v_uv + disp;

  float fr = u_frost * 4.0;
  vec3 col = vec3(0.0);
  float wsum = 0.0;
  for (int i = -2; i <= 2; i++) {
    for (int j = -2; j <= 2; j++) {
      vec2 o = vec2(float(i), float(j)) * u_texel * fr;
      col += texture(u_tex, base + o).rgb;
      wsum += 1.0;
    }
  }
  col /= wsum;
  float alpha = texture(u_tex, base).a;

  float hl = pow(max(sin((q.x + q.y) * 1.5 + t * 2.0) * 0.5 + 0.5, 0.0), 6.0);
  float streak = pow(max(0.0, sin(q.x * 4.0 - t * 2.0 + disp.y * 8.0)), 12.0);
  float spec = (hl * 0.6 + streak * 0.8) * u_highlight;

  vec3 tinted = mix(col, col * vec3(0.88, 0.94, 1.06) + 0.02, u_tint);

  frag = vec4(clamp(tinted + spec, 0.0, 1.0), alpha);
}
`;
