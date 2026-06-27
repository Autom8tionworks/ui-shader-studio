/** Left tool rail. Each tool is an icon button; selecting one rebuilds the properties panel. */
import { App } from "./app";

const ICONS: Record<string, string> = {
  transform: '<path d="M4 9V4h5M20 15v5h-5M15 4h5v5M9 20H4v-5M9 9h6v6H9z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  select: '<rect x="3.5" y="3.5" width="17" height="17" rx="1" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="3 2.5"/>',
  lasso: '<path d="M4 10c0-3.3 3.6-6 8-6s8 2.7 8 6-3.6 6-8 6c-1.6 0-2.2.9-2.2 2.1 0 1.3-1 2.4-2.3 2.4a2 2 0 0 1 0-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-dasharray="3 2.4"/>',
  crop: '<path d="M6 2v16h16M2 6h16v16M6 6h12v12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  eyedropper: '<path d="M19 3l2 2-9 9-3 1 1-3 9-9zM12 8l-7 7v3h3l7-7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  brush: '<path d="M4 20s1-4 4-4c2 0 3 2 3 2M20 4l-9 9-3 1 1-3 9-9c.5-.5 1.5-.5 2 0s.5 1.5 0 2z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  eraser: '<path d="M5 14l5 5h7M7 16l8-8 5 5-6 6M15 8l-4-4-6 6 4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
  fill: '<path d="M5 11l6-6 6 6-6 6-6-6zM17 13c1.5 2 2.5 3 2.5 4a2.5 2.5 0 0 1-5 0c0-1 1-2 2.5-4z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>',
  gradient: '<rect x="3.5" y="3.5" width="17" height="17" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M5 18L18 6" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>',
  text: '<path d="M5 6V4h14v2M12 4v16M9 20h6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
  shape: '<rect x="3.5" y="3.5" width="10" height="10" rx="1" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="15.5" cy="15.5" r="5" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  shader: '<path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" stroke-width="1.4" opacity="0.35"/><path d="M7 4l-3 8 3 8M17 4l3 8-3 8M14 4l-4 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>'
};

const TOOLS = [
  { id: "transform", title: "Select / Move objects (V)" },
  { id: "select", title: "Marquee — rectangular/elliptical region (M)" },
  { id: "lasso", title: "Lasso — magnetic edge selection (L)" },
  { id: "crop", title: "Crop (C)" },
  { id: "eyedropper", title: "Eyedropper (I)" },
  { id: "brush", title: "Brush (B)" },
  { id: "eraser", title: "Eraser (E)" },
  { id: "fill", title: "Fill / Bucket (K)" },
  { id: "gradient", title: "Gradient (G)" },
  { id: "text", title: "Text (T)" },
  { id: "shape", title: "Shape (U)" },
  { id: "shader", title: "Shader filter — ShaderToy (S)" }
];

export function buildToolbar(root: HTMLElement, app: App): void {
  root.innerHTML = "";
  for (const t of TOOLS) {
    const btn = document.createElement("button");
    btn.className = "tool-btn" + (app.currentToolId === t.id ? " active" : "");
    btn.title = t.title;
    btn.innerHTML = `<svg viewBox="0 0 24 24">${ICONS[t.id] ?? ""}</svg>`;
    btn.onclick = () => app.setTool(t.id);
    root.appendChild(btn);
  }
}
