/**
 * Keyframe animation timeline. A Timeline owns a duration, fps and playhead plus a list of
 * Channels. Each channel targets one numeric property on a layer (opacity, a liquid-glass
 * param, shader mix, a material param, or an adjustment param) and holds keyframes that are
 * linearly interpolated and written back to the layer every frame during playback.
 */
import { Document } from "./document";
import { Layer } from "./layer";

export interface Keyframe {
  t: number; // seconds
  v: number;
}

export type ChannelTarget =
  | { kind: "opacity" }
  | { kind: "shaderMix" }
  | { kind: "liquidGlass"; key: "strength" | "speed" | "scale" | "frost" | "tint" | "highlight" }
  | { kind: "material"; key: string }
  | { kind: "adjust"; index: number; key: string };

export interface Channel {
  id: string;
  label: string;
  layerId: number;
  target: ChannelTarget;
  min: number;
  max: number;
  keys: Keyframe[];
}

let _cid = 0;

export class Timeline {
  duration = 5;
  fps = 30;
  time = 0;
  playing = false;
  loop = true;
  channels: Channel[] = [];
  onComplete: (() => void) | null = null;

  addChannel(layerId: number, label: string, target: ChannelTarget, min: number, max: number): Channel {
    const ch: Channel = { id: `ch${++_cid}`, label, layerId, target, min, max, keys: [] };
    this.channels.push(ch);
    return ch;
  }

  removeChannel(id: string): void {
    this.channels = this.channels.filter((c) => c.id !== id);
  }

  /** Record a keyframe at time t with the channel's CURRENT live value. */
  addKeyframe(doc: Document, ch: Channel, t: number): void {
    const v = readTarget(doc, ch);
    if (v === null) return;
    const keys = ch.keys.filter((k) => Math.abs(k.t - t) > 1e-3);
    keys.push({ t, v });
    keys.sort((a, b) => a.t - b.t);
    ch.keys = keys;
  }

  removeKeyframe(ch: Channel, index: number): void {
    ch.keys.splice(index, 1);
  }

  /** Apply every channel's interpolated value at time t back onto its layer. */
  evaluate(doc: Document, t: number): void {
    for (const ch of this.channels) {
      if (ch.keys.length === 0) continue;
      writeTarget(doc, ch, sampleChannel(ch, t));
    }
  }

  /** Advance the playhead; returns true while still playing. */
  advance(dt: number): boolean {
    if (!this.playing) return false;
    this.time += dt;
    if (this.time >= this.duration) {
      if (this.loop) {
        this.time = this.time % this.duration;
      } else {
        this.time = this.duration;
        this.playing = false;
        this.onComplete?.();
      }
    }
    return true;
  }
}

export function sampleChannel(ch: Channel, t: number): number {
  const k = ch.keys;
  if (k.length === 1) return k[0].v;
  if (t <= k[0].t) return k[0].v;
  if (t >= k[k.length - 1].t) return k[k.length - 1].v;
  for (let i = 0; i < k.length - 1; i++) {
    if (t >= k[i].t && t <= k[i + 1].t) {
      const span = k[i + 1].t - k[i].t || 1e-6;
      const f = (t - k[i].t) / span;
      // smoothstep easing for nicer motion
      const e = f * f * (3 - 2 * f);
      return k[i].v + (k[i + 1].v - k[i].v) * e;
    }
  }
  return k[k.length - 1].v;
}

function findLayer(doc: Document, id: number): Layer | undefined {
  return doc.layers.find((l) => l.id === id);
}

export function readTarget(doc: Document, ch: Channel): number | null {
  const layer = findLayer(doc, ch.layerId);
  if (!layer) return null;
  const tg = ch.target;
  switch (tg.kind) {
    case "opacity":
      return layer.opacity;
    case "shaderMix":
      return layer.shaderFilter ? layer.shaderFilter.mix : null;
    case "liquidGlass":
      return layer.liquidGlass ? layer.liquidGlass[tg.key] : null;
    case "material":
      return layer.material ? layer.material.params[tg.key] ?? null : null;
    case "adjust":
      return layer.adjustments[tg.index]?.params[tg.key] ?? null;
  }
}

function writeTarget(doc: Document, ch: Channel, v: number): void {
  const layer = findLayer(doc, ch.layerId);
  if (!layer) return;
  const tg = ch.target;
  switch (tg.kind) {
    case "opacity":
      layer.opacity = v;
      break;
    case "shaderMix":
      if (layer.shaderFilter) layer.shaderFilter.mix = v;
      break;
    case "liquidGlass":
      if (layer.liquidGlass) layer.liquidGlass[tg.key] = v;
      break;
    case "material":
      if (layer.material) layer.material.params[tg.key] = v;
      break;
    case "adjust":
      if (layer.adjustments[tg.index]) layer.adjustments[tg.index].params[tg.key] = v;
      break;
  }
}

/** Channels the active layer currently supports (used to populate the "add" dropdown). */
export function availableTargets(layer: Layer): { label: string; target: ChannelTarget; min: number; max: number }[] {
  const out: { label: string; target: ChannelTarget; min: number; max: number }[] = [];
  out.push({ label: "Opacity", target: { kind: "opacity" }, min: 0, max: 1 });
  if (layer.shaderFilter) out.push({ label: "Shader Mix", target: { kind: "shaderMix" }, min: 0, max: 1 });
  if (layer.liquidGlass) {
    const ranges: Record<string, [number, number]> = {
      strength: [0, 1], speed: [0, 3], scale: [1, 20], frost: [0, 1], tint: [0, 1], highlight: [0, 1]
    };
    (Object.keys(ranges) as ("strength" | "speed" | "scale" | "frost" | "tint" | "highlight")[]).forEach((key) => {
      out.push({ label: `Glass ${key}`, target: { kind: "liquidGlass", key }, min: ranges[key][0], max: ranges[key][1] });
    });
  }
  if (layer.material) {
    for (const key of Object.keys(layer.material.params)) {
      out.push({ label: `Material ${key.replace("u_", "")}`, target: { kind: "material", key }, min: 0, max: 12 });
    }
  }
  layer.adjustments.forEach((adj, index) => {
    for (const key of Object.keys(adj.params)) {
      out.push({ label: `${adj.type}.${key}`, target: { kind: "adjust", index, key }, min: -1, max: 2 });
    }
  });
  return out;
}
