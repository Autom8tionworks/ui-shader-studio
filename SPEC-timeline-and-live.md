# Spec — Animation Timeline + Live Input Layers

Two features that lean into Shader Studio's differentiator (a real-time, programmable GPU
pipeline) and turn it from a still-image editor into a motion + live-video tool.

## 1. Animation Timeline & Video Export

### Goal
Keyframe any numeric layer property over time, preview it live, and export the result —
including all the already-animated effects (liquid glass, ShaderToy `iTime`, live video) —
as a WebM video.

### Data model (`src/core/timeline.ts`)
- **Timeline**: `duration` (s), `fps`, `time` (playhead), `playing`, `loop`, and a list of
  `channels`. `advance(dt)` moves the playhead (looping or firing `onComplete`); `evaluate(doc, t)`
  writes every channel's interpolated value back onto its layer.
- **Channel**: targets one numeric property via a serialisable `ChannelTarget`:
  `opacity` | `shaderMix` | `liquidGlass.<param>` | `material.<param>` | `adjust[i].<param>`.
  Holds `keys: {t, v}[]`.
- **Interpolation**: piecewise between keyframes with smoothstep easing; clamped to the first/last
  key outside their range. (Linear/stepped/bezier are a natural follow-up.)
- `availableTargets(layer)` enumerates what the active layer can currently animate, so the UI only
  offers valid channels.

Targets are described by data (not closures), so the whole timeline is JSON-serialisable — this is
the hook for the future "parametric project file" feature.

### Playback (`src/ui/app.ts` render loop)
The existing dirty-driven loop gains a block: when `timeline.playing`, it advances the playhead,
evaluates channels onto the document, moves the DOM playhead, and forces a redraw. Liquid-glass /
shader `iTime` and live-video frames keep advancing independently, so they're captured in sync.

### UI (`src/ui/timelinePanel.ts`, bottom dock)
- Transport: play/pause, stop (reset to 0), live `time / duration` readout.
- Duration & FPS fields, Loop toggle.
- "+ Channel" picker populated from `availableTargets(activeLayer)`; adding a channel drops a first
  keyframe at the playhead.
- Per-channel track with draggable-to-seek ruler and keyframe **diamonds** (click a diamond to
  delete). "Key" records a keyframe at the current playhead using the property's current value;
  "✕" removes the channel.
- A red **playhead** line spans all tracks, aligned to the track column.

### Workflow
Add a channel → scrub the playhead → change the value with the normal right-panel sliders →
click **Key** → repeat at another time → press ▶ to preview → **Export Video**.

### Export (`src/core/videoExport.ts`)
`canvas.captureStream(fps)` + `MediaRecorder` (VP9 → VP8 → generic WebM). `exportVideo()` resets the
timeline, plays one non-looping pass, records the live canvas, and downloads `shader-studio.webm`.
Because it records the actual canvas, everything visible — keyframed params, liquid glass, shader
filters, webcam — is in the video. Requires a Chromium browser (feature-detected; alerts otherwise).

### Limits / follow-ups
- Real-time capture (not deterministic offline render) — fine for v1; offline frame-accurate export
  is a later upgrade.
- Easing is smoothstep-only; add a curve editor later.
- Audio isn't recorded.

## 2. Live Input Layers (Webcam / Video)

### Goal
Use a webcam or a video file as a layer whose pixels update every frame, so the GPU effect stack
(adjustments, material, **liquid glass**, **ShaderToy filter**) runs on live input — i.e. a
real-time **lens authoring** studio.

### Model (`src/core/layer.ts`)
- `Layer.liveSource: LiveSource | null` where `LiveSource = { kind: "camera"|"video", video,
  canvas, stream?, url? }`.
- `Layer.updateLiveTexture()` draws the current video frame contain-fit onto a document-sized canvas
  and uploads it to the layer texture (Y-flipped to match the rest of the pipeline). Called every
  tick for live layers.
- `dispose()` stops camera tracks and revokes object URLs.

### App (`src/ui/app.ts`)
- `addWebcamLayer()` → `getUserMedia({video})`, creates a live layer (undoable).
- `addVideoLayerDialog()` / `addVideoLayer(file)` → looping muted `<video>` from an object URL.
- The render loop calls `updateLiveTexture()` for every live layer and keeps redrawing.
- Topbar buttons **Webcam** and **Video…**.

### Why it's powerful
A webcam layer + a saved ShaderToy preset + `iMouse` reactivity = a Snapchat-style lens builder in
the browser. Add a keyframed timeline on top and you can record a filtered video clip end-to-end,
none of which mainstream editors (Photoshop/Photopea) do.

### Limits / follow-ups
- Painting on a live layer is overwritten each frame (expected; effects apply on top).
- No audio capture; webcam is video-only.
- Frame upload is a 2D-canvas draw + `texImage2D` per frame — fine at 30fps/720p; a zero-copy
  `texImage2D(video)` fast path is a later optimisation.
