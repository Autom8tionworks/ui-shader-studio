/**
 * A Layer owns a source texture and a non-destructive adjustment stack plus an optional
 * material. Brush strokes write into `texture`; adjustments/material are re-applied every
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

  constructor(name: string, width: number, height: number, source?: TexImageSource) {
    this.id = ++_id;
    this.name = name;
    this.width = width;
    this.height = height;
    this.texture = new GLTexture(width, height, source ?? null);
  }

  /** Replace the layer pixels from a render target (used after a brush stroke). */
  adoptFrom(rt: RenderTarget): void {
    const gl = ctx().gl;
    // Copy rt's color attachment into this.texture via framebuffer blit-by-copy.
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, rt.fbo);
    gl.bindTexture(gl.TEXTURE_2D, this.texture.tex);
    gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 0, 0, rt.width, rt.height, 0);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
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
