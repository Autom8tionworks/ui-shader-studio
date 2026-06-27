/**
 * Parametric project files. A document — every layer's effect stack (adjustments, material,
 * liquid glass, shader source), masks, pixels, plus the animation timeline — serializes to a
 * single readable JSON. The parametric parts are diff-able/git-friendly; raster pixels ride
 * along as PNG data URLs so any layer round-trips faithfully.
 */
import { ctx } from "../engine/gl";
import { runPass } from "../engine/pass";
import { GLTexture, RenderTarget } from "../engine/texture";
import { QUAD_VERT } from "../engine/shaders/quad.vert";
import { COPY } from "../engine/shaders/adjust";
import { Document } from "./document";
import { Layer } from "./layer";
import { Timeline, Channel } from "./timeline";

const FORMAT = "shader-studio-project";
const VERSION = 1;

interface LayerJSON {
  name: string;
  visible: boolean;
  opacity: number;
  blendMode: number;
  adjustments: { type: string; enabled: boolean; params: Record<string, number> }[];
  material: { id: string; params: Record<string, number>; lightAngle: number } | null;
  liquidGlass: Record<string, number> | null;
  shaderFilter: { name: string; code: string; animated: boolean; mix: number } | null;
  image: string;
  mask: string | null;
}

interface ProjectJSON {
  format: string;
  version: number;
  doc: { width: number; height: number };
  activeLayer: number;
  layers: LayerJSON[];
  timeline: {
    duration: number;
    fps: number;
    loop: boolean;
    channels: { label: string; layer: number; target: Channel["target"]; min: number; max: number; keys: { t: number; v: number }[] }[];
  };
}

/** Read a straight-alpha texture into a top-down PNG data URL. */
function textureToDataURL(tex: GLTexture, w: number, h: number): string {
  const gl = ctx().gl;
  const rt = new RenderTarget(w, h, false);
  runPass({ vert: QUAD_VERT, frag: COPY, inputs: { u_tex: tex }, target: rt });
  const px = new Uint8Array(w * h * 4);
  gl.bindFramebuffer(gl.FRAMEBUFFER, rt.fbo);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  rt.dispose();

  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const g = cv.getContext("2d")!;
  const img = g.createImageData(w, h);
  for (let r = 0; r < h; r++) {
    const src = (h - 1 - r) * w * 4; // readPixels is bottom-up
    img.data.set(px.subarray(src, src + w * 4), r * w * 4);
  }
  g.putImageData(img, 0, 0);
  return cv.toDataURL("image/png");
}

export function serializeProject(doc: Document, timeline: Timeline): string {
  const idToIndex = new Map<number, number>();
  doc.layers.forEach((l, i) => idToIndex.set(l.id, i));

  const layers: LayerJSON[] = doc.layers.map((l) => {
    // Live layers (webcam/video) are flattened to their current frame.
    if (l.liveSource) l.updateLiveTexture();
    return {
      name: l.name,
      visible: l.visible,
      opacity: l.opacity,
      blendMode: l.blendMode,
      adjustments: l.adjustments.map((a) => ({ type: a.type, enabled: a.enabled, params: { ...a.params } })),
      material: l.material ? { id: l.material.id, params: { ...l.material.params }, lightAngle: l.material.lightAngle } : null,
      liquidGlass: l.liquidGlass
        ? { strength: l.liquidGlass.strength, speed: l.liquidGlass.speed, scale: l.liquidGlass.scale, frost: l.liquidGlass.frost, tint: l.liquidGlass.tint, highlight: l.liquidGlass.highlight }
        : null,
      shaderFilter: l.shaderFilter ? { name: l.shaderFilter.name, code: l.shaderFilter.code, animated: l.shaderFilter.animated, mix: l.shaderFilter.mix } : null,
      image: textureToDataURL(l.texture, l.width, l.height),
      mask: l.mask ? textureToDataURL(l.mask, l.width, l.height) : null
    };
  });

  const project: ProjectJSON = {
    format: FORMAT,
    version: VERSION,
    doc: { width: doc.width, height: doc.height },
    activeLayer: idToIndex.get(doc.activeLayerId) ?? 0,
    layers,
    timeline: {
      duration: timeline.duration,
      fps: timeline.fps,
      loop: timeline.loop,
      channels: timeline.channels.map((c) => ({
        label: c.label,
        layer: idToIndex.get(c.layerId) ?? 0,
        target: c.target,
        min: c.min,
        max: c.max,
        keys: c.keys.map((k) => ({ t: k.t, v: k.v }))
      }))
    }
  };
  return JSON.stringify(project, null, 2);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("image decode failed"));
    img.src = src;
  });
}

export interface LoadResult {
  doc: Document;
  activeIndexToId: Map<number, number>;
}

/** Build a fresh Document from project JSON. Caller swaps it in and rebuilds the timeline. */
export async function deserializeProject(json: string): Promise<{ project: ProjectJSON; doc: Document; indexToId: Map<number, number> }> {
  const project = JSON.parse(json) as ProjectJSON;
  if (project.format !== FORMAT) throw new Error("Not a Shader Studio project file.");

  const doc = new Document(project.doc.width, project.doc.height);
  const indexToId = new Map<number, number>();

  for (let i = 0; i < project.layers.length; i++) {
    const lj = project.layers[i];
    const img = await loadImage(lj.image);
    const layer = new Layer(lj.name, project.doc.width, project.doc.height, img);
    layer.visible = lj.visible;
    layer.opacity = lj.opacity;
    layer.blendMode = lj.blendMode;
    layer.adjustments = lj.adjustments.map((a) => ({ type: a.type as Layer["adjustments"][number]["type"], enabled: a.enabled, params: { ...a.params } }));
    layer.material = lj.material ? { id: lj.material.id, params: { ...lj.material.params }, lightAngle: lj.material.lightAngle } : null;
    layer.liquidGlass = lj.liquidGlass ? ({ ...(lj.liquidGlass as Record<string, number>), time: 0 } as Layer["liquidGlass"]) : null;
    layer.shaderFilter = lj.shaderFilter ? { name: lj.shaderFilter.name, code: lj.shaderFilter.code, animated: lj.shaderFilter.animated, mix: lj.shaderFilter.mix, time: 0 } : null;
    if (lj.mask) {
      const maskImg = await loadImage(lj.mask);
      layer.mask = new GLTexture(project.doc.width, project.doc.height, maskImg);
    }
    doc.addLayer(layer, false);
    indexToId.set(i, layer.id);
  }

  doc.activeLayerId = indexToId.get(project.activeLayer) ?? (doc.layers[0]?.id ?? -1);
  return { project, doc, indexToId };
}

/** Apply a deserialized project's timeline onto a Timeline instance, remapping layer ids. */
export function applyTimeline(timeline: Timeline, project: ProjectJSON, indexToId: Map<number, number>): void {
  timeline.duration = project.timeline.duration;
  timeline.fps = project.timeline.fps;
  timeline.loop = project.timeline.loop;
  timeline.playing = false;
  timeline.time = 0;
  timeline.channels = [];
  for (const cj of project.timeline.channels) {
    const layerId = indexToId.get(cj.layer);
    if (layerId === undefined) continue;
    const ch = timeline.addChannel(layerId, cj.label, cj.target, cj.min, cj.max);
    ch.keys = cj.keys.map((k) => ({ t: k.t, v: k.v }));
  }
}
