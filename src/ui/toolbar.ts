/** Left tool rail. Each tool is an icon button; selecting one rebuilds the properties panel. */
import { App } from "./app";

const ICONS: Record<string, string> = {
  brush:
    '<path d="M4 20s1-4 4-4c2 0 3 2 3 2M14 7l3 3M20 4l-9 9-3 1 1-3 9-9c.5-.5 1.5-.5 2 0s.5 1.5 0 2z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  eraser:
    '<path d="M5 14l5 5h7M7 16l8-8 5 5-6 6M15 8l-4-4-6 6 4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
  transform:
    '<path d="M4 9V4h5M20 15v5h-5M15 4h5v5M9 20H4v-5M9 9h6v6H9z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  crop:
    '<path d="M6 2v16h16M2 6h16v16M6 6h12v12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>'
};

const TOOLS = [
  { id: "brush", title: "Brush (B)" },
  { id: "eraser", title: "Eraser (E)" },
  { id: "transform", title: "Transform (V)" },
  { id: "crop", title: "Crop (C)" }
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
