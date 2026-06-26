/**
 * GPU texture + render-target wrappers, and the ping-pong RenderTarget pair used to
 * chain passes (read A, write B, swap).
 */
import { ctx } from "./gl";

export class GLTexture {
  readonly tex: WebGLTexture;
  width: number;
  height: number;

  constructor(width: number, height: number, data?: TexImageSource | null) {
    const gl = ctx().gl;
    this.width = width;
    this.height = height;
    this.tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (data) {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, data);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  /** Upload pixel source into an existing texture, resizing if needed. */
  upload(data: TexImageSource, width: number, height: number): void {
    const gl = ctx().gl;
    this.width = width;
    this.height = height;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  dispose(): void {
    ctx().gl.deleteTexture(this.tex);
  }
}

/** A texture you can render into (color attachment + framebuffer). */
export class RenderTarget {
  readonly fbo: WebGLFramebuffer;
  readonly texture: GLTexture;
  width: number;
  height: number;

  constructor(width: number, height: number, float = false) {
    const c = ctx();
    const gl = c.gl;
    this.width = width;
    this.height = height;
    this.texture = new GLTexture(width, height);

    // (Re)allocate storage at requested precision.
    gl.bindTexture(gl.TEXTURE_2D, this.texture.tex);
    if (float && c.floatTargets) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.HALF_FLOAT, null);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }

    this.fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texture.tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  bind(): void {
    const gl = ctx().gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.width, this.height);
  }

  clear(r = 0, g = 0, b = 0, a = 0): void {
    const gl = ctx().gl;
    this.bind();
    gl.clearColor(r, g, b, a);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  dispose(): void {
    ctx().gl.deleteFramebuffer(this.fbo);
    this.texture.dispose();
  }
}

/** Two equally sized targets you alternate between across a chain of passes. */
export class PingPong {
  a: RenderTarget;
  b: RenderTarget;

  constructor(width: number, height: number, float = false) {
    this.a = new RenderTarget(width, height, float);
    this.b = new RenderTarget(width, height, float);
  }

  /** Result of the previous pass (read this as input). */
  get read(): RenderTarget {
    return this.a;
  }
  /** Target for the next pass (render into this). */
  get write(): RenderTarget {
    return this.b;
  }
  swap(): void {
    const t = this.a;
    this.a = this.b;
    this.b = t;
  }

  dispose(): void {
    this.a.dispose();
    this.b.dispose();
  }
}
