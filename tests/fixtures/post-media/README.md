# Image metadata fixtures

These are newly generated 7 × 5 solid-color images, not user uploads or copied artwork. Encoded once on 2026-09-05 with locally installed Sharp 0.34.5 (libvips); tests read the committed bytes and have no Sharp dependency. The runtime parser never imports Sharp or decodes/re-encodes an upload.

Input: `sharp({ create: { width: 7, height: 5, channels: 4, background: { r: 101, g: 72, b: 232, alpha: 0.6 } } })`.

Variants: `.png()`, `.jpeg()`, `.jpeg({ progressive: true })`, `.removeAlpha().webp()`, `.webp({ lossless: true })`, `.webp()`. `orientation6` variants add `.withMetadata({ orientation: 6 })` before encoding, yielding display dimensions 5 × 7. Each was independently decoded with Sharp `.rotate().raw().toBuffer({ resolveWithObject: true })` to confirm output dimensions when generated.

Animated WebP: two 7 × 5 RGB frames (violet/red color variants), encoded from stacked raw input `{ width: 7, height: 10, channels: 3, pageHeight: 5 }`, `.webp({ loop: 0, delay: [200, 200] })`. Its canvas is 7 × 5, not the stacked decoder buffer height 10.

JPEG tests also insert a tiny generated APP1 TIFF IFD0 directory into the real JPEG fixture to exercise both byte orders, non-default IFD offsets, eight orientation values and malformed offsets. Those mutations test header behavior, not successful pixel decoding.
