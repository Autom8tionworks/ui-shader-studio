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
  /** Current view zoom (drawing-buffer px per document px) for screen-accurate hit-testing. */
  zoom: number;
  /** Switch back to the default Select/Move tool (after a one-shot tool). */
  returnToSelect: () => void;
}

export interface Tool {
  id: string;
  onPointerDown(p: PointerInfo, c: ToolContext): void;
  onPointerMove(p: PointerInfo, c: ToolContext): void;
  onPointerUp(p: PointerInfo, c: ToolContext): void;
}
