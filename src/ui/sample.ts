/** Generates starter layer content so the app opens with something to edit. */
export function gradientLayer(w: number, h: number): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const g = cv.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, "#3a6ea5");
  grad.addColorStop(0.5, "#c0392b");
  grad.addColorStop(1, "#f39c12");
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  return cv;
}

export function shapesLayer(w: number, h: number): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const g = cv.getContext("2d")!;
  g.clearRect(0, 0, w, h);
  g.fillStyle = "rgba(255,255,255,0.95)";
  g.beginPath();
  g.arc(w * 0.35, h * 0.45, Math.min(w, h) * 0.18, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "rgba(40,40,60,0.9)";
  g.fillRect(w * 0.5, h * 0.3, w * 0.3, h * 0.32);
  g.font = `bold ${Math.floor(h * 0.16)}px system-ui`;
  g.fillStyle = "rgba(20,20,20,0.9)";
  g.textAlign = "center";
  g.fillText("SHADER", w * 0.5, h * 0.82);
  return cv;
}
