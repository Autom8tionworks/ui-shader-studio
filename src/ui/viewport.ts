/**
 * Owns the canvas element: keeps the drawing buffer matched to the display size, maps
 * pointer events into document space, and handles pan (space/middle drag) and zoom (wheel).
 */
import { App } from "./app";
import { PointerInfo } from "../tools/tool";

export class Viewport {
  private spaceDown = false;
  private panning = false;
  private lastPan = { x: 0, y: 0 };

  constructor(private canvas: HTMLCanvasElement, private app: App) {
    canvas.addEventListener("pointerdown", (e) => this.onDown(e));
    window.addEventListener("pointermove", (e) => this.onMove(e));
    window.addEventListener("pointerup", (e) => this.onUp(e));
    canvas.addEventListener("wheel", (e) => this.onWheel(e), { passive: false });
    window.addEventListener("keydown", (e) => {
      if (e.code === "Space") this.spaceDown = true;
    });
    window.addEventListener("keyup", (e) => {
      if (e.code === "Space") this.spaceDown = false;
    });
    window.addEventListener("resize", () => this.app.requestRender());
  }

  resizeToDisplay(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(this.canvas.clientWidth * dpr);
    const h = Math.round(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  private dpr(): number {
    return Math.min(window.devicePixelRatio || 1, 2);
  }

  /** Map a DOM pointer event to document-space pixels (y-up). */
  private toDoc(e: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const vw = this.canvas.width;
    const vh = this.canvas.height;
    const sx = vw / rect.width;
    const sy = vh / rect.height;
    const xGL = (e.clientX - rect.left) * sx;
    const yGL = (rect.height - (e.clientY - rect.top)) * sy;
    const { zoom, panX, panY } = this.app.view;
    const offX = (vw - this.app.doc.width * zoom) / 2 + panX;
    const offY = (vh - this.app.doc.height * zoom) / 2 - panY;
    return { x: (xGL - offX) / zoom, y: (yGL - offY) / zoom };
  }

  private info(e: PointerEvent): PointerInfo {
    const d = this.toDoc(e);
    return { x: d.x, y: d.y, pressure: e.pressure || 1, shift: e.shiftKey, alt: e.altKey };
  }

  private onDown(e: PointerEvent): void {
    if (this.spaceDown || e.button === 1) {
      this.panning = true;
      this.lastPan = { x: e.clientX, y: e.clientY };
      return;
    }
    this.canvas.setPointerCapture(e.pointerId);
    this.app.dispatchPointer("down", this.info(e));
  }

  private onMove(e: PointerEvent): void {
    if (this.panning) {
      const dpr = this.dpr();
      this.app.view.panX += (e.clientX - this.lastPan.x) * dpr;
      this.app.view.panY += (e.clientY - this.lastPan.y) * dpr;
      this.lastPan = { x: e.clientX, y: e.clientY };
      this.app.requestRender();
      return;
    }
    this.app.dispatchPointer("move", this.info(e));
  }

  private onUp(e: PointerEvent): void {
    if (this.panning) {
      this.panning = false;
      return;
    }
    this.app.dispatchPointer("up", this.info(e));
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.0015);
    this.app.view.zoom = Math.max(0.05, Math.min(16, this.app.view.zoom * factor));
    this.app.requestRender();
  }
}
