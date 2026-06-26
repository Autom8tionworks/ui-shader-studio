# Shader Studio — Architecture

A Photoshop-style image editor whose entire imaging pipeline runs on the GPU via
WebGL2 + custom GLSL shaders. Vanilla TypeScript, no rendering framework.

## Why a GPU pipeline

Photoshop's classic mechanics — layers, blend modes, non-destructive adjustments,
brushes — are all per-pixel operations. Doing them on the CPU (Canvas2D `getImageData`)
is too slow for a responsive UI at full resolution. Instead every pixel operation is a
**fragment shader pass** rendered into an offscreen texture. The CPU only manages state
(which layers exist, their parameters) and dispatches GPU passes.

## Core concepts

### 1. Everything is a texture
Each layer owns an RGBA texture (premultiplied alpha). The document keeps two
"scratch" textures used as a **ping-pong** pair: read from A, write to B, swap. This is
how we chain passes (adjustment → blend → next layer) without allocating per frame.

```
Layer N texture ──▶ [adjustment passes] ──▶ tmp ──▶ [blend onto accumulator] ──▶ accumulator
```

### 2. A "pass" is a fullscreen-quad draw
`runPass(program, inputs, target)` binds a target framebuffer, binds input textures to
samplers, draws one triangle covering the screen, and the fragment shader does the work.
All imaging ops (blend, blur, brightness, brush stamp, material shading) are just
different fragment shaders driving the same quad.

### 3. The compositor walks the layer stack
Bottom-to-top, for each visible layer it:
1. Runs that layer's adjustment stack into a temp texture (non-destructive).
2. Blends the result onto the accumulator using the layer's blend mode + opacity.
The final accumulator is drawn to the screen with the view transform (pan/zoom).

### 4. Non-destructive adjustments
Adjustments are *parameters on the layer*, not baked pixels. They re-run every composite.
This means changing "brightness" is instant and reversible — the source texture is never
modified. Brush strokes, by contrast, *are* destructive: they write into the layer texture.

### 5. Material presets are just shaders
"Glass", "plastic", "metal" etc. are fragment shaders that take the layer color plus a
derived height/normal field (from luminance) and apply lighting, refraction offset, and
specular highlights in real time. They're registered in a `MaterialRegistry` so new looks
are added by writing one shader + a parameter schema — no engine changes.

## Module map

```
src/
  engine/
    gl.ts          WebGL2 context, compile/link programs, fullscreen quad VAO
    texture.ts     GLTexture + Framebuffer wrappers, ping-pong RenderTarget pair
    pass.ts        runPass(): bind program + inputs + uniforms, draw quad
    shaders/
      quad.vert.ts  shared vertex shader (clip-space triangle, uv out)
      blend.ts      27 Photoshop blend modes in one shader (mode = uniform int)
      adjust.ts     brightness/contrast, hue/sat/lightness, levels, invert, blur (separable)
      brush.ts      soft-round brush stamp + stroke accumulation
      material.ts   glass / plastic / metal / matte real-time material shaders
  core/
    layer.ts       Layer: source texture, blend mode, opacity, adjustment stack
    document.ts    Document: size, layer list, scratch targets, active layer
    compositor.ts  composite(document) -> screen
    blendModes.ts  enum + names, kept in sync with blend.ts
    history.ts     command stack for undo/redo (snapshots of layer textures)
  tools/
    tool.ts        Tool interface (pointer down/move/up against document space)
    brushTool.ts   paints into the active layer texture via brush shader
    transformTool.ts move/scale/rotate the active layer, crop the document
  ui/
    app.ts         bootstraps engine + document + UI, owns the render loop
    viewport.ts    canvas, pan/zoom, pointer→document coordinate mapping
    toolbar.ts     tool selection (move, brush, transform, crop)
    layersPanel.ts layer list, add/delete, visibility, opacity, blend mode
    properties.ts  contextual panel: brush settings, adjustment sliders, material picker
  types.ts         shared types
  main.ts          entry
```

## Render loop

The loop is **dirty-driven**, not a constant 60fps spin. A `requestRender()` flag is set
on any state change (slider move, brush stamp, pan). Each animation frame, if dirty, the
compositor re-runs and clears the flag. Brush painting sets dirty on every pointer move so
strokes feel live.

## Data flow for one user action

*User drags the Brightness slider:*
1. `properties.ts` updates `activeLayer.adjustments['brightness'].value`.
2. Calls `requestRender()`.
3. Next frame, `compositor.composite()` re-runs the layer's adjustment chain with the new
   uniform and re-blends. Source texture untouched → fully non-destructive & instant.

*User paints a brush stroke:*
1. `brushTool` maps pointer to document UV, interpolates stamps between last and current
   point, and runs the brush shader **into the active layer's own texture** (destructive).
2. `requestRender()` → compositor shows the updated layer.

## Coordinate spaces
- **Screen px** — pointer events.
- **Document px** — layer/canvas pixels, via viewport pan/zoom inverse.
- **UV [0,1]** — what shaders sample in. `uv = docPx / docSize`.
- **Clip space** — the quad vertex shader output.

## Performance notes
- Premultiplied alpha throughout to make blending correct and cheap.
- Separable Gaussian blur (horizontal pass then vertical) — O(2r) not O(r²).
- Float (RGBA16F) targets when `EXT_color_buffer_float` is available, else RGBA8, to keep
  adjustment chains from banding.
- Textures reused; only (re)allocated on document resize.

## Roadmap beyond v1
- Layer masks (extra single-channel texture multiplied into alpha).
- Selections (marching-ants + mask-limited painting).
- Smart filters / adjustment layers as their own stack entries.
- WebGPU compute backend behind the same `Pass` interface for heavy filters.
- Tiled documents for >8k canvases.
- Export to PNG via `gl.readPixels` + un-premultiply.
