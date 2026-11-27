# Approved dark theme: production integration

final result: passed

The approved GIGROUP dark/orange preview and mobile-width cards were applied to the existing buildless CRM. The original app and backend remain the implementation; no prototype data or mock persistence was added to production.

## Changes
- Charcoal/orange tokens, readable interface typography and Phosphor library navigation/metric icons.
- Existing tools, forms, importers, filters and print/CSV controls remain available. Backup/Restore and Correct Opening Stock are grouped under Tools.
- Desktop retains all table columns. Phone-width records show every field as labelled cards, including existing Edit/Cancel/History actions. Complete entries still show Locked and History.
- Dashboard SAP pending metric and panel use the existing remaining SAP quantity helper on active Stock Out entries. Department progress counts entries rather than combining quantities with different UOMs. Low-stock notice and Low Stock view remain available.
- PWA theme colour matches the interface. Service-worker behaviour and central persistence are unchanged.

## Evidence
- Approved source: /workspace/shared/gigroup-dark-dashboard-final.jpg and /workspace/shared/gigroup-mobile-cards.jpg.
- Production-template desktop render: /workspace/shared/gigroup-production-dark-qa.jpg.
- Production-template mobile render: /workspace/shared/gigroup-production-mobile-qa.jpg.
- Local visual QA uses an isolated copy of production HTML/assets under the prototype public/live-review folder, with labelled test records and a local in-memory save stub. That folder is outside this deployment and is never uploaded as CRM source. Production authentication and company data were not bypassed or used for visual test fixtures.
- Desktop screenshot: 1348px content width, default density. Phone frame: 390 x 844 CSS px, inner content about 375px after scrollbar.
- At phone width, #table clientWidth=343 and scrollWidth=343. Two filtered Stock Out cards each retain all 12 user columns plus Actions.
- Applicant + Status filtering produced the expected two Pending sample records.
- Existing Stock Out form opened with date, fixed R-SP2 prefix, QR, stock availability, department, production line, receiver, applicant, status and notes. Closed without saving.
- Complete sample entry retained its locked state.
- Console inspection found browser-extension metadata errors only; no application runtime error was observed.

## Design review
- Fonts: DM Sans / Manrope, system fallbacks. Operational descriptions 13–14px, quantities 14–18px; mobile inputs 16px.
- Spacing: compact four-card metric grid, chart/SAP split on desktop, stacked panels and cards on mobile.
- Colours: charcoal surfaces, orange primary actions, semantic receipt/issue colours, dark dialogs and login gate.
- Assets: icons rendered from the Phosphor library, existing GIGROUP text wordmark, no generated placeholder imagery.
- Content: production records and counts remain dynamic. Visual fixtures are disclosed and excluded from release files.
- Intentional adaptations: production controls and complete registers are retained; chart values represent real counts rather than illustrative weekly bars.
- Print remains a light full-column table with mobile labels and action controls hidden.

## Validation
npm run build passed: complete startup, seven sidebar sections, section navigation, PWA asset checks and 24 tests covering shared-save conflicts, physical imports, fractional/repeated stock movements, history deductions, SAP completion and immutable Complete entries.

## Clickable item records follow-up

The real production HTML was tested in the isolated local QA fixture: click R-SP20940 → four matching movement records; select Stock In → one matching receipt. The current stock and all-time physical totals remain separate from filtered rows. Mobile dialog width=357px and scrollWidth=357px; movement table width=319px and scrollWidth=319px. Current item/description/location, physical totals, original statuses, dates, department, receiver, applicant, notes and entry ID are available. Pure-function checks passed for item isolation, prefix normalization, date/type/state filters, exclusion of cancelled/history-only records from physical totals and an unchanged input database. Screenshot: /workspace/shared/gigroup-item-record-mobile.jpg (test records only).
