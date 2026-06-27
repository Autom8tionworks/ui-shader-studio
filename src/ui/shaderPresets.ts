/** Load/save ShaderToy-style presets. Built-ins ship with the app; user presets persist in
 *  localStorage (this is a normal deployed web app, so that's appropriate). */
import { ShaderPreset, STARTER_SHADERS } from "../engine/shaders/shadertoy";

const KEY = "shaderstudio.userShaders.v1";

export function userPresets(): ShaderPreset[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

export function allPresets(): ShaderPreset[] {
  return [...STARTER_SHADERS, ...userPresets()];
}

export function saveUserPreset(name: string, code: string): void {
  const list = userPresets().filter((p) => p.name !== name);
  list.push({ name, code });
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function deleteUserPreset(name: string): void {
  localStorage.setItem(KEY, JSON.stringify(userPresets().filter((p) => p.name !== name)));
}
