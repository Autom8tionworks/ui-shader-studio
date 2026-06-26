/**
 * The heart of the imaging pipeline: runPass() binds a program, wires input textures to
 * samplers, sets uniforms, and draws the fullscreen quad into a target (or the screen).
 * Every blend, adjustment, brush stamp and material shader goes through here.
 */
import { ctx, drawQuad, program, uniformType } from "./gl";
import { GLTexture, RenderTarget } from "./texture";
import type { Uniforms, UniformValue } from "../types";

export interface PassOptions {
  vert: string;
  frag: string;
  /** Textures bound to sampler uniforms by name, in order of texture unit. */
  inputs?: Record<string, GLTexture>;
  uniforms?: Uniforms;
  /** Target to render into; omit to render to the default framebuffer (screen). */
  target?: RenderTarget | null;
  /** Render to screen at this viewport size (used when target is null). */
  screenSize?: [number, number];
  /** Enable alpha blending of this pass over the target's existing contents. */
  blend?: boolean;
}

export function runPass(opts: PassOptions): void {
  const gl = ctx().gl;
  const prog = program(opts.vert, opts.frag);
  gl.useProgram(prog);

  if (opts.target) {
    opts.target.bind();
  } else {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const [w, h] = opts.screenSize ?? [gl.drawingBufferWidth, gl.drawingBufferHeight];
    gl.viewport(0, 0, w, h);
  }

  if (opts.blend) {
    gl.enable(gl.BLEND);
    // Premultiplied-alpha over compositing.
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  } else {
    gl.disable(gl.BLEND);
  }

  // Bind input textures to sequential units and set the matching sampler uniforms.
  let unit = 0;
  if (opts.inputs) {
    for (const [name, tex] of Object.entries(opts.inputs)) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex.tex);
      const loc = gl.getUniformLocation(prog, name);
      if (loc) gl.uniform1i(loc, unit);
      unit++;
    }
  }

  if (opts.uniforms) setUniforms(prog, opts.uniforms);

  drawQuad();
  gl.disable(gl.BLEND);
}

function setUniforms(prog: WebGLProgram, uniforms: Uniforms): void {
  const gl = ctx().gl;
  for (const [name, value] of Object.entries(uniforms)) {
    const loc = gl.getUniformLocation(prog, name);
    if (!loc) continue;
    applyUniform(gl, loc, value, uniformType(prog, name));
  }
}

// GL enums for the scalar uniform types we need to distinguish (int/bool vs float).
const INT_TYPES = new Set<number>([
  0x1404, // INT
  0x8b56, // BOOL
  0x8b5e, // SAMPLER_2D
  0x8b60 // SAMPLER_CUBE
]);

function applyUniform(
  gl: WebGL2RenderingContext,
  loc: WebGLUniformLocation,
  value: UniformValue,
  type: number | undefined
): void {
  if (typeof value === "number") {
    // int/bool uniforms MUST use uniform1i — uniform1f silently fails on them.
    if (type !== undefined && INT_TYPES.has(type)) gl.uniform1i(loc, Math.round(value));
    else gl.uniform1f(loc, value);
  } else if (typeof value === "boolean") {
    gl.uniform1i(loc, value ? 1 : 0);
  } else if (value instanceof Float32Array) {
    if (value.length === 9) gl.uniformMatrix3fv(loc, false, value);
    else if (value.length === 16) gl.uniformMatrix4fv(loc, false, value);
    else if (value.length === 2) gl.uniform2fv(loc, value);
    else if (value.length === 3) gl.uniform3fv(loc, value);
    else if (value.length === 4) gl.uniform4fv(loc, value);
    // Larger even-length arrays are treated as a vec2[] (e.g. brush stamp centers).
    else if (value.length % 2 === 0) gl.uniform2fv(loc, value);
  } else if (Array.isArray(value)) {
    if (value.length === 2) gl.uniform2f(loc, value[0], value[1]);
    else if (value.length === 3) gl.uniform3f(loc, value[0], value[1], value[2]);
    else if (value.length === 4) gl.uniform4f(loc, value[0], value[1], value[2], value[3]);
  }
}
