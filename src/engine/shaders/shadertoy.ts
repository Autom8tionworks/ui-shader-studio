/**
 * ShaderToy-style filter support. The user writes a `mainImage(out vec4, in vec2)` body
 * (ShaderToy convention) and we wrap it into a valid GLSL ES 3.00 fragment shader with the
 * familiar uniforms: iResolution, iTime, iMouse, and iChannel0 (= the active layer).
 */
export function buildShaderToy(userCode: string): string {
  return `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 frag;

uniform sampler2D iChannel0;   // the active layer
uniform vec3  iResolution;     // viewport resolution (pixels)
uniform float iTime;           // seconds
uniform vec4  iMouse;          // xy = current, zw = click
uniform float uMix;            // 0..1 blend with original

${userCode}

void main() {
  vec2 fragCoord = v_uv * iResolution.xy;
  vec4 col = vec4(0.0);
  mainImage(col, fragCoord);
  vec4 orig = texture(iChannel0, v_uv);
  frag = mix(orig, col, uMix);
}
`;
}

export interface ShaderPreset {
  name: string;
  code: string;
  builtin?: boolean;
}

/** Starter shaders so the editor is useful immediately. iChannel0 = the layer image. */
export const STARTER_SHADERS: ShaderPreset[] = [
  {
    name: "Passthrough",
    builtin: true,
    code: `// Edit me. iChannel0 is the current layer.
void mainImage(out vec4 o, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  o = texture(iChannel0, uv);
}`
  },
  {
    name: "Ripple",
    builtin: true,
    code: `// Animated ripple distortion of the layer.
void mainImage(out vec4 o, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  vec2 c = uv - 0.5;
  float d = length(c);
  float wave = sin(d * 40.0 - iTime * 3.0) * 0.015;
  uv += normalize(c) * wave;
  o = texture(iChannel0, uv);
}`
  },
  {
    name: "Plasma",
    builtin: true,
    code: `// Classic plasma blended with the layer.
void mainImage(out vec4 o, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  float t = iTime;
  float v = sin(uv.x * 10.0 + t)
          + sin(uv.y * 10.0 + t)
          + sin((uv.x + uv.y) * 10.0 + t)
          + sin(length(uv - 0.5) * 20.0 - t);
  vec3 col = 0.5 + 0.5 * cos(vec3(0.0, 2.0, 4.0) + v);
  o = mix(texture(iChannel0, uv), vec4(col, 1.0), 0.6);
}`
  },
  {
    name: "CRT scanlines",
    builtin: true,
    code: `// Retro CRT: scanlines + slight chromatic offset.
void mainImage(out vec4 o, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  float off = 0.003;
  float r = texture(iChannel0, uv + vec2(off, 0.0)).r;
  float g = texture(iChannel0, uv).g;
  float b = texture(iChannel0, uv - vec2(off, 0.0)).b;
  float scan = 0.85 + 0.15 * sin(uv.y * iResolution.y * 1.5 + iTime * 2.0);
  o = vec4(vec3(r, g, b) * scan, 1.0);
}`
  },
  {
    name: "Chromatic warp",
    builtin: true,
    code: `// Mouse-reactive chromatic aberration. Drag on the canvas.
void mainImage(out vec4 o, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  vec2 m = iMouse.xy / iResolution.xy;
  vec2 dir = (uv - m);
  float amt = 0.02 * length(dir);
  float r = texture(iChannel0, uv + dir * amt).r;
  float g = texture(iChannel0, uv).g;
  float b = texture(iChannel0, uv - dir * amt).b;
  o = vec4(r, g, b, 1.0);
}`
  }
];
