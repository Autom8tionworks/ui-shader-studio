/**
 * Contextual right-hand panel. Top section = options for the current tool. Below that, the
 * active layer's non-destructive adjustment stack and material preset (always available).
 */
import { App } from "./app";
import {
  Adjustment,
  AdjustmentType,
  ADJUSTMENT_LABELS,
  Layer
} from "../core/layer";
import { MATERIALS } from "../engine/shaders/material";
import { BrushTool } from "../tools/brushTool";

export function buildProperties(root: HTMLElement, app: App): void {
  root.innerHTML = "";
  toolSection(root, app);
  const layer = app.doc.activeLayer;
  if (layer) {
    adjustmentsSection(root, app, layer);
    materialSection(root, app, layer);
  }
}

// ---------------- tool options ----------------
function toolSection(root: HTMLElement, app: App): void {
  head(root, "Tool");
  const id = app.currentToolId;
  if (id === "brush" || id === "eraser") {
    brushOptions(root, app, app.tools[id] as BrushTool, id === "brush");
  } else if (id === "transform") {
    note(root, "Drag to move. Shift+drag to scale. Alt+drag to rotate. Commits on release.");
  } else if (id === "crop") {
    cropOptions(root, app);
  }
}

function brushOptions(root: HTMLElement, app: App, tool: BrushTool, withColor: boolean): void {
  slider(root, "Size", tool.settings.size, 1, 400, 1, (v) => (tool.settings.size = v));
  slider(root, "Hardness", tool.settings.hardness, 0, 1, 0.01, (v) => (tool.settings.hardness = v));
  slider(root, "Flow", tool.settings.flow, 0, 1, 0.01, (v) => (tool.settings.flow = v));
  if (withColor) {
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `<label>Color</label>`;
    const input = document.createElement("input");
    input.type = "color";
    input.value = rgbToHex(tool.settings.color);
    input.oninput = () => (tool.settings.color = hexToRgb(input.value));
    row.appendChild(input);
    root.appendChild(row);
  }
  void app;
}

function cropOptions(root: HTMLElement, app: App): void {
  const doc = app.doc;
  const state = { x: 0, y: 0, w: doc.width, h: doc.height };
  numberRow(root, "Left", state.x, (v) => (state.x = v));
  numberRow(root, "Bottom", state.y, (v) => (state.y = v));
  numberRow(root, "Width", state.w, (v) => (state.w = v));
  numberRow(root, "Height", state.h, (v) => (state.h = v));
  const row = document.createElement("div");
  row.className = "section-actions";
  const apply = document.createElement("button");
  apply.className = "primary";
  apply.textContent = "Apply Crop";
  apply.onclick = () => app.crop(state.x, state.y, state.w, state.h);
  row.appendChild(apply);
  root.appendChild(row);
  note(root, "Origin is bottom-left, in document pixels.");
}

// ---------------- adjustments ----------------
function adjustmentsSection(root: HTMLElement, app: App, layer: Layer): void {
  head(root, "Adjustments (non-destructive)");

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
  add.onclick = () => {
    layer.addAdjustment(sel.value as AdjustmentType);
    app.requestRender();
    app.rebuildUI();
  };
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
  del.onclick = () => {
    layer.removeAdjustment(adj);
    app.requestRender();
    app.rebuildUI();
  };
  title.appendChild(del);
  root.appendChild(title);

  const specs = ADJ_SPECS[adj.type];
  for (const s of specs) {
    slider(root, s.label, adj.params[s.key], s.min, s.max, s.step, (v) => {
      adj.params[s.key] = v;
      app.requestRender();
    });
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

// ---------------- material presets ----------------
function materialSection(root: HTMLElement, app: App, layer: Layer): void {
  head(root, "Material (real-time shader)");
  const row = document.createElement("div");
  row.className = "row";
  row.innerHTML = `<label>Preset</label>`;
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
    if (!sel.value) {
      layer.material = null;
    } else {
      const mat = MATERIALS.find((m) => m.id === sel.value)!;
      const params: Record<string, number> = {};
      for (const p of mat.params) params[p.key] = p.default;
      layer.material = { id: mat.id, params, lightAngle: Math.PI * 0.25 };
    }
    app.requestRender();
    app.rebuildUI();
  };
  row.appendChild(sel);
  root.appendChild(row);

  if (layer.material) {
    const mat = MATERIALS.find((m) => m.id === layer.material!.id)!;
    for (const p of mat.params) {
      slider(root, p.label, layer.material.params[p.key], p.min, p.max, p.step, (v) => {
        layer.material!.params[p.key] = v;
        app.requestRender();
      });
    }
    slider(root, "Light angle", layer.material.lightAngle, 0, Math.PI * 2, 0.01, (v) => {
      layer.material!.lightAngle = v;
      app.requestRender();
    });
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

function slider(
  root: HTMLElement,
  label: string,
  value: number,
  min: number,
  max: number,
  step: number,
  onChange: (v: number) => void
): void {
  const row = document.createElement("div");
  row.className = "row";
  const lab = document.createElement("label");
  lab.textContent = label;
  const r = document.createElement("input");
  r.type = "range";
  r.min = String(min);
  r.max = String(max);
  r.step = String(step);
  r.value = String(value);
  const val = document.createElement("span");
  val.className = "val";
  val.textContent = fmt(value);
  r.oninput = () => {
    const v = Number(r.value);
    val.textContent = fmt(v);
    onChange(v);
  };
  row.appendChild(lab);
  row.appendChild(r);
  row.appendChild(val);
  root.appendChild(row);
}

function numberRow(root: HTMLElement, label: string, value: number, onChange: (v: number) => void): void {
  const row = document.createElement("div");
  row.className = "row";
  const lab = document.createElement("label");
  lab.textContent = label;
  const inp = document.createElement("input");
  inp.type = "number";
  inp.value = String(value);
  inp.oninput = () => onChange(Number(inp.value));
  row.appendChild(lab);
  row.appendChild(inp);
  root.appendChild(row);
}

function fmt(v: number): string {
  return Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(2);
}

function rgbToHex(c: [number, number, number]): string {
  const h = (n: number) => Math.round(n * 255).toString(16).padStart(2, "0");
  return `#${h(c[0])}${h(c[1])}${h(c[2])}`;
}
function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
