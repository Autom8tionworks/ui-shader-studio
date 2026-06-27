/**
 * Bottom animation dock: transport (play/pause/stop), duration/fps, an "add channel"
 * picker for the active layer's animatable properties, per-channel keyframe tracks, a
 * scrubbable ruler with a moving playhead, and the WebM export button.
 */
import { App } from "./app";
import { availableTargets, Channel } from "../core/timeline";

export function buildTimeline(root: HTMLElement, app: App): void {
  root.innerHTML = "";
  const tl = app.timeline;

  // ---- transport bar ----
  const bar = document.createElement("div");
  bar.className = "tl-bar";

  const play = btn(tl.playing ? "⏸" : "▶", "tl-btn", () => {
    if (!tl.playing && tl.time >= tl.duration) tl.time = 0;
    tl.playing = !tl.playing;
    app.requestRender();
    app.rebuildUI();
  });
  const stop = btn("⏹", "tl-btn", () => {
    tl.playing = false;
    tl.time = 0;
    tl.evaluate(app.doc, 0);
    app.updateTimelinePlayhead();
    app.requestRender();
    app.rebuildUI();
  });
  const time = document.createElement("span");
  time.id = "tl-time";
  time.className = "tl-time";
  time.textContent = `${tl.time.toFixed(2)} / ${tl.duration.toFixed(1)}s`;

  bar.append(play, stop, time, sep());
  bar.append(numField("Dur", tl.duration, 0.5, 120, 0.5, (v) => { tl.duration = v; app.rebuildUI(); }));
  bar.append(numField("FPS", tl.fps, 1, 60, 1, (v) => { tl.fps = Math.round(v); app.rebuildUI(); }));
  bar.append(check("Loop", tl.loop, (on) => { tl.loop = on; }));
  bar.append(sep());

  // add-channel picker
  const layer = app.doc.activeLayer;
  const sel = document.createElement("select");
  sel.className = "tl-select";
  const targets = layer ? availableTargets(layer) : [];
  if (!layer || targets.length === 0) {
    const o = document.createElement("option");
    o.textContent = "— no animatable props —";
    sel.appendChild(o);
    sel.disabled = true;
  } else {
    targets.forEach((t, i) => {
      const o = document.createElement("option");
      o.value = String(i);
      o.textContent = t.label;
      sel.appendChild(o);
    });
  }
  bar.appendChild(sel);
  bar.append(btn("+ Channel", "tl-btn", () => {
    if (!layer || targets.length === 0) return;
    const t = targets[Number(sel.value || 0)];
    // avoid duplicate channel for same target
    const exists = tl.channels.some(
      (c) => c.layerId === layer.id && JSON.stringify(c.target) === JSON.stringify(t.target)
    );
    if (!exists) {
      const ch = tl.addChannel(layer.id, `${layer.name}: ${t.label}`, t.target, t.min, t.max);
      tl.addKeyframe(app.doc, ch, tl.time);
    }
    app.rebuildUI();
  }));

  bar.append(sep());
  bar.append(btn("⬇ Export Video", "tl-btn primary-btn", () => void app.exportVideo()));
  root.appendChild(bar);

  // ---- tracks ----
  const body = document.createElement("div");
  body.className = "tl-body";

  // ruler (scrub)
  const ruler = document.createElement("div");
  ruler.className = "tl-ruler";
  ruler.onpointerdown = (e) => scrub(e, ruler, app);
  body.appendChild(ruler);

  for (const ch of tl.channels) {
    body.appendChild(channelRow(ch, app));
  }
  if (tl.channels.length === 0) {
    const hint = document.createElement("div");
    hint.className = "tl-hint";
    hint.textContent =
      "Add a channel from a layer property, scrub the playhead, change the value, then ‘Key’ to set a keyframe. Press ▶ to preview, Export Video to save a WebM.";
    body.appendChild(hint);
  }

  const playhead = document.createElement("div");
  playhead.id = "tl-playhead";
  playhead.className = "tl-playhead";
  body.appendChild(playhead);

  root.appendChild(body);
  app.updateTimelinePlayhead();
}

function channelRow(ch: Channel, app: App): HTMLElement {
  const tl = app.timeline;
  const row = document.createElement("div");
  row.className = "tl-row";

  const label = document.createElement("div");
  label.className = "tl-label";
  const name = document.createElement("span");
  name.textContent = ch.label;
  name.className = "tl-name";
  label.appendChild(name);
  label.append(btn("Key", "tl-mini", () => { tl.addKeyframe(app.doc, ch, tl.time); app.rebuildUI(); }));
  label.append(btn("✕", "tl-mini", () => { tl.removeChannel(ch.id); app.rebuildUI(); }));
  row.appendChild(label);

  const track = document.createElement("div");
  track.className = "tl-track";
  track.onpointerdown = (e) => {
    if ((e.target as HTMLElement).classList.contains("tl-key")) return;
    scrub(e, track, app);
  };
  ch.keys.forEach((k, i) => {
    const d = document.createElement("div");
    d.className = "tl-key";
    d.style.left = `${(k.t / Math.max(tl.duration, 1e-3)) * 100}%`;
    d.title = `t=${k.t.toFixed(2)}s  v=${k.v.toFixed(3)} (click to delete)`;
    d.onpointerdown = (e) => {
      e.stopPropagation();
      tl.removeKeyframe(ch, i);
      app.rebuildUI();
    };
    track.appendChild(d);
  });
  row.appendChild(track);
  return row;
}

function scrub(e: PointerEvent, el: HTMLElement, app: App): void {
  const tl = app.timeline;
  const rect = el.getBoundingClientRect();
  const move = (clientX: number) => {
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    tl.time = frac * tl.duration;
    tl.evaluate(app.doc, tl.time);
    app.updateTimelinePlayhead();
    app.requestRender();
  };
  move(e.clientX);
  const onMove = (ev: PointerEvent) => move(ev.clientX);
  const onUp = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
}

// ---- tiny local DOM helpers ----
function btn(text: string, cls: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.className = cls;
  b.textContent = text;
  b.onclick = onClick;
  return b;
}
function sep(): HTMLElement {
  const s = document.createElement("span");
  s.className = "tl-sep";
  return s;
}
function numField(label: string, value: number, min: number, max: number, step: number, onChange: (v: number) => void): HTMLElement {
  const wrap = document.createElement("label");
  wrap.className = "tl-num";
  wrap.append(document.createTextNode(label));
  const inp = document.createElement("input");
  inp.type = "number";
  inp.min = String(min);
  inp.max = String(max);
  inp.step = String(step);
  inp.value = String(value);
  inp.onchange = () => {
    let v = Number(inp.value);
    if (isNaN(v)) v = min;
    v = Math.max(min, Math.min(max, v));
    onChange(v);
  };
  wrap.appendChild(inp);
  return wrap;
}
function check(label: string, value: boolean, onChange: (v: boolean) => void): HTMLElement {
  const wrap = document.createElement("label");
  wrap.className = "tl-check";
  const inp = document.createElement("input");
  inp.type = "checkbox";
  inp.checked = value;
  inp.onchange = () => onChange(inp.checked);
  wrap.appendChild(inp);
  wrap.append(document.createTextNode(label));
  return wrap;
}
