/** Cuts a layer down to the pixels inside a selection mask (straight alpha in/out). */
export const CUTOUT_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 frag;
uniform sampler2D u_layer;
uniform sampler2D u_mask;
void main() {
  vec4 c = texture(u_layer, v_uv);
  float m = texture(u_mask, v_uv).r;
  frag = vec4(c.rgb, c.a * m);
}
`;

/** Erases the pixels inside a selection mask from a layer (for "cut" semantics). */
export const ERASE_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 frag;
uniform sampler2D u_layer;
uniform sampler2D u_mask;
void main() {
  vec4 c = texture(u_layer, v_uv);
  float m = texture(u_mask, v_uv).r;
  frag = vec4(c.rgb, c.a * (1.0 - m));
}
`;
