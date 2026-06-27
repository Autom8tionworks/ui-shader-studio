/**
 * A Layer owns a source texture and a non-destructive adjustment stack plus an optional
 * material and an optional ShaderToy-style filter. It may also carry a mask texture whose
 * red channel multiplies the layer's alpha at composite time. Brush strokes write into
 * `texture` (or `mask` when editing the mask); adjustments/material/filter re-apply every
 * composite and never mutate the source.
 */
import { GLTexture, RenderTarget } from "../engine/texture";
import { ctx } from "../engine/gl";
import { BlendMode } from "./blendModes";

export type AdjustmentType = "brightnessContrast" | "hsl" | "invert" | "blur";

export interface Adjustment {
  type: AdjustmentType;
  enabled: boolean;
  params: Record<string, number>;
}

export interface MaterialState {
  id: string;
  params: Record<string, number>;
  lightAngle: number; // radians
}

export interface ShaderFilterState {
  name: string;
  code: string;
  time: number;
  animated: boolean;
  mix: number; // 0..1 blend with original
}

export interface LiquidGlassState {
  strength: number;
  speed: number;
  scale: number;
  frost: number;
  tint: number;
  highlight: number;
  time: number;
}

export function defaultLiquidGlass(): LiquidGlassState {
  return { strength: 0.5, speed: 1, scale: 6, frost: 0.3, tint: 0.4, highlight: 0.5, time: 0 };
}

export interface LiveSource {
  kind: "camera" | "video";
  video: HTMLVideoElement;
  canvas: HTMLCanvasElement;
  stream?: MediaStream;
  url?: string;
}

let _id = 0;

export class Layer {
  readonly id: number;
  name: string;
  texture: GLTexture;
  width: number;
  height: number;
  visible = true;
  opacity = 1;
  blendMode: BlendMode = BlendMode.Normal;
  adjustments: Adjustment[] = [];
  material: MaterialState | null = null;
  shaderFilter: ShaderFilterState | null = null;
  liquidGlass: LiquidGlassState | null = null;
  liveSource: LiveSource | null = null;
  mask: GLTexture | null = null;
  editingMask = false;

  constructor(name: string, width: number, height: number, source?: TexImageSource) {
    this.id = ++_id;
    this.name = name;
    this.width = width;
    this.height = height;
    this.texture = new GLTexture(width, height, source ?? null);
  }

  /** Replace this layer's color pixels from a render target (after a brush stroke). */
  adoptFrom(rt: RenderTarget): void {
    this.copyInto(this.texture, rt);
  }

  /** Copy a render target into an arbitrary owned texture (color or mask). */
  copyInto(target: GLTexture, rt: RenderTarget): void {
    const gl = ctx().gl;
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, rt.fbo);
    gl.bindTexture(gl.TEXTURE_2D, target.tex);
    gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 0, 0, rt.width, rt.height, 0);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  addMask(): void {
    if (this.mask) return;
    // A white (fully visible) mask.
    const cv = document.createElement("canvas");
    cv.width = this.width;
    cv.height = this.height;
    const g = cv.getContext("2d")!;
    g.fillStyle = "#fff";
    g.fillRect(0, 0, this.width, this.height);
    this.mask = new GLTexture(this.width, this.height, cv);
    this.editingMask = true;
  }

  removeMask(): void {
    if (this.mask) {
      this.mask.dispose();
      this.mask = null;
    }
    this.editingMask = false;
  }

  /** The texture a paint tool should write to right now. */
  paintTarget(): GLTexture {
    return this.editingMask && this.mask ? this.mask : this.texture;
  }

  /** Pull the current frame from a webcam/video source into the layer texture (contain-fit). */
  updateLiveTexture(): void {
    const ls = this.liveSource;
    if (!ls) return;
    const v = ls.video;
    if (v.readyState < 2 || v.videoWidth === 0) return;
    const g = ls.canvas.getContext("2d")!;
    g.clearRect(0, 0, this.width, this.height);
    const scale = Math.min(this.width / v.videoWidth, this.height / v.videoHeight);
    const w = v.videoWidth * scale;
    const h = v.videoHeight * scale;
    g.drawImage(v, (this.width - w) / 2, (this.height - h) / 2, w, h);
    this.texture.upload(ls.canvas, this.width, this.height);
  }

  addAdjustment(type: AdjustmentType): Adjustment {
    const adj: Adjustment = { type, enabled: true, params: defaultAdjustmentParams(type) };
    this.adjustments.push(adj);
    return adj;
  }

  removeAdjustment(adj: Adjustment): void {
    this.adjustments = this.adjustments.filter((a) => a !== adj);
  }

  dispose(): void {
    this.texture.dispose();
    if (this.mask) this.mask.dispose();
    if (this.liveSource) {
      this.liveSource.stream?.getTracks().forEach((t) => t.stop());
      this.liveSource.video.pause();
      if (this.liveSource.url) URL.revokeObjectURL(this.liveSource.url);
    }
  }
}

export function defaultAdjustmentParams(type: AdjustmentType): Record<string, number> {
  switch (type) {
    case "brightnessContrast":
      return { brightness: 0, contrast: 1 };
    case "hsl":
      return { hue: 0, sat: 1, light: 0 };
    case "invert":
      return { amount: 1 };
    case "blur":
      return { radius: 4 };
  }
}

export const ADJUSTMENT_LABELS: Record<AdjustmentType, string> = {
  brightnessContrast: "Brightness / Contrast",
  hsl: "Hue / Saturation",
  invert: "Invert",
  blur: "Gaussian Blur"
};
