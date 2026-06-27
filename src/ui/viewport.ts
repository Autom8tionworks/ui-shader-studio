/**
 * Owns the canvas element: keeps the drawing buffer matched to the display size, maps
 * pointer events into document space, and handles input:
 *  - mouse: space/middle-drag = pan, wheel = zoom, left = tool.
 *  - touch: one finger = tool, two fingers = pan + pinch-zoom.
 */
import { App } from "./app";
import { PointerInfo } from "../tools/tool";

interface Pt { x: number; y: number; }

export class Viewport {
  private spaceDown = false;
  private panning = false;
  private lastPan = { x: 0, y: 0 };

  // Multi-touch tracking.
  private pointers = new Map<number, Pt>();
  private gesture: { active: boolean; a: number; b: number; lastMid: Pt; lastDist: number } | null = null;
  private toolPointerId: number | null = null;
  private lastToolInfo: PointerInfo | null = null;
  private suppressTool = false;

  constructor(private canvas: HTMLCanvasElement, private app: App) {
    canvas.addEventListener("pointerdown", (e) => this.onDown(e));
    window.addEventListener("pointermove", (e) => this.onMove(e));
    window.addEventListener("pointerup", (e) => this.onUp(e));
    window.addEventListener("pointercancel", (e) => this.onUp(e));
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
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Second finger → start a pan/zoom gesture, cancelling any in-progress tool stroke.
    if (this.pointers.size >= 2 && (!this.gesture || !this.gesture.active)) {
      if (this.toolPointerId !== null && this.lastToolInfo) {
        this.app.dispatchPointer("up", this.lastToolInfo);
        this.toolPointerId = null;
      }
      this.panning = false;
      this.startGesture();
      this.suppressTool = true;
      return;
    }
    if (this.gesture && this.gesture.active) return;

    if (this.spaceDown || e.button === 1) {
      this.panning = true;
      this.lastPan = { x: e.clientX, y: e.clientY };
      return;
    }
    if (this.suppressTool) return;

    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* capture is optional; window listeners still handle the drag */ }
    this.toolPointerId = e.pointerId;
    const i = this.info(e);
    this.lastToolInfo = i;
    this.app.dispatchPointer("down", i);
  }

  private onMove(e: PointerEvent): void {
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this.gesture && this.gesture.active && this.pointers.size >= 2) {
      this.updateGesture();
      return;
    }
    if (this.panning) {
      const dpr = this.dpr();
      this.app.view.panX += (e.clientX - this.lastPan.x) * dpr;
      this.app.view.panY += (e.clientY - this.lastPan.y) * dpr;
      this.lastPan = { x: e.clientX, y: e.clientY };
      this.app.requestRender();
      return;
    }
    if (this.suppressTool || (this.gesture && this.gesture.active)) return;
    if (this.toolPointerId !== null && this.toolPointerId !== e.pointerId) return;
    const i = this.info(e);
    this.lastToolInfo = i;
    this.app.dispatchPointer("move", i);
  }

  private onUp(e: PointerEvent): void {
    this.pointers.delete(e.pointerId);

    if (this.gesture && this.gesture.active) {
      if (this.pointers.size < 2) this.gesture.active = false;
      if (this.pointers.size === 0) this.suppressTool = false;
      return;
    }
    if (this.panning) {
      this.panning = false;
      return;
    }
    if (this.suppressTool) {
      if (this.pointers.size === 0) this.suppressTool = false;
      return;
    }
    if (this.toolPointerId === e.pointerId) {
      this.app.dispatchPointer("up", this.info(e));
      this.toolPointerId = null;
    }
  }

  private twoPoints(): [Pt, Pt] | null {
    const ids = [...this.pointers.keys()];
    if (ids.length < 2) return null;
    return [this.pointers.get(ids[0])!, this.pointers.get(ids[1])!];
  }

  private startGesture(): void {
    const pts = this.twoPoints();
    if (!pts) return;
    const ids = [...this.pointers.keys()];
    this.gesture = {
      active: true,
      a: ids[0],
      b: ids[1],
      lastMid: mid(pts[0], pts[1]),
      lastDist: dist(pts[0], pts[1])
    };
  }

  private updateGesture(): void {
    const pts = this.twoPoints();
    if (!pts || !this.gesture) return;
    const m = mid(pts[0], pts[1]);
    const d = dist(pts[0], pts[1]);
    const dpr = this.dpr();
    // pinch zoom
    if (this.gesture.lastDist > 1) {
      const ratio = d / this.gesture.lastDist;
      this.app.view.zoom = Math.max(0.05, Math.min(16, this.app.view.zoom * ratio));
    }
    // two-finger pan
    this.app.view.panX += (m.x - this.gesture.lastMid.x) * dpr;
    this.app.view.panY += (m.y - this.gesture.lastMid.y) * dpr;
    this.gesture.lastMid = m;
    this.gesture.lastDist = d;
    this.app.requestRender();
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.0015);
    this.app.view.zoom = Math.max(0.05, Math.min(16, this.app.view.zoom * factor));
    this.app.requestRender();
  }
}

function mid(a: Pt, b: Pt): Pt {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
