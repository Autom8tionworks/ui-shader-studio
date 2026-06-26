/**
 * Real-time MATERIAL shaders. These reinterpret a layer as a lit surface: a height field
 * is derived from luminance, a normal from its gradient, and then per-material lighting
 * (refraction, specular, fresnel) is applied. This is what produces "glass / plastic /
 * metal" looks live. New materials = one more entry in MATERIALS with its own GLSL body.
 */
import { GLSL_COMMON } from "./quad.vert";
import type { ParamSpec } from "../../types";

const HEADER = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 frag;
uniform sampler2D u_tex;
uniform vec2  u_texel;     // 1 / textureSize
uniform float u_amount;    // 0..1 effect strength
uniform float u_depth;     // height field scale
uniform vec2  u_light;     // light direction (xy)
${GLSL_COMMON}

// Surface normal from the luminance gradient (Sobel-ish).
vec3 surfaceNormal(vec2 uv, float scale) {
  float l  = luma(texture(u_tex, uv + vec2(-u_texel.x, 0.0)).rgb);
  float r  = luma(texture(u_tex, uv + vec2( u_texel.x, 0.0)).rgb);
  float d  = luma(texture(u_tex, uv + vec2(0.0, -u_texel.y)).rgb);
  float u  = luma(texture(u_tex, uv + vec2(0.0,  u_texel.y)).rgb);
  vec3 n = normalize(vec3((l - r) * scale, (d - u) * scale, 1.0));
  return n;
}
`;

/** Each material is HEADER + this body, which must write `frag`. */
function build(body: string): string {
  return HEADER + `\nvoid main() {\n${body}\n}\n`;
}

export interface Material {
  id: string;
  label: string;
  frag: string;
  params: ParamSpec[];
}

const COMMON_PARAMS: ParamSpec[] = [
  { key: "u_amount", label: "Strength", min: 0, max: 1, step: 0.01, default: 0.8 },
  { key: "u_depth", label: "Depth", min: 0.5, max: 12, step: 0.1, default: 4 }
];

export const MATERIALS: Material[] = [
  {
    id: "glass",
    label: "Glass",
    params: COMMON_PARAMS,
    frag: build(/* glsl */ `
  vec3 n = surfaceNormal(v_uv, u_depth);
  // Refract the lookup so light bends through the "glass".
  vec2 refr = n.xy * u_amount * 0.06;
  vec4 col = texture(u_tex, v_uv + refr);
  vec3 L = normalize(vec3(u_light, 0.8));
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 H = normalize(L + V);
  float spec = pow(max(dot(n, H), 0.0), 64.0);
  float fres = pow(1.0 - max(n.z, 0.0), 3.0);
  vec3 rgb = col.rgb + spec * 0.9 + fres * 0.25 * u_amount;
  frag = vec4(clamp(rgb, 0.0, 1.0), col.a);`)
  },
  {
    id: "plastic",
    label: "Plastic",
    params: COMMON_PARAMS,
    frag: build(/* glsl */ `
  vec3 n = surfaceNormal(v_uv, u_depth);
  vec4 col = texture(u_tex, v_uv);
  vec3 L = normalize(vec3(u_light, 0.9));
  float diff = max(dot(n, L), 0.0);
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(dot(n, H), 0.0), 24.0);
  vec3 rgb = col.rgb * (0.6 + 0.5 * diff) + spec * 0.6 * u_amount;
  frag = vec4(clamp(mix(col.rgb, rgb, u_amount), 0.0, 1.0), col.a);`)
  },
  {
    id: "metal",
    label: "Metal",
    params: COMMON_PARAMS,
    frag: build(/* glsl */ `
  vec3 n = surfaceNormal(v_uv, u_depth);
  vec4 col = texture(u_tex, v_uv);
  vec3 L = normalize(vec3(u_light, 0.7));
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 R = reflect(-L, n);
  float spec = pow(max(dot(R, V), 0.0), 48.0);
  float aniso = pow(max(dot(n, L), 0.0), 2.0);
  // Tint toward a brushed-metal gray, keep luminance, add sharp highlights.
  vec3 metalBase = mix(col.rgb, vec3(luma(col.rgb)) * vec3(0.85, 0.87, 0.95), 0.6);
  vec3 rgb = metalBase * (0.4 + 0.7 * aniso) + spec;
  frag = vec4(clamp(mix(col.rgb, rgb, u_amount), 0.0, 1.0), col.a);`)
  },
  {
    id: "matte",
    label: "Matte",
    params: COMMON_PARAMS,
    frag: build(/* glsl */ `
  vec3 n = surfaceNormal(v_uv, u_depth);
  vec4 col = texture(u_tex, v_uv);
  vec3 L = normalize(vec3(u_light, 1.0));
  float diff = max(dot(n, L), 0.0);
  // Soft, non-specular shading (Oren-Nayar-ish flattening).
  vec3 rgb = col.rgb * (0.7 + 0.4 * diff);
  frag = vec4(clamp(mix(col.rgb, rgb, u_amount), 0.0, 1.0), col.a);`)
  },
  {
    id: "emboss",
    label: "Emboss",
    params: COMMON_PARAMS,
    frag: build(/* glsl */ `
  vec3 n = surfaceNormal(v_uv, u_depth * 2.0);
  vec4 col = texture(u_tex, v_uv);
  vec3 L = normalize(vec3(u_light, 0.5));
  float e = 0.5 + dot(n, L) * 0.8;
  vec3 rgb = vec3(e);
  frag = vec4(mix(col.rgb, rgb, u_amount), col.a);`)
  }
];

export function getMaterial(id: string): Material | undefined {
  return MATERIALS.find((m) => m.id === id);
}
