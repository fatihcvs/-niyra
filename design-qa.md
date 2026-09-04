# Design QA — University logo catalog

## Scope

- Requested change: replace abbreviation-only university marks with verified institution logos wherever a reliable internet source exists.
- Reference: `C:/Users/fatih/AppData/Local/Temp/codex-clipboard-1342ab0c-76bd-4353-95c6-5b3fb85128a2.png`
- Desktop implementation: `D:/-niyra-main/.sites-runtime/university-logos/university-logos-implementation-desktop.png`
- Mobile implementation: `D:/-niyra-main/.sites-runtime/university-logos/university-logos-implementation-mobile.png`
- Combined comparison: `D:/-niyra-main/.sites-runtime/university-logos/university-logos-implementation-comparison.png`

## Comparison setup

- Reference and implementation viewport: 1173 × 881 CSS px, device scale factor 1.
- State: authenticated student with incomplete onboarding, university-selection step 1/5, Ondokuz Mayıs Üniversitesi selected, empty search.
- Focus: university mark proportions, card alignment, selection state, text truncation, list density, and responsive behavior.
- The reference and implementation were placed side by side in one comparison image before judging visible differences.

## Verified result

- Desktop cards preserve the original 47 × 47 px mark slot, two-column layout, card height, selection control, and scroll region.
- Every visible desktop university logo loaded successfully: 10/10 visible logo images, with no horizontal overflow.
- Mobile switches to one column, uses 43 × 43 px marks, retains readable names and controls, and has no horizontal overflow at 390 × 844.
- AUCY search returns its official logo asset and the logo loads successfully.
- The explicit fallback for Uluslararası Alasya Üniversitesi contains no image and displays the `UA` initials, avoiding an unverified mark.
- The catalog contains 241 institutions, 240 verified logo mappings, 237 optimized WebP files, and one deliberate initials fallback. Three campus entries reuse their parent institution logo.
- The final onboarding campus card also uses the selected university logo with the same initials fallback behavior.
- Source logos remain undistorted through `object-fit: contain`, a white safety field, and local 160 × 160 WebP normalization.
- No university-logo resource returned an HTTP error. The pre-existing Vinext development font-path 404 responses remain isolated to generated font URLs and do not affect logo rendering.

## QA findings

- P0: none.
- P1: none.
- P2: none.
- P3: none.
- The visual change is intentionally limited to replacing colored abbreviation tiles with real institution marks; surrounding onboarding layout and interactions remain consistent with the reference.

final result: passed
