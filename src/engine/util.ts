/** Small shared GPU helpers. */
import { ctx } from "./gl";
import { GLTexture } from "./texture";

let _white: GLTexture | null = null;

/** A 1x1 fully-white texture, used as the "no selection" fallback sampler. */
export function whiteTexture(): GLTexture {
  if (_white) return _white;
  const gl = ctx().gl;
  const t = new GLTexture(1, 1);
  gl.bindTexture(gl.TEXTURE_2D, t.tex);
  gl.texImage2D(
    gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
    new Uint8Array([255, 255, 255, 255])
  );
  gl.bindTexture(gl.TEXTURE_2D, null);
  _white = t;
  return t;
}
