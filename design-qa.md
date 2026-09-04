# Interactive Course Hub Design QA

- Source visual truth: `C:/Users/fatih/AppData/Local/Temp/codex-clipboard-2d65d554-f4d2-4b76-b7b6-845f96da1978.png`
- Browser-rendered implementation: `iab://tab-8/local-course-hub-desktop` and `iab://tab-9/local-course-hub-mobile`
- Viewports: desktop 1294 x 912 CSS px; mobile 390 x 844 CSS px
- Pixel normalization: source 721 x 226 px at 1x; desktop focused section 593 x 242 CSS px at 1x; mobile viewport 390 x 844 CSS px at 1x
- State: authenticated dashboard, dark theme inherited from the current user preference; source capture uses light theme. Theme-independent layout, typography hierarchy, image crop, controls and interactions were compared. The move from glyph-only icons to representative course images is the user-requested design change.

## Findings

- No actionable P0, P1 or P2 findings remain.
- The initial dark-theme pass exposed insufficient contrast in the sticky course-dialog header. Its background, border and close control were moved to dark-theme tokens and the revised detail view was re-captured with a readable title.
- P3 only: the source shows four courses while the active QA profile contains three. This is profile data, not a layout or implementation mismatch; the horizontal/mobile and adaptive/desktop layouts support up to the profile course limit.

## Full-view comparison evidence

- The section preserves the source hierarchy: eyebrow and question at top left, working `Tümünü gör` action at top right, evenly distributed course choices below.
- The representative images use dedicated 3:2 assets with consistent crop, rounded corners, real image content and compact verified-note counters.
- Desktop rhythm remains aligned with the surrounding feed card and right rail. The section has no clipping or horizontal overflow at 1294 x 912.
- At 390 x 844, course cards remain readable in a horizontal row, the fixed navigation stays available, and the detail dialog fits the viewport with full-width actions.

## Focused region comparison evidence

- Typography: existing Geist family, hierarchy, optical weights and small-label legibility are retained; course names wrap without overlap.
- Spacing and layout: source card padding and top-row alignment are retained, while image cards use a slightly larger footprint required by the new visual assets.
- Colors and tokens: violet, coral, blue and amber accents remain consistent; light and dark surfaces use existing application tokens.
- Image quality: four original 1536 x 1024 ImageGen assets were exported as optimized JPEGs; crops are sharp, unstretched and contain no generated text.
- Copy: the original section copy remains intact. Detail views explicitly disclose `Temsili ders kapağı` so generated visuals cannot be mistaken for official course material.

## Primary interactions tested

- Clicking an individual course opens its course center.
- `Tümünü gör` opens the complete current-semester course directory.
- Selecting a course in the directory opens that course's detail view.
- `Notları gör` opens Notes with the originating course selected and curated results filtered.
- `Akışta paylaş` focuses the composer and shows the selected course context; publishing uses that course id.
- Close buttons, backdrop close and Escape close the overlays.
- Desktop and mobile browser console checks returned no errors or warnings.

## Comparison history

1. Initial pass: visual cards, directory and both downstream actions worked. P2 dark-theme header contrast was found in the detail dialog.
2. Fix: added dark-theme header, border and close-control surfaces.
3. Revised pass: title and actions were readable on desktop and mobile; no P0/P1/P2 findings remained.

## Implementation checklist

- [x] Replace decorative text glyphs with representative course images.
- [x] Replace fabricated counters with actual curated-note and feed-post counts.
- [x] Make every dashboard course card interactive.
- [x] Make `Tümünü gör` interactive.
- [x] Connect course details to filtered notes and course-aware publishing.
- [x] Verify 1294 x 912 desktop and 390 x 844 mobile layouts.
- [x] Verify light/dark-compatible dialog surfaces and console state.

## Follow-up polish

- None required for this scoped course-hub update.

final result: passed
