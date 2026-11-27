# GIGROUP Store Desk

Single-company inventory CRM and installable web app. Production: https://gigroup-sp2-crm.vercel.app

## Shared data and access

Neon PostgreSQL stores the company state, revision counter, employee membership, sessions, authentication accounts, rate limits and save audit. Better Auth 1.7.24 handles password hashing and secure session cookies. The application exposes no public registration endpoint: the first administrator is created using a one-use owner setup key; subsequent employee accounts are created by the administrator in Team.

Required server environment variables: DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL, CRM_SETUP_TOKEN. Set BETTER_AUTH_URL to the production origin. Keep all secrets in Vercel environment variables. Never include their values in client assets or source archives. The owner setup link puts its key in the URL fragment, then removes the fragment from browser history before displaying the form. After owner creation, the setup endpoint refuses further account creation.

The first authenticated administrator on the original browser can review and transfer the existing local inventory and movement history into an empty company database. Other browsers load central records after sign-in. Original local records are retained; they are not automatically merged into a populated database. No physical quantities change during the transfer. Use the same origin/browser profile where existing records are stored.

Every save uses a PostgreSQL transaction and row lock, checks the exact state revision, validates record changes and quantities, writes the new state, increments the revision and records the user. A stale device receives HTTP 409 and must reload. Failed or unconfirmed writes restore the last confirmed client state and block further writes until reloading. Never blindly retry stock movements after a network error. While no dialog is open, visible pages check for company updates every 15 seconds.

Roles: administrator manages employees and opening corrections; manager manages inventory, movements and SAP completion; storekeeper creates new movements and views/exports records. Completed and cancelled transactions are immutable at the API as well as the UI. SAP-posted quantities cannot decrease. Existing physical quantities must reconcile with movement changes; history-only movements do not alter stock. Inventory records and movement history cannot be deleted through shared saves. Replacement restore is disabled; file imports remain available.

## Inventory and SAP workflows

Inventory import updates item details by full R-SP2 code and preserves existing physical quantities. Each section has its own import. Repeated Stock In/Out rows are intentionally kept. New Stock In/Out imports always update physical quantities. History-only creation is disabled; existing historical records and their audit are preserved. SAP completion allocates issued quantities to existing pending entries, supports partial completion, rejects duplicate completion batches and never changes physical quantities. Fully completed entries lock.

## Run and deploy

Use Node 22 or newer. Install with `npm ci`, validate with `npm test`, and deploy this folder to the existing Vercel project gigroup-sp2-crm with dist as the output directory. Vercel serves Node functions from api/ and static files from dist/. Database and auth tables are created idempotently under a database advisory lock on first backend startup. Never point a preview at production resources without deliberately selecting its environment.

The test suite covers complete UI startup, sidebar navigation, PWA assets, physical/history stock transitions, repeated and fractional movements, SAP locks, role restrictions, migration restrictions, save acknowledgements, conflicts and slow-poll races. Authentication was also exercised locally with an isolated SQLite database; production health checks verify the Neon connection and schema.

## Mobile installation

Android Chrome: Install App, or menu > Add to Home screen. iPhone Safari: Share > Add to Home Screen. Sign in with the same company account on each device. Internet is required for reading and saving. The service worker caches only the generic offline page; it does not cache inventory, sessions or API responses. Vercel deployment protection remains enabled, so authorized users may also need Vercel access before reaching the application login.

## Interface

The production interface uses the approved charcoal/orange theme. Desktop keeps the full registers. At phone widths, each record becomes a labelled card with every column and the existing entry actions, avoiding horizontal record scrolling. Dashboard SAP pending counts derive from remaining Goods Issue quantities on active Stock Out records; the low-stock notice remains available. Backup and opening correction actions are under Tools. All existing authentication, physical-stock validation, import rules and completion locks remain in place.

## Item stock records

Click an item number in Inventory, Stock In, Stock Out, Low Stock or Reports to open that item’s current physical stock and complete movement history. The read-only view includes all-time recorded physical receipts/issues, separately labelled history-only and cancelled entries, movement/date/state filters and filtered CSV export. It does not infer running balances or treat opening stock as a receipt. The shared company state is never modified by viewing records. Mobile history uses labelled cards.
