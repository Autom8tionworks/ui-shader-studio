/** Tool interface. Pointer coordinates are in DOCUMENT pixels (y-up), already mapped. */
import { Document } from "../core/document";
import { Layer } from "../core/layer";

export interface PointerInfo {
  /** Document-space position, y-up, in pixels. */
  x: number;
  y: number;
  pressure: number;
  shift: boolean;
  alt: boolean;
}

export interface ToolContext {
  doc: Document;
  requestRender: () => void;
  beginHistory: () => void;
  rebuildUI: () => void;
  /** Add a layer as an undoable action. */
  addLayer: (layer: Layer) => void;
}

export interface Tool {
  id: string;
  onPointerDown(p: PointerInfo, c: ToolContext): void;
  onPointerMove(p: PointerInfo, c: ToolContext): void;
  onPointerUp(p: PointerInfo, c: ToolContext): void;
}
