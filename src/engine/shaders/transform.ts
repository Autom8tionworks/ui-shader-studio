/**
 * Affine resample. Samples the source with an inverse translate/rotate/scale about the
 * document center. Pixels mapped outside [0,1] become transparent. Used by the transform
 * tool to move / rotate / scale a layer (committed destructively on pointer up).
 */
export const TRANSFORM_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 frag;
uniform sampler2D u_tex;
uniform vec2  u_translate;  // in uv
uniform float u_rotate;     // radians
uniform float u_scale;
uniform float u_aspect;     // width/height, to keep rotation circular
void main() {
  vec2 p = v_uv - 0.5 - u_translate;
  // Work in aspect-corrected space so rotation isn't sheared.
  p.x *= u_aspect;
  float c = cos(-u_rotate), s = sin(-u_rotate);
  p = mat2(c, -s, s, c) * p;
  p /= max(u_scale, 1e-3);
  p.x /= u_aspect;
  vec2 uv = p + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { frag = vec4(0.0); return; }
  frag = texture(u_tex, uv);
}
`;
