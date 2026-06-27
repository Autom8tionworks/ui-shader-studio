/** Layers panel: list (front-to-back), visibility, opacity, blend mode, reorder, add/delete. */
import { App } from "./app";
import { BlendMode, BLEND_MODE_NAMES } from "../core/blendModes";

export function buildLayersPanel(root: HTMLElement, app: App): void {
  root.innerHTML = "";

  const head = document.createElement("div");
  head.className = "panel-head";
  head.textContent = "Layers";
  root.appendChild(head);

  const actions = document.createElement("div");
  actions.className = "section-actions";
  actions.appendChild(button("+ Layer", () => app.addBlankLayer(), "Add a new blank layer on top"));
  actions.appendChild(button("Delete", () => app.deleteActiveLayer(), "Delete the active layer (undoable)"));
  actions.appendChild(button("Raise", () => reorder(app, 1), "Move the active layer up the stack"));
  actions.appendChild(button("Lower", () => reorder(app, -1), "Move the active layer down the stack"));
  root.appendChild(actions);

  // Front layer (end of array) shown first.
  const layers = [...app.doc.layers].reverse();
  for (const layer of layers) {
    const el = document.createElement("div");
    el.className = "layer" + (layer.id === app.doc.activeLayerId ? " active" : "");
    el.onclick = () => {
      app.doc.activeLayerId = layer.id;
      app.rebuildUI();
    };

    const eye = document.createElement("span");
    eye.className = "eye" + (layer.visible ? " on" : "");
    eye.title = layer.visible ? "Hide layer" : "Show layer";
    eye.textContent = layer.visible ? "◉" : "○";
    eye.onclick = (e) => {
      e.stopPropagation();
      layer.visible = !layer.visible;
      app.requestRender();
      app.rebuildUI();
    };
    el.appendChild(eye);

    const name = document.createElement("span");
    name.className = "name";
    name.textContent = layer.name;
    name.title = "Click the row to make this the active layer";
    el.appendChild(name);

    root.appendChild(el);

    if (layer.id === app.doc.activeLayerId) {
      root.appendChild(opacityRow(app, layer));
      root.appendChild(blendRow(app, layer));
    }
  }
}

function reorder(app: App, dir: -1 | 1): void {
  if (app.doc.activeLayer) app.doc.moveLayer(app.doc.activeLayer.id, dir);
  app.requestRender();
  app.rebuildUI();
}

function opacityRow(app: App, layer: { opacity: number }): HTMLElement {
  const row = document.createElement("div");
  row.className = "row";
  row.innerHTML = `<label>Opacity</label>`;
  row.title = "How opaque this layer is over the layers below";
  const r = document.createElement("input");
  r.type = "range";
  r.min = "0";
  r.max = "100";
  r.value = String(Math.round(layer.opacity * 100));
  const val = document.createElement("span");
  val.className = "val";
  val.textContent = r.value;
  r.oninput = () => {
    layer.opacity = Number(r.value) / 100;
    val.textContent = r.value;
    app.requestRender();
  };
  row.appendChild(r);
  row.appendChild(val);
  return row;
}

function blendRow(app: App, layer: { blendMode: BlendMode }): HTMLElement {
  const row = document.createElement("div");
  row.className = "row";
  row.innerHTML = `<label>Blend</label>`;
  row.title = "Blend mode — how this layer mixes with layers below";
  const sel = document.createElement("select");
  for (const k of Object.keys(BLEND_MODE_NAMES)) {
    const mode = Number(k) as BlendMode;
    const opt = document.createElement("option");
    opt.value = k;
    opt.textContent = BLEND_MODE_NAMES[mode];
    if (mode === layer.blendMode) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.onchange = () => {
    layer.blendMode = Number(sel.value) as BlendMode;
    app.requestRender();
  };
  row.appendChild(sel);
  return row;
}

function button(label: string, onClick: () => void, tip?: string): HTMLButtonElement {
  const b = document.createElement("button");
  b.className = "ghost";
  b.textContent = label;
  b.title = tip ?? label;
  b.onclick = onClick;
  return b;
}
