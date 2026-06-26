export interface Size {
  width: number;
  height: number;
}

export type UniformValue =
  | number
  | boolean
  | [number, number]
  | [number, number, number]
  | [number, number, number, number]
  | Float32Array;

export type Uniforms = Record<string, UniformValue>;

/** A single configurable parameter exposed in the UI. */
export interface ParamSpec {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
}
