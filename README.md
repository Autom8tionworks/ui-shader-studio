# Shader Studio

A Photoshop-style image editor where the **entire imaging pipeline runs on the GPU** via
WebGL2 and custom GLSL shaders. Vanilla TypeScript, no rendering framework.

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the design.

## Run it

```bash
npm install
npm run dev
```

Then open the URL Vite prints (defaults to http://localhost:5173).

## What works in this v1

- **GPU render core** — WebGL2 context, program cache, ping-pong render targets, a single
  fullscreen-quad pass abstraction that every imaging op is built on.
- **Layers + compositing** — multiple layers, per-layer opacity, visibility, and 12 blend
  modes composited entirely on the GPU.
- **Non-destructive adjustments** — brightness/contrast, hue/saturation/lightness, invert,
  and a separable Gaussian blur, applied as shader passes that never touch the source.
- **Brush engine** — soft round brush painting straight into a layer's texture, with size,
  hardness, opacity, and color. Strokes interpolate stamps so they stay smooth.
- **Transform & crop** — move / scale / rotate the active layer; crop the document.
- **Material presets** — real-time **glass, plastic, metal, matte** shaders that light the
  layer from a luminance-derived normal field. Add new looks by registering one shader.
- **UI shell** — toolbar, layers panel, contextual properties panel, pan/zoom viewport.
- **Export** — flatten and download the canvas as a PNG.

## Project layout

```
src/engine   GPU primitives (context, textures, passes, shaders)
src/core     Document / Layer model, compositor, blend modes, history
src/tools    Brush, transform/crop tools
src/ui       App shell, viewport, panels
```

## Controls

- **Space + drag** or middle-drag — pan. **Scroll** — zoom.
- Pick a tool on the left; its options appear in the Properties panel.
- Brush: drag on the canvas. Adjustments: drag the sliders (live, non-destructive).
