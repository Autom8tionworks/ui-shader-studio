/** Blend mode indices — must stay in sync with blendRGB() in shaders/blend.ts. */
export enum BlendMode {
  Normal = 0,
  Multiply = 1,
  Screen = 2,
  Overlay = 3,
  Darken = 4,
  Lighten = 5,
  ColorDodge = 6,
  ColorBurn = 7,
  HardLight = 8,
  SoftLight = 9,
  Difference = 10,
  Exclusion = 11
}

export const BLEND_MODE_NAMES: Record<BlendMode, string> = {
  [BlendMode.Normal]: "Normal",
  [BlendMode.Multiply]: "Multiply",
  [BlendMode.Screen]: "Screen",
  [BlendMode.Overlay]: "Overlay",
  [BlendMode.Darken]: "Darken",
  [BlendMode.Lighten]: "Lighten",
  [BlendMode.ColorDodge]: "Color Dodge",
  [BlendMode.ColorBurn]: "Color Burn",
  [BlendMode.HardLight]: "Hard Light",
  [BlendMode.SoftLight]: "Soft Light",
  [BlendMode.Difference]: "Difference",
  [BlendMode.Exclusion]: "Exclusion"
};
