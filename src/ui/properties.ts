/**
 * Contextual right-hand panel. Top section = options for the current tool (including the
 * ShaderToy editor). Below that, the active layer's adjustment stack, material preset, and
 * mask controls.
 */
import { App } from "./app";
import { Adjustment, AdjustmentType, ADJUSTMENT_LABELS, Layer, defaultLiquidGlass } from "../core/layer";
import { MATERIALS } from "../engine/shaders/material";
import { buildShaderToy } from "../engine/shaders/shadertoy";
import { program } from "../engine/gl";
import { QUAD_VERT } from "../engine/shaders/quad.vert";
import { allPresets, saveUserPreset, deleteUserPreset } from "./shaderPresets";
import { SelectMode } from "../tools/selectTool";
import { FillMode } from "../tools/fillTool";
import { ShapeKind, SHAPE_OPTIONS, FILLABLE_2D } from "../tools/shapeTool";

export function buildProperties(root: HTMLElement, app: App): void {
  root.innerHTML = "";
  const id = app.currentToolId;
  const toolBody = card(root, { key: "tool", title: toolTitle(id), desc: TOOL_DESC[id] ?? "", defaultOpen: true });
  toolSection(toolBody, app);

  const layer = app.doc.activeLayer;
  if (layer && id !== "shader") {
    categoryLabel(root, `Active layer — ${layer.name}`);
    maskSection(card(root, { key: "mask", title: "Layer Mask", desc: "Hide parts of the layer non-destructively — paint the mask to reveal or conceal.", defaultOpen: false, badge: layer.mask ? "on" : undefined }), app, layer);
    adjustmentsSection(card(root, { key: "adj", title: "Adjustments", desc: "Stackable, non-destructive color tweaks — brightness, hue, blur, invert. Fully reversible.", defaultOpen: true, badge: layer.adjustments.length ? String(layer.adjustments.length) : undefined }), app, layer);
    materialSection(card(root, { key: "mat", title: "Material", desc: "Light the layer like a real surface — glass, metal, plastic, matte — in real time.", defaultOpen: false, badge: layer.material ? layer.material.id : undefined }), app, layer);
    liquidGlassSection(card(root, { key: "glass", title: "Liquid Glass", desc: "Animated refraction, frost and caustics that ripple continuously.", defaultOpen: false, badge: layer.liquidGlass ? "live" : undefined }), app, layer);
  }
}

const TOOL_DESC: Record<string, string> = {
  brush: "Paint onto the active layer (or its mask). Tune size, edge hardness, flow and color.",
  eraser: "Erase pixels from the active layer with a soft round brush.",
  transform: "Move, scale and rotate the active layer. Commits when you release.",
  crop: "Trim the document (and every layer) to a rectangle.",
  select: "Make a selection — rectangle, ellipse, lasso or magic wand. Edits stay inside it.",
  fill: "Flood-fill a region by color, or fill the whole selection with a solid color.",
  gradient: "Drag to paint a linear gradient between two colors, clipped to the selection.",
  eyedropper: "Click the canvas to sample a color into the brush, fill and shape tools.",
  text: "Click to drop editable text on a new layer.",
  shape: "Drag to draw rectangles, ellipses and lines into the active layer.",
  shader: "Write a live GLSL fragment shader (ShaderToy-style) that filters the layer."
};

// ---------------- tool options ----------------
function toolSection(root: HTMLElement, app: App): void {
  const id = app.currentToolId;
  switch (id) {
    case "brush":
      brushOptions(root, app, app.brush, true);
      break;
    case "eraser":
      brushOptions(root, app, app.eraser, false);
      break;
    case "transform":
      note(root, "Drag to move. Shift+drag to scale. Alt+drag to rotate. Commits on release.");
      break;
    case "crop":
      cropOptions(root, app);
      break;
    case "select":
      selectOptions(root, app);
      break;
    case "fill":
      fillOptions(root, app);
      break;
    case "gradient":
      gradientOptions(root, app);
      break;
    case "eyedropper":
      note(root, "Click the canvas to sample a color into the brush, fill and shape tools.");
      break;
    case "text":
      textOptions(root, app);
      break;
    case "shape":
      shapeOptions(root, app);
      break;
    case "shader":
      shaderOptions(root, app);
      break;
  }
}

function toolTitle(id: string): string {
  const m: Record<string, string> = {
    brush: "Brush", eraser: "Eraser", transform: "Transform", crop: "Crop",
    select: "Selection", fill: "Fill", gradient: "Gradient", eyedropper: "Eyedropper",
    text: "Text", shape: "Shape", shader: "Shader Filter (ShaderToy)"
  };
  return m[id] ?? "Tool";
}

function brushOptions(root: HTMLElement, app: App, tool: import("../tools/brushTool").BrushTool, withColor: boolean): void {
  slider(root, "Size", tool.settings.size, 1, 400, 1, (v) => (tool.settings.size = v));
  slider(root, "Hardness", tool.settings.hardness, 0, 1, 0.01, (v) => (tool.settings.hardness = v));
  slider(root, "Flow", tool.settings.flow, 0, 1, 0.01, (v) => (tool.settings.flow = v));
  if (withColor) colorRow(root, "Color", tool.settings.color, (c) => (tool.settings.color = c));
  const l = app.doc.activeLayer;
  if (l?.mask) note(root, l.editingMask ? "Editing MASK: white reveals, black/eraser hides." : "Tip: this layer has a mask. Toggle 'Edit mask' below to paint it.");
}

function cropOptions(root: HTMLElement, app: App): void {
  const doc = app.doc;
  if (!app.cropTool.rect) app.cropTool.rect = { x: 0, y: 0, w: doc.width, h: doc.height };
  const r = app.cropTool.rect;
  note(root, "Drag on the canvas to set the crop box. Drag its handles to resize, or inside it to move.");
  numberRow(root, "Left", Math.round(r.x), (v) => { r.x = v; app.requestRender(); });
  numberRow(root, "Bottom", Math.round(r.y), (v) => { r.y = v; app.requestRender(); });
  numberRow(root, "Width", Math.round(r.w), (v) => { r.w = v; app.requestRender(); });
  numberRow(root, "Height", Math.round(r.h), (v) => { r.h = v; app.requestRender(); });
  actions(root, [
    primary("Apply Crop", () => { if (r.w >= 1 && r.h >= 1) app.crop(r.x, r.y, r.w, r.h); }),
    ghost("Reset", () => { app.cropTool.rect = { x: 0, y: 0, w: app.doc.width, h: app.doc.height }; app.requestRender(); app.rebuildUI(); })
  ]);
  note(root, "Origin is bottom-left, in document pixels.");
}

function selectOptions(root: HTMLElement, app: App): void {
  const modes: { id: SelectMode; label: string }[] = [
    { id: "rect", label: "Rectangle" },
    { id: "ellipse", label: "Ellipse" },
    { id: "lasso", label: "Lasso" },
    { id: "wand", label: "Magic Wand" }
  ];
  segmented(root, "Mode", modes.map((m) => m.label), modes.findIndex((m) => m.id === app.select.mode), (i) => {
    app.select.mode = modes[i].id;
    app.rebuildUI();
  });
  if (app.select.mode === "wand") {
    slider(root, "Tolerance", app.select.tolerance, 0, 128, 1, (v) => (app.select.tolerance = v));
  }
  actions(root, [
    ghost("Select All", () => app.selectAll()),
    ghost("Deselect", () => app.deselect())
  ]);
  note(root, "Drag to select. Painting, fill and gradient stay inside the selection.");
}

function fillOptions(root: HTMLElement, app: App): void {
  const modes: { id: FillMode; label: string }[] = [
    { id: "bucket", label: "Bucket (flood)" },
    { id: "solid", label: "Solid (fill)" }
  ];
  segmented(root, "Mode", modes.map((m) => m.label), modes.findIndex((m) => m.id === app.fill.mode), (i) => {
    app.fill.mode = modes[i].id;
    app.rebuildUI();
  });
  colorRow(root, "Color", app.fill.color, (c) => (app.fill.color = c));
  slider(root, "Opacity", app.fill.opacity, 0, 1, 0.01, (v) => (app.fill.opacity = v));
  if (app.fill.mode === "bucket") slider(root, "Tolerance", app.fill.tolerance, 0, 128, 1, (v) => (app.fill.tolerance = v));
  note(root, app.fill.mode === "bucket" ? "Click a region to flood-fill by color." : "Click to fill the selection (or the whole layer).");
}

function gradientOptions(root: HTMLElement, app: App): void {
  const g = app.gradient;
  colorRow(root, "Start", [g.color0[0], g.color0[1], g.color0[2]], (c) => (g.color0 = [c[0], c[1], c[2], g.color0[3]]));
  colorRow(root, "End", [g.color1[0], g.color1[1], g.color1[2]], (c) => (g.color1 = [c[0], c[1], c[2], g.color1[3]]));
  checkbox(root, "Fade end to transparent", g.color1[3] < 0.5, (on) => (g.color1[3] = on ? 0 : 1));
  slider(root, "Opacity", g.opacity, 0, 1, 0.01, (v) => (g.opacity = v));
  note(root, "Drag across the canvas to set the gradient direction.");
}

function textOptions(root: HTMLElement, app: App): void {
  const t = app.text;
  textRow(root, "Text", t.settings.text, (v) => (t.settings.text = v));
  slider(root, "Size", t.settings.size, 8, 400, 1, (v) => (t.settings.size = v));
  colorRow(root, "Color", t.settings.color, (c) => (t.settings.color = c));
  checkbox(root, "Bold", t.settings.bold, (on) => (t.settings.bold = on));
  note(root, "Click the canvas to drop the text on a new layer.");
}

function shapeOptions(root: HTMLElement, app: App): void {
  const s = app.shape;
  const r = row(root, "Shape");
  const sel = document.createElement("select");
  sel.title = "Pick a shape — basic, 2D, or shaded 3D";
  let lastGroup = "";
  let optGroup: HTMLOptGroupElement | null = null;
  for (const opt of SHAPE_OPTIONS) {
    if (opt.group !== lastGroup) {
      optGroup = document.createElement("optgroup");
      optGroup.label = opt.group;
      sel.appendChild(optGroup);
      lastGroup = opt.group;
    }
    const o = document.createElement("option");
    o.value = opt.id;
    o.textContent = opt.label;
    if (opt.id === s.kind) o.selected = true;
    (optGroup ?? sel).appendChild(o);
  }
  sel.onchange = () => { s.kind = sel.value as ShapeKind; app.rebuildUI(); };
  r.appendChild(sel);

  colorRow(root, "Color", s.color, (c) => (s.color = c));
  const fillable = FILLABLE_2D.includes(s.kind);
  if (fillable) checkbox(root, "Fill", s.fill, (on) => (s.fill = on));
  if (s.kind === "line" || (fillable && !s.fill)) slider(root, "Stroke", s.lineWidth, 1, 60, 1, (v) => (s.lineWidth = v));
  note(root, fillable || s.kind === "line"
    ? "Drag on the canvas to draw into the active layer."
    : "Drag a box on the canvas — the 3D shape is shaded for you.");
}

// ---------------- ShaderToy editor ----------------
function shaderOptions(root: HTMLElement, app: App): void {
  const layer = app.doc.activeLayer;
  if (!layer) {
    note(root, "Select a layer to apply a shader filter.");
    return;
  }

  const presets = allPresets();
  const presetRow = row(root, "Preset");
  const sel = document.createElement("select");
  for (const pr of presets) {
    const o = document.createElement("option");
    o.value = pr.name;
    o.textContent = pr.builtin ? pr.name : `★ ${pr.name}`;
    sel.appendChild(o);
  }
  presetRow.appendChild(sel);

  const ta = document.createElement("textarea");
  ta.className = "code";
  ta.spellcheck = false;
  ta.value = layer.shaderFilter?.code ?? presets[0].code;
  ta.rows = 14;
  root.appendChild(ta);

  const errBox = document.createElement("div");
  errBox.className = "shader-error";
  root.appendChild(errBox);

  sel.onchange = () => {
    const pr = presets.find((p) => p.name === sel.value);
    if (pr) ta.value = pr.code;
  };

  const apply = () => {
    errBox.textContent = "";
    try {
      program(QUAD_VERT, buildShaderToy(ta.value)); // compile-check
    } catch (e) {
      errBox.textContent = (e as Error).message.split("\n").slice(0, 4).join("\n");
      return;
    }
    const animated = layer.shaderFilter?.animated ?? true;
    const mix = layer.shaderFilter?.mix ?? 1;
    layer.shaderFilter = { name: sel.value, code: ta.value, time: 0, animated, mix };
    app.requestRender();
    app.rebuildUI();
  };

  actions(root, [
    primary("Apply", apply),
    ghost("Save preset", () => {
      const name = prompt("Preset name:", sel.value);
      if (name) {
        saveUserPreset(name, ta.value);
        app.rebuildUI();
      }
    })
  ]);

  if (layer.shaderFilter) {
    checkbox(root, "Animate (iTime)", layer.shaderFilter.animated, (on) => {
      if (layer.shaderFilter) layer.shaderFilter.animated = on;
      app.requestRender();
    });
    slider(root, "Mix", layer.shaderFilter.mix, 0, 1, 0.01, (v) => {
      if (layer.shaderFilter) layer.shaderFilter.mix = v;
      app.requestRender();
    });
    actions(root, [
      ghost("Remove filter", () => {
        layer.shaderFilter = null;
        app.requestRender();
        app.rebuildUI();
      }),
      ghost("Delete preset", () => {
        deleteUserPreset(sel.value);
        app.rebuildUI();
      })
    ]);
  }
  note(root, "Write mainImage(out vec4, in vec2). Uniforms: iResolution, iTime, iMouse, iChannel0 (= layer).");
}

// ---------------- mask / adjustments / material ----------------
function maskSection(root: HTMLElement, app: App, layer: Layer): void {
  if (!layer.mask) {
    actions(root, [ghost("Add Mask", () => { layer.addMask(); app.requestRender(); app.rebuildUI(); })]);
    note(root, "A mask hides parts of the layer without deleting them. Paint it with the brush.");
  } else {
    checkbox(root, "Edit mask", layer.editingMask, (on) => { layer.editingMask = on; app.rebuildUI(); });
    actions(root, [ghost("Remove Mask", () => { layer.removeMask(); app.requestRender(); app.rebuildUI(); })]);
  }
}

function adjustmentsSection(root: HTMLElement, app: App, layer: Layer): void {
  const addRow = document.createElement("div");
  addRow.className = "section-actions";
  const sel = document.createElement("select");
  const types: AdjustmentType[] = ["brightnessContrast", "hsl", "invert", "blur"];
  for (const t of types) {
    const o = document.createElement("option");
    o.value = t;
    o.textContent = ADJUSTMENT_LABELS[t];
    sel.appendChild(o);
  }
  addRow.appendChild(sel);
  const add = document.createElement("button");
  add.className = "ghost";
  add.textContent = "Add";
  add.onclick = () => { layer.addAdjustment(sel.value as AdjustmentType); app.requestRender(); app.rebuildUI(); };
  addRow.appendChild(add);
  root.appendChild(addRow);

  layer.adjustments.forEach((adj) => adjustmentEditor(root, app, layer, adj));
  if (layer.adjustments.length === 0) note(root, "No adjustments. Add one above.");
}

function adjustmentEditor(root: HTMLElement, app: App, layer: Layer, adj: Adjustment): void {
  const title = document.createElement("div");
  title.className = "row";
  title.innerHTML = `<label style="width:auto;flex:1;color:var(--text)">${ADJUSTMENT_LABELS[adj.type]}</label>`;
  const del = document.createElement("button");
  del.className = "ghost";
  del.textContent = "✕";
  del.onclick = () => { layer.removeAdjustment(adj); app.requestRender(); app.rebuildUI(); };
  title.appendChild(del);
  root.appendChild(title);
  for (const s of ADJ_SPECS[adj.type]) {
    slider(root, s.label, adj.params[s.key], s.min, s.max, s.step, (v) => { adj.params[s.key] = v; app.requestRender(); });
  }
  const hr = document.createElement("hr");
  hr.className = "sep";
  root.appendChild(hr);
}

const ADJ_SPECS: Record<AdjustmentType, { key: string; label: string; min: number; max: number; step: number }[]> = {
  brightnessContrast: [
    { key: "brightness", label: "Brightness", min: -1, max: 1, step: 0.01 },
    { key: "contrast", label: "Contrast", min: 0, max: 2, step: 0.01 }
  ],
  hsl: [
    { key: "hue", label: "Hue", min: -0.5, max: 0.5, step: 0.005 },
    { key: "sat", label: "Saturation", min: 0, max: 2, step: 0.01 },
    { key: "light", label: "Lightness", min: -1, max: 1, step: 0.01 }
  ],
  invert: [{ key: "amount", label: "Amount", min: 0, max: 1, step: 0.01 }],
  blur: [{ key: "radius", label: "Radius", min: 0, max: 32, step: 0.5 }]
};

function materialSection(root: HTMLElement, app: App, layer: Layer): void {
  const r = row(root, "Preset");
  const sel = document.createElement("select");
  const none = document.createElement("option");
  none.value = "";
  none.textContent = "None";
  sel.appendChild(none);
  for (const m of MATERIALS) {
    const o = document.createElement("option");
    o.value = m.id;
    o.textContent = m.label;
    if (layer.material?.id === m.id) o.selected = true;
    sel.appendChild(o);
  }
  sel.onchange = () => {
    if (!sel.value) layer.material = null;
    else {
      const mat = MATERIALS.find((m) => m.id === sel.value)!;
      const params: Record<string, number> = {};
      for (const p of mat.params) params[p.key] = p.default;
      layer.material = { id: mat.id, params, lightAngle: Math.PI * 0.25 };
    }
    app.requestRender();
    app.rebuildUI();
  };
  r.appendChild(sel);

  if (layer.material) {
    const mat = MATERIALS.find((m) => m.id === layer.material!.id)!;
    for (const p of mat.params) {
      slider(root, p.label, layer.material.params[p.key], p.min, p.max, p.step, (v) => { layer.material!.params[p.key] = v; app.requestRender(); });
    }
    slider(root, "Light angle", layer.material.lightAngle, 0, Math.PI * 2, 0.01, (v) => { layer.material!.lightAngle = v; app.requestRender(); });
  }
}

function liquidGlassSection(root: HTMLElement, app: App, layer: Layer): void {
  checkbox(root, "Enable", !!layer.liquidGlass, (on) => {
    layer.liquidGlass = on ? defaultLiquidGlass() : null;
    app.requestRender();
    app.rebuildUI();
  });
  const lg = layer.liquidGlass;
  if (lg) {
    slider(root, "Strength", lg.strength, 0, 1, 0.01, (v) => { lg.strength = v; app.requestRender(); });
    slider(root, "Speed", lg.speed, 0, 3, 0.01, (v) => { lg.speed = v; app.requestRender(); });
    slider(root, "Ripple scale", lg.scale, 1, 20, 0.1, (v) => { lg.scale = v; app.requestRender(); });
    slider(root, "Frost", lg.frost, 0, 1, 0.01, (v) => { lg.frost = v; app.requestRender(); });
    slider(root, "Tint", lg.tint, 0, 1, 0.01, (v) => { lg.tint = v; app.requestRender(); });
    slider(root, "Highlight", lg.highlight, 0, 1, 0.01, (v) => { lg.highlight = v; app.requestRender(); });
    note(root, "Animates continuously. Stacks on top of adjustments and material.");
  }
}

// ---------------- primitives ----------------
function head(root: HTMLElement, text: string): void {
  const h = document.createElement("div");
  h.className = "panel-head";
  h.textContent = text;
  root.appendChild(h);
}
function note(root: HTMLElement, text: string): void {
  const n = document.createElement("div");
  n.className = "row muted";
  n.style.fontSize = "11px";
  n.textContent = text;
  root.appendChild(n);
}
function row(root: HTMLElement, label: string): HTMLElement {
  const r = document.createElement("div");
  r.className = "row";
  r.title = TIPS[label] ?? label;
  const l = document.createElement("label");
  l.textContent = label;
  r.appendChild(l);
  root.appendChild(r);
  return r;
}
function slider(root: HTMLElement, label: string, value: number, min: number, max: number, step: number, onChange: (v: number) => void): void {
  const r = row(root, label);
  const inp = document.createElement("input");
  inp.type = "range";
  inp.min = String(min);
  inp.max = String(max);
  inp.step = String(step);
  inp.value = String(value);
  const val = document.createElement("span");
  val.className = "val";
  val.textContent = fmt(value);
  inp.oninput = () => { const v = Number(inp.value); val.textContent = fmt(v); onChange(v); };
  r.appendChild(inp);
  r.appendChild(val);
}
function numberRow(root: HTMLElement, label: string, value: number, onChange: (v: number) => void): void {
  const r = row(root, label);
  const inp = document.createElement("input");
  inp.type = "number";
  inp.value = String(value);
  inp.oninput = () => onChange(Number(inp.value));
  r.appendChild(inp);
}
function textRow(root: HTMLElement, label: string, value: string, onChange: (v: string) => void): void {
  const r = row(root, label);
  const inp = document.createElement("input");
  inp.type = "text";
  inp.value = value;
  inp.oninput = () => onChange(inp.value);
  r.appendChild(inp);
}
function colorRow(root: HTMLElement, label: string, rgb: [number, number, number], onChange: (c: [number, number, number]) => void): void {
  const r = row(root, label);
  const inp = document.createElement("input");
  inp.type = "color";
  inp.value = rgbToHex(rgb);
  inp.oninput = () => onChange(hexToRgb(inp.value));
  r.appendChild(inp);
}
function checkbox(root: HTMLElement, label: string, value: boolean, onChange: (v: boolean) => void): void {
  const r = document.createElement("div");
  r.className = "row";
  r.title = TIPS[label] ?? label;
  const inp = document.createElement("input");
  inp.type = "checkbox";
  inp.checked = value;
  inp.style.flex = "0";
  inp.onchange = () => onChange(inp.checked);
  const l = document.createElement("label");
  l.style.width = "auto";
  l.textContent = label;
  r.appendChild(inp);
  r.appendChild(l);
  root.appendChild(r);
}
function segmented(root: HTMLElement, label: string, options: string[], active: number, onChange: (i: number) => void): void {
  head(root, label);
  const wrap = document.createElement("div");
  wrap.className = "section-actions";
  options.forEach((opt, i) => {
    const b = document.createElement("button");
    b.className = i === active ? "primary" : "ghost";
    b.textContent = opt;
    b.title = opt;
    b.onclick = () => onChange(i);
    wrap.appendChild(b);
  });
  root.appendChild(wrap);
}
function actions(root: HTMLElement, btns: HTMLButtonElement[]): void {
  const wrap = document.createElement("div");
  wrap.className = "section-actions";
  btns.forEach((b) => wrap.appendChild(b));
  root.appendChild(wrap);
}
function ghost(label: string, onClick: () => void, tip?: string): HTMLButtonElement {
  const b = document.createElement("button");
  b.className = "ghost";
  b.textContent = label;
  b.title = tip ?? label;
  b.onclick = onClick;
  return b;
}
function primary(label: string, onClick: () => void, tip?: string): HTMLButtonElement {
  const b = document.createElement("button");
  b.className = "primary";
  b.textContent = label;
  b.title = tip ?? label;
  b.onclick = onClick;
  return b;
}

// ---- collapsible cards, categories, tooltips ----
const OPEN_KEY = "shaderstudio.cards.v1";
let _openState: Record<string, boolean> | null = null;
function openState(): Record<string, boolean> {
  if (!_openState) {
    try { _openState = JSON.parse(localStorage.getItem(OPEN_KEY) || "{}"); } catch { _openState = {}; }
  }
  return _openState!;
}
function card(root: HTMLElement, o: { key: string; title: string; desc?: string; defaultOpen?: boolean; badge?: string }): HTMLElement {
  const st = openState();
  const isOpen = st[o.key] ?? (o.defaultOpen ?? true);
  const wrap = document.createElement("div");
  wrap.className = "ps-card";
  const head = document.createElement("button");
  head.type = "button";
  head.className = "ps-head";
  head.title = o.desc || o.title;
  const chev = document.createElement("span");
  chev.className = "ps-chevron";
  chev.textContent = isOpen ? "▾" : "▸";
  const title = document.createElement("span");
  title.className = "ps-title";
  title.textContent = o.title;
  head.append(chev, title);
  if (o.badge) {
    const b = document.createElement("span");
    b.className = "ps-badge";
    b.textContent = o.badge;
    head.appendChild(b);
  }
  wrap.appendChild(head);
  const body = document.createElement("div");
  body.className = "ps-body";
  if (!isOpen) body.style.display = "none";
  if (o.desc) {
    const d = document.createElement("div");
    d.className = "ps-desc";
    d.textContent = o.desc;
    body.appendChild(d);
  }
  wrap.appendChild(body);
  head.onclick = () => {
    const nowOpen = body.style.display === "none";
    body.style.display = nowOpen ? "" : "none";
    chev.textContent = nowOpen ? "▾" : "▸";
    st[o.key] = nowOpen;
    localStorage.setItem(OPEN_KEY, JSON.stringify(st));
  };
  root.appendChild(wrap);
  return body;
}
function categoryLabel(root: HTMLElement, text: string): void {
  const c = document.createElement("div");
  c.className = "ps-cat";
  c.textContent = text;
  root.appendChild(c);
}

const TIPS: Record<string, string> = {
  Size: "Brush diameter in pixels",
  Hardness: "Edge softness — 0 = feathered, 1 = crisp",
  Flow: "Paint strength applied per stroke",
  Color: "Pick the color",
  Start: "Gradient start color",
  End: "Gradient end color",
  Opacity: "Overall strength / transparency",
  Tolerance: "How close in color a pixel must be to be included",
  Strength: "Effect intensity",
  Speed: "Animation speed",
  "Ripple scale": "Wave frequency — higher = finer ripples",
  Frost: "Frosted-glass blur amount",
  Tint: "Cool glass color tint",
  Highlight: "Glassy specular / caustic brightness",
  Mix: "Blend between the original and the filtered result",
  "Light angle": "Direction the surface is lit from",
  Brightness: "Lighten or darken",
  Contrast: "Push tones apart or together",
  Hue: "Rotate all colors around the wheel",
  Saturation: "Color intensity — 0 = grayscale",
  Lightness: "Lighten or darken without changing hue",
  Amount: "Effect amount",
  Radius: "Blur radius in pixels",
  Stroke: "Line thickness in pixels",
  Text: "The text to render",
  Bold: "Use a bold weight",
  Fill: "Filled shape vs. outline only",
  Preset: "Choose a preset",
  Left: "Crop left edge (document px)",
  Bottom: "Crop bottom edge (document px)",
  Width: "Crop width (document px)",
  Height: "Crop height (document px)"
};
function fmt(v: number): string {
  return Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(2);
}
function rgbToHex(c: [number, number, number]): string {
  const h = (n: number) => Math.round(Math.max(0, Math.min(1, n)) * 255).toString(16).padStart(2, "0");
  return `#${h(c[0])}${h(c[1])}${h(c[2])}`;
}
function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
