/**
 * A document selection, rasterized on a 2D canvas (white = selected) and uploaded as a
 * single-channel-ish mask texture. Destructive tools multiply their coverage by this mask
 * so edits stay inside the selection. Coordinates are accepted in document px, y-up.
 */
import { GLTexture } from "../engine/texture";

export class Selection {
  active = false;
  width: number;
  height: number;
  texture: GLTexture;
  private cv: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.cv = document.createElement("canvas");
    this.cv.width = width;
    this.cv.height = height;
    this.g = this.cv.getContext("2d", { willReadFrequently: true })!;
    this.texture = new GLTexture(width, height);
    this.clear();
  }

  /** Convert y-up doc Y to canvas (y-down) Y. */
  private cy(y: number): number {
    return this.height - y;
  }

  private begin(): void {
    this.g.clearRect(0, 0, this.width, this.height);
    this.g.fillStyle = "#000";
    this.g.fillRect(0, 0, this.width, this.height);
    this.g.fillStyle = "#fff";
  }

  private commit(): void {
    this.texture.upload(this.cv, this.width, this.height);
    this.active = true;
  }

  setRect(x: number, y: number, w: number, h: number): void {
    this.begin();
    // Normalize and convert to y-down.
    const x0 = Math.min(x, x + w);
    const yTop = this.cy(Math.max(y, y + h));
    this.g.fillRect(x0, yTop, Math.abs(w), Math.abs(h));
    this.commit();
  }

  setEllipse(x: number, y: number, w: number, h: number): void {
    this.begin();
    const cx = x + w / 2;
    const cyc = this.cy(y + h / 2);
    this.g.beginPath();
    this.g.ellipse(cx, cyc, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2);
    this.g.fill();
    this.commit();
  }

  setPolygon(points: { x: number; y: number }[]): void {
    if (points.length < 3) {
      this.clear();
      return;
    }
    this.begin();
    this.g.beginPath();
    this.g.moveTo(points[0].x, this.cy(points[0].y));
    for (let i = 1; i < points.length; i++) this.g.lineTo(points[i].x, this.cy(points[i].y));
    this.g.closePath();
    this.g.fill();
    this.commit();
  }

  /** Set the selection from a precomputed coverage buffer (RGBA, y-down). */
  setCoverage(rgba: Uint8ClampedArray): void {
    const img = this.g.createImageData(this.width, this.height);
    img.data.set(rgba);
    this.g.putImageData(img, 0, 0);
    this.commit();
  }

  selectAll(): void {
    this.begin();
    this.g.fillRect(0, 0, this.width, this.height);
    this.commit();
  }

  clear(): void {
    this.begin();
    this.texture.upload(this.cv, this.width, this.height);
    this.active = false;
  }
}
