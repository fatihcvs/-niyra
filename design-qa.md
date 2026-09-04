# Design QA — Brand lockup size

## Scope

- Requested change: make the existing Üniyra logo lockup slightly larger without changing the asset, colors, or surrounding product behavior.
- Reference: `C:/Users/fatih/AppData/Local/Temp/codex-clipboard-90394eed-9c32-4267-a38e-71a92ab00362.png`
- Implementation capture: `D:/-niyra-main/.sites-runtime/logo-size/logo-implementation.png`
- Combined comparison: `D:/-niyra-main/.sites-runtime/logo-size/logo-comparison.png`

## Comparison setup

- Reference crop: 314 × 123 px.
- Implementation crop: 314 × 123 CSS px, device scale factor 1.
- State: unauthenticated desktop brand lockup on the existing light application surface.
- Focus: the shared `.brand`, `.brand-mark`, and `.brand-name` styles used across the app.

## Verified result

- Desktop brand mark: 38 × 38 px → 44 × 44 px.
- Desktop wordmark: 25 px → 28 px; weight remains 760.
- Desktop mark/name gap: 10 px → 11 px.
- Mobile brand mark: 29 × 29 px → 33 × 33 px.
- Mobile wordmark: 21 px → 23 px.
- Existing PNG logo asset, brand colors, float animation, alignment, and copy remain unchanged.
- Browser measurement: 1200 × 800 viewport, no horizontal overflow.
- Reference and implementation were reviewed together in the combined comparison image; the implementation is visibly larger while preserving the original lockup proportions and visual balance.
- Validation: TypeScript passed, scoped ESLint passed, production build passed, 150 automated tests passed, and the local runtime smoke flow passed against v1.6.19.

## QA findings

- P0: none.
- P1: none.
- P2: none.
- P3: none.
- Vinext-generated font URLs continue to return 404 in both development and Railway; the existing system-sans fallback remains active. This is a pre-existing font-pipeline issue and does not affect the logo sizing or logo PNG asset.
- The unauthenticated `/api/profile` request returns the expected 401 response on the sign-in screen.

final result: passed
