# Design QA — 患者电子建档

## Evidence

- Source visual truth:
  - `C:/Users/10622/Documents/WXWork/1688855009673707/Cache/Image/2026-08/bec59491-75d5-45d9-a8d6-bce7ed85e265.jpg` — 5712 × 4284 px.
  - `C:/Users/10622/Documents/WXWork/1688855009673707/Cache/Image/2026-08/3bf4c4bc-7737-419a-8f8e-61bf765c62f1.jpg` — 4032 × 3024 px.
  - `C:/Users/10622/Documents/WXWork/1688855009673707/Cache/Image/2026-08/0f36546a-244b-4ebc-89ec-3fbbcf38a5cb.jpg` — 5712 × 4284 px.
- Rendered implementation: `http://127.0.0.1:4174/`.
- Desktop viewport: 1440 × 1000 CSS px, device scale factor 1.
  - `design-qa/desktop-new-patient-modal-1440x1000.png`
  - `design-qa/desktop-patient-detail-1440x1000.png`
  - `design-qa/desktop-archive-initial-1440x1000.png`
  - `design-qa/desktop-archive-draft-1440x1000.png`
  - `design-qa/desktop-archive-conflict-1440x1000.png`
  - `design-qa/desktop-archive-completed-1440x1000.png`
- Narrow viewport: 820 × 1000 CSS px, device scale factor 1.
  - `design-qa/narrow-archive-completed-820x1000.png`
  - `design-qa/narrow-archive-section-nav-820x1000.png`
- Density normalization: all implementation captures are 1 CSS px to 1 image px. Source photographs were scaled proportionally, without cropping, on a 2600 × 5367 px comparison board at device scale factor 1.
- Combined comparison: the three source sheets and their corresponding implementation states were rendered together on the same comparison board and inspected as one image. The board was removed after inspection so the repository does not duplicate the handwritten health information; the original source paths and durable implementation captures above remain the evidence of record.

The photographs are content/field truth rather than a pixel-level PC UI specification. Comparison therefore evaluates grouping, completeness, hierarchy, density and interaction treatment; it does not require the electronic form to imitate paper typography or table rules.

## Findings

No actionable P0/P1/P2 findings remain.

- Fonts and typography: the implementation uses the existing clinical-admin system sans stack with clear heading, field-label and helper-text weights. At both viewports, labels remain readable without truncation or awkward wrapping. The source paper's serif typography is not treated as a UI requirement.
- Spacing and layout rhythm: desktop uses a stable sidebar, progress summary, section navigator and three-column form grid. At 820 px, the directory becomes a compact grid and the form remains usable. Automated geometry checks found `scrollWidth === clientWidth` at both 1440 and 820 px, with no visible element outside the viewport.
- Colors and visual tokens: the blue/cyan clinical palette is consistent with the rest of the management platform. Draft, completed, warning and conflict states have distinct semantic treatments and sufficient visual separation.
- Image quality and asset fidelity: the management shell uses the exact mini-program logo asset and it renders sharply at desktop and narrow widths. The supplied paper photographs are source records, not runtime imagery, so omitting them from the product UI is intentional.
- Copy and content: the electronic form preserves the paper's basic measurements, diseases/labs, symptoms/family history, obesity factors, weight-loss history, exercise/diet, sleep/elimination and TCM plan as eight scannable modules. Handwritten patient values were not copied into product data.
- Icons and controls: one Radix icon family is used consistently; field controls, modal choices, status indicators and action bars align optically. No visible form control was missing a programmatic label in the automated audit.
- Responsive behavior: neither tested viewport has horizontal overflow. The narrow fixed action bar remains visible without hiding persistent controls; content remains vertically scrollable. Long-distance section navigation reaches the selected module (measured target y = 14.8 px after smooth scrolling).
- Accessibility: keyboard focus presents a 3 px solid outline. The initial narrow-screen audit found unnamed collapsed navigation buttons; after adding `aria-label` and `title`, Playwright aria snapshots expose `工作台`, `患者管理`, `随访管理`, `消息中心` and `通知中心` as the five button names.

## Primary interactions checked

- Nutritionist password login.
- Patient management navigation and existing-patient detail.
- New-patient modal with default `仅创建账号，稍后补录`, selectable `创建账号后立即建档`, and ability to switch back.
- Opening the electronic archive from patient detail.
- Entering height, weight, waist and gender; BMI derived as 25.5 from 168 cm / 72 kg.
- Saving a draft and receiving the saved state.
- Optimistic concurrency: an intentional competing API update causes HTTP 409 and the visible refresh/anti-overwrite warning.
- Refreshing after conflict and marking a partially filled, clinically optional archive complete after confirmation.
- Narrow-screen section navigation, fixed actions and keyboard focus.
- Console and page errors: no unexpected console errors or uncaught page errors. The only 409 was deliberately induced for the concurrency check; a separate read-only follow-up run was clean.
- Cleanup: the archive created solely for QA was deleted exactly, and a final API read returned `archive: null`; the demo patient was left unchanged.

## Focused comparison evidence

- The new-patient modal confirms that immediate and deferred archiving are visually distinct radio-card choices, with authorization separated as its own required control.
- The archive top section confirms that paper measurements are represented as labeled native inputs with units and derived BMI, rather than as a dense paper-table imitation.
- The narrow section capture confirms checkbox/radio groups, multiline history fields and long-form grouping remain readable at 820 px.
- The conflict capture confirms error copy, refresh action and unsaved-state footer are simultaneously visible.
- Separate focused crops were not required because every important control is legible at the native screenshot densities listed above.

## Comparison history

1. Earlier pass: browser-rendered evidence was unavailable, so the result was blocked.
2. Playwright pass 1 found a P0 contract mismatch: the UI requested patient and follow-up `pageSize=200` while the API accepts at most 100, leaving the patient list empty with two HTTP 400 responses. The calls were changed to 100.
3. Playwright pass 2 completed the full archive workflow and found no layout overflow, but found a P1 accessibility issue at 820 px: collapsed sidebar buttons had no accessible names. `aria-label={item.label}` and `title={item.label}` were added.
4. Post-fix pass: all five narrow navigation buttons expose their Chinese names, the read-only run has no console/page/request failures, and the combined source/implementation comparison found no remaining actionable P0/P1/P2 differences.

## Follow-up polish

- [P3] Consider honoring `prefers-reduced-motion` by switching long-distance section navigation from smooth to instant scrolling for users who request reduced motion.

final result: passed
