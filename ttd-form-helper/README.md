# TTD Form Helper

A free browser extension that fills your saved details into TTD (Tirumala Tirupati
Devasthanams) Darshan, Srivari Seva and Srivani booking forms.

**Everything is stored only in your own browser.** There is no server, no account,
no sync and no analytics. Nothing is ever uploaded. Your details are typed into the
TTD page only at the moment you click Fill.

This is an independent tool. It is not affiliated with or endorsed by TTD, it never
bypasses CAPTCHA / OTP / payment steps, and it never submits a booking by itself.

---

## The on-page Fill button

The floating **⚡ Fill** button works entirely in the page — no server or network of
any kind. Key updates:

- **Auto-detects the form** — Pilgrim, Sevak (Srivari Seva / Group) or Srivani — and
  fills the right one straight from the button, relabelling itself to match. You no
  longer have to open the popup first for Seva or Srivani forms.
- **Visible feedback while it works** — each field flashes green as it is filled (amber
  if it couldn't be set), a small progress pill counts multi-person fills, and progress
  is announced for screen readers.
- **Sturdier filling** — one shared routine for React-controlled inputs, wait-for-ready
  checks instead of fixed delays, and verification for file uploads and the passport
  pop-up so half-filled fields are caught and reported on the page.
- **Robust to layout changes** — prefers stable field names/labels over the site's
  hashed CSS classes, re-checks the form as the page moves between steps, and hints you
  if a known booking page shows no recognised form.
- **Self-QC after every fill** — scans every field currently on the page (not just
  the ones this run wrote to), marking a persistent green ring + dot for anything
  with a value and a red ring + dot for anything still blank, plus a one-line
  "X/Y filled" summary that jumps you to the first problem field. Marks clear on
  the next fill or after ~20s.
- **Options menu & fill modes** — right-click the button (or use the ▾ / long-press) for
  a keyboard-reachable menu: fill only empty rows or overwrite, fill the next empty
  pilgrim, fill contact only, pick a saved set, choose a group Seva member, fill-and-
  continue, or undo/clear what was filled. `Alt`+`A` fills; `Alt`+`Shift`+`A` overwrites.
- **Real tab-outs** — after writing a field the extension drives a genuine
  focus → blur, so the site's own validation re-runs and clears any stale "this
  field is required" error instead of leaving Continue disabled.

## The side panel

The extension's UI is a **side panel**, not a popup. Click the toolbar icon to
open it, click it again (or the ✕ next to the ⚙️) to close it. That means:

- **It stays open** when you click the page, switch tabs, or copy details in
  from somewhere else. A popup closes the instant it loses focus, which made
  pasting details in from another page impossible.
- **It resizes** — drag its inner edge to whatever width shows the whole form
  at once. The layout follows, and the fill actions stay on one row at any width.

Chrome/Edge 114+ is required for the side panel. Firefox gets the same page as a
sidebar (`sidebar_action`) and keeps the toolbar popup as well.

The pilgrim tab's fill actions sit in one row of labelled icon buttons —
**⚡ Fill all**, **① Next** (fill the next pilgrim not yet on the form),
**⏭️ Continue** (fill everyone, then press the form's Continue), and
**🧹 Clear**. Each button's tooltip spells out the full action.

## One pilgrim record, two places to edit it

The panel's "Pilgrims for this booking" and Settings → "Saved pilgrims" edit the
same kind of record through the **same form component**
(`shared/pilgrimForm.js`), so they always show the same fields — contact details
included. They also stay in step at runtime: each watches `storage.onChanged`,
so a pilgrim added or edited in one shows up in the other without a reload.

Saved pilgrims is the master list of people. Anyone you add in the panel is
written into it automatically (no checkbox to remember), which is what makes
them available to pilgrim **sets**. A pilgrim who only exists in the current
booking can be kept for later with the ☆ button on their card; ⭐ means they're
already in Saved pilgrims.

## Where contact details live

TTD asks for one set of contact details per booking, not per person, so they're
part of the pilgrim record: each pilgrim has a **Contact details for the booking**
block (email, city, state, country, PIN, gothram). The first pilgrim who has them
filled in is the one used for the booking — there's no separate global contact to
keep in sync, and nothing to tick to make it apply.

Motion is skipped automatically when the browser is set to *reduce motion*.

---

## Install

### Prebuilt bundle (easiest — no repo clone needed)

Download the ready-to-load zip for your browser from the repository root and unzip it —
you'll get a `TTD-Form-Helper-v1.3.1` folder with a `HOW-TO-LOAD.txt` inside:

- `TTD-Form-Helper-v1.3.1-chrome-edge-brave-opera-unpacked.zip` — Chrome / Edge / Brave / Opera
- `TTD-Form-Helper-v1.3.1-firefox-unpacked.zip` — Firefox

Then follow the steps below, pointing at the unzipped folder. (These bundles are for
**loading unpacked**; they are not signed store builds.)

### Packed CRX (`main.crx`)

A signed Chromium package is at the repository root as [`main.crx`](../main.crx).

1. Download `main.crx`.
2. Open `chrome://extensions` (or `edge://extensions` / Brave / Opera).
3. Turn on **Developer mode**.
4. Drag `main.crx` onto the page.

Chrome may refuse CRX files that are not from the Chrome Web Store. If that happens,
use the unpacked zip above instead (**Load unpacked**). Rebuild both the zips and
`main.crx` with `python package.py`.

### Chrome / Edge / Brave / Opera

1. Go to `chrome://extensions` (or `edge://extensions`).
2. Turn on **Developer mode**.
3. Click **Load unpacked** and pick this `ttd-form-helper` folder (or the unzipped
   `TTD-Form-Helper-v1.3.1` folder from the prebuilt bundle).

### Firefox

Firefox does not support MV3 service workers, so it needs the alternate manifest:

```bash
cp manifest.json manifest.chrome.json && cp manifest.firefox.json manifest.json
```

Then go to `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** → pick
`manifest.json`. (For a permanent install the add-on has to be signed by Mozilla.)

Requires Firefox 115+ (that's when `storage.session` landed, which the optional
encryption feature needs).

### Safari

Safari can't load unpacked web extensions. Convert it into an Xcode project first:

```bash
xcrun safari-web-extension-converter ./ttd-form-helper
```

Then build and run from Xcode, and enable the extension in Safari → Settings →
Extensions. Requires Safari 16.4+ / macOS Ventura. Running it outside of Xcode
needs an Apple Developer signing identity.

---

## Packaging for the stores

```bash
python package.py           # builds dist/*-chrome.zip, dist/*-firefox.zip, and ../main.crx
python package.py --check   # validate only, write nothing
```

The script pre-checks the rules the Chrome Web Store rejects uploads for, so a
failure shows up locally instead of after a slow upload:

- every `__MSG_*__` placeholder in the manifest exists in **every** `_locales`
  folder — the store does **not** apply `default_locale` fallback at upload time,
  unlike the runtime;
- `extension_name` ≤ 45 characters and `extension_description` ≤ 132, per locale;
- message keys are valid identifiers and each `messages.json` parses.

It also keeps dev-only files (`package.py`, `icons/gen_icons.py`,
`manifest.firefox.json`, `README.md`) out of the uploaded package, and writes the
right manifest variant as `manifest.json` inside each zip. The same Chrome payload
is wrapped as a CRX3 file at the repository root (`main.crx`). The signing key is
kept at `dist/signing.pem` (gitignored) so rebuilds keep a stable extension id.

## Browser support

| Feature | Chrome / Edge | Firefox | Safari |
|---|---|---|---|
| Form autofill (all tabs) | ✅ | ✅ | ✅ |
| Side panel UI (stays open, resizable) | ✅ 114+ | ✅ sidebar | ⚠ popup only |
| Settings page, 6 languages | ✅ | ✅ | ✅ |
| Floating Fill button (auto-detects form type) | ✅ | ✅ | ✅ |
| Encrypted backup export / import | ✅ | ✅ | ✅ |
| Optional at-rest encryption | ✅ | ✅ 115+ | ✅ 16.4+ |
| Install as unpacked / temporary | ✅ | ⚠ temporary only | ❌ needs Xcode |

The code itself is browser-neutral: it prefers the `browser.*` namespace when
present and falls back to `chrome.*`, and uses only APIs in the common subset
(`storage.local`, `storage.session`, `runtime`, `tabs`, `activeTab`).
The only real difference between browsers is the manifest's background key and
how each browser lets you sideload an extension.

---

## Privacy & security

The usual danger with a browser extension isn't what it does today — it's what its
permissions would *allow* after a bad update or an account takeover. This one is built
so there is very little to abuse in the first place.

### Site access is limited to two domains

```json
"permissions":      ["storage", "sidePanel"],
"host_permissions": ["https://tirupatibalaji.ap.gov.in/*",
                     "https://ttdevasthanams.ap.gov.in/*"]
```

`sidePanel` only lets the extension show its own page in the browser's side
panel — it grants no access to any site, tab or data.

`activeTab` was deliberately **removed** in favour of two explicit host permissions.
`activeTab` would have granted access to whatever tab you were on — any site — each
time you opened the panel. With host permissions the browser itself refuses to load
the extension anywhere except those two TTD origins. Your bank, mail and work apps are
unreachable to it, not merely untouched. Check it under *Site access* on your
browser's extension details page.

There is **no** `tabs`, `cookies`, `webRequest`, `scripting`, `downloads`, `history`,
`clipboard`, `management` or `nativeMessaging` permission, and no `<all_urls>`.

### It cannot phone home

Extension pages run under this Content-Security-Policy:

```
default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline';
img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none';
frame-src 'none'; child-src 'none'; worker-src 'self';
base-uri 'none'; form-action 'none'
```

`connect-src 'self'` means the browser blocks every outbound request to anywhere but
the extension's own packaged files — `fetch`, `XMLHttpRequest`, WebSockets and
`navigator.sendBeacon` alike. `img-src` closes the "remote pixel" trick. This was
verified by attempting each of those exfiltration methods and confirming the browser
raised a CSP violation for all of them.

`script-src 'self'` (with no `unsafe-eval`) means `eval()`, `new Function()` and any
remotely-hosted script are blocked — also verified. So the classic pattern of an
extension quietly pulling new instructions from a C2 server cannot work here, even if
the code tried.

`style-src` keeps `'unsafe-inline'` because the UI uses inline style attributes. CSS
is not an exfiltration path here: any `url()` it might reference is already blocked by
`img-src`/`connect-src`.

### Nothing external can talk to it

No `externally_connectable` is declared, so no website can message the extension. No
`web_accessible_resources` are declared, so no page can load its files or fingerprint
it. The two internal message listeners (content script and background worker) both
verify `sender.id` matches this extension, and the background worker additionally
requires the sender tab to be a TTD origin and will only ever return the two booking
keys — never the whole store.

### No third-party code

Zero dependencies: no framework, no analytics SDK, no CDN, no npm supply chain. Every
line that runs is in this folder, unminified. The single `fetch()` in the codebase
loads the bundled `_locales/*/messages.json`.

### Storage

`browser.storage.local`, on this device only. Optional at-rest encryption below.

### Optional at-rest encryption

Off by default. When you turn it on (Settings → Security):

- Your passphrase is stretched with **PBKDF2-SHA256, 210,000 iterations** into an
  **AES-GCM-256** key.
- Every record holding personal data is stored as ciphertext; preferences like theme
  and tab order stay in plain text.
- The derived key is held in `storage.session` (memory only, wiped when the browser
  closes) so you unlock once per session rather than on every popup open.
- **The passphrase is never stored anywhere.** There is no reset and no recovery — if
  you forget it, the data can only be deleted. Keep a backup file.

### Encrypted backups

Settings → Backup & Restore. Passphrase protection is on by default and uses the same
PBKDF2 + AES-GCM scheme. AES-GCM is authenticated, so a wrong passphrase or a modified
file fails loudly instead of producing garbage. You can opt out and export plain JSON,
but that file contains Aadhaar/passport numbers in the clear.

---

## What gets validated

The extension checks details before they reach the TTD site, so a typo costs you a
correction here rather than a rejected booking attempt:

- **Aadhaar** — 12 digits, cannot start with 0 or 1, and must pass the **Verhoeff
  checksum** (catches every single-digit typo and every adjacent transposition).
- **Passport** — 6–12 alphanumerics, with a nudge if it isn't the usual Indian
  1-letter + 7-digit shape.
- **Passport holders** — visa type, visa number, visa validity and nationality are all
  required, because TTD's passport pop-up won't submit without them.
- **Mobile** — 10 digits starting 6/7/8/9. **PIN code** — 6 digits, not starting 0.
- **Dates** — strict `DD/MM/YYYY`; DOB can't be in the future and is cross-checked
  against the age; an expired visa is flagged.

Hard errors block the Fill; softer notes are shown but let you continue.

---

## Version history

### 1.3.1 — current

- **Fill actions fit on one row.** The four buttons were a 2x2 grid until the
  panel was dragged past ~520px. They're now a single row of four at any width
  (`repeat(4, minmax(0, 1fr))`), with the icon above a short label inside each
  tile — Fill all / Next / Continue / Clear — and the full description kept as
  the tooltip.
- **Clear works on the first click.** It used to restore values from the undo
  log and *return early*; anything that restore couldn't shift survived, and
  only the fallback sweep on the second click caught it. There is no early
  return now — one pass restores (where asked) and then empties whatever is
  still filled, followed by a second sweep a frame later for values React
  re-renders back.
- **Clear now empties Gender and the other dropdown fields.** Those are
  read-only inputs whose text comes from React state. Writing `""` natively
  left `el.value === ""`, which matched the target, so the React fallback in
  `setControlledValue` never fired and the component re-rendered its old label
  straight back. Clearing now drives the component's `onChange` with an empty
  value explicitly, and handles `<select>` elements by selecting their blank
  option.
- The panel's **Clear** button now empties the form outright, while the
  floating button's **Undo / clear** still restores pre-fill values first —
  each matching what its label says. The undo log is also emptied *after* the
  clearing writes rather than before, so a second click can't put back the
  values the first one just cleared.

### 1.3.0

- **The UI is a side panel now.** A popup closes the moment it loses focus, so
  copying details in from another page or tab was impossible and every stray
  click threw away what you were typing. The same page is now Chrome's side
  panel: it stays open across clicks and tab switches, resizes by dragging its
  edge (the fill actions reflow from two columns to four past ~520px), and
  toggles from the toolbar icon or the new ✕ beside the ⚙️. Firefox gets it as
  a `sidebar_action`. **This raises the Chrome floor to 114** (the side panel
  API); a build without it falls back to opening the page in its own window.
- **One pilgrim form, shared by the panel and Settings.** The two were separate
  copies that had drifted — Settings → Saved pilgrims never got the contact
  fields the panel grew — so the same person came out with different fields
  depending on where you added them. Both now build the form from
  `shared/pilgrimForm.js`: name, relationship, age, gender, ID, passport block,
  contact block and notes, everywhere.
- **The two lists stay in sync.** Panel and Settings both watch
  `storage.onChanged`, so a pilgrim added or edited in one appears in the other
  without reopening anything. Saved pilgrims is the master list: anyone added in
  the panel is written into it automatically, which is what makes them
  selectable in pilgrim sets — previously a panel-added pilgrim was invisible to
  Settings and to sets.
- **Move a booking pilgrim back into Saved pilgrims.** Each card in the booking
  list has a ☆ button that keeps that person for later bookings; ⭐ means they're
  already saved.
- **Labelled icon actions in the panel** — ⚡ Fill all, ① Fill next pilgrim,
  ⏭️ Fill all & continue, 🧹 Clear fields, backed by new `FILL_NEXT` and
  `CLEAR_FIELDS` content-script actions and a `thenContinue` flag on `FILL_ALL`.
  "Fill next pilgrim" uses the same context-aware selection as the floating
  button, so it skips whoever is already on the form.

### 1.2.4

- **Real tab-outs — fixes stale "this field is required" and a disabled Continue.**
  React does not listen for the `blur` event at all; it wires `onBlur` to the
  native, bubbling `focusout`. The synthetic `new Event("blur")` this extension
  dispatched therefore never reached the page's validator, so a field could hold
  the right value while the site still showed "this field is required" and kept
  its Continue button disabled — most visibly after clearing a field by hand and
  re-running the fill. Writes now drive a genuine `focus()` → `blur()` (skipped
  for comboboxes, which re-open their list on focus), which emits the real
  focus/focusin/blur/focusout sequence. The value write also rewinds React's
  private `_valueTracker` so its `onChange` can't be skipped as a no-op change.
- **Undo / clear filled fields actually works.** The undo log was only recorded
  while a flag the floating button set was on, so a fill started from the popup
  logged nothing and "Clear filled fields" reported nothing to clear. Recording
  is now unconditional, and when there's no usable log (the page re-rendered, or
  the fill happened in an earlier page load) the action falls back to emptying
  every text field on the form instead of doing nothing.
- **"Fill next pilgrim" is context-aware.** It used to always fill `pilgrims[0]`,
  so clicking it twice just put the same person in another row. It now skips
  whoever is already on the page — by name, however they got there — and fills
  the next saved pilgrim into the next empty row, or says so when everyone is
  already placed.
- **One place for contact details.** The separate global Contact section and its
  "also apply to pilgrims" checkbox are gone — two levels of contact details was
  confusing, and the checkbox was asking about something that should just happen.
  Contact details (now including gothram) live on the pilgrim, and the booking
  uses the first pilgrim who has them. Anything saved in the old global contact
  is migrated onto existing pilgrims on first load, and the derived contact is
  still written to the same storage key, so backup/restore, the background
  worker and the content script are unaffected.

### 1.2.3

- **Self-QC now scans the whole form, not just this run's writes** — the previous
  version only marked fields *this fill attempt* wrote to, so a "Fill Contact"
  or "Fill next empty pilgrim" action reported just those few fields, and a
  fill that skipped an already-filled pilgrim row (the default "only empty"
  mode) left that row unmarked even though it visibly had data. Self-QC now
  scans every visible, enabled field on the page after each run — including
  rows filled by hand or by an earlier run — so the green/red marks reflect
  the actual state of the whole form. Checkboxes and radio groups are credited
  when set but never red-flagged when not, since "unchecked" is a legitimate
  end state for most of those.
- **Fixed a stale-marker bug** — the old design could mark a DOM node the page
  had since replaced (a re-render), leaving a field that was genuinely filled
  showing no green ring at all. Scanning the live DOM after each run instead
  of replaying captured element references removes this class of bug entirely.
- **"Lightning fast" tabout fix** — the synthetic `blur` event fired right after
  filling a field is now deferred one animation frame (~16ms) instead of firing
  in the same tick as `input`/`change`. Firing it immediately could race the
  page's own async state commit, so an on-blur "this field is required"
  validator would sometimes read the old, empty value and flag a field that
  had, in fact, just been filled — most noticeable after manually clearing a
  field and re-running the fill.
- **Speed, take two** — 1.2.2 removed the fixed pauses between plain-field
  writes entirely, which saved time but could race a page re-render and
  silently drop a write. They're back, but as a single animation-frame yield
  (~16ms) instead of a 100ms+ `sleep()` — still 6-9x faster than before 1.2.2,
  with a safety margin restored. Dropdown, popup and Seva-form timing — which
  genuinely wait on the page's own async rendering — remain untouched.
- **Optional per-pilgrim contact details** — the Add Pilgrim form now has a
  collapsible "Contact details (optional)" section (email, city, state,
  country, PIN code) for when a pilgrim's contact info differs from, or needs
  to stand in for, the shared Contact section. When the shared Contact section
  is missing a field, the fill now falls back to that field from the first
  pilgrim in the run that set it. Saving the shared Contact section also gained
  an "Also fill in any pilgrims missing these details" checkbox that backfills
  (never overwrites) each saved pilgrim's blank contact fields.

### 1.2.2

- **Self-QC after every fill** — every field a fill run writes to (plain inputs,
  dropdowns, radio groups, file uploads) is now checked once the run finishes:
  filled fields get a persistent green ring + dot, still-blank ones get a red
  ring + dot, and a toast summarizes "X/Y filled" with the names of anything
  missing, scrolling to the first problem field. Marks clear on the next fill or
  after ~20 seconds. Applies to both the floating on-page button and the popup's
  fill actions.
- **Faster pilgrim filling** — removed several fixed `sleep()` pauses that were
  never doing anything: plain-text fields (name, age, ID number) write and
  dispatch their events synchronously, so back-to-back writes don't need a delay
  between them, and the per-pilgrim loop's fixed 150ms pause dropped to a 30ms
  yield. Dropdown, popup and Seva-form timing — the parts that genuinely wait on
  the page's own async rendering — are unchanged.

### 1.2.1

- **Version bump only** — the Chrome Web Store rejects an upload whose
  `manifest.json` version is not strictly greater than the currently published
  version. 1.2.0 was already published, so this release only bumps `version` to
  `1.2.1` (in both `manifest.json` and `manifest.firefox.json`) to unblock the
  next upload; no functional changes.

### 1.2.0

- **Ship fresh unpacked bundles** — rebuilt the Chrome/Edge/Brave/Opera and Firefox
  zips under the `v1.2.0` naming and dropped the stale root zip that no longer
  matched the packaged code.
- **Fill Group Seva members from the on-page button** — the floating Fill button's
  options menu can now pick a specific member of a saved Group Seva set instead of
  only ever filling the first one.
- **Fill modes, options menu, undo, selector-health hint** — added a right-click /
  ▾ / long-press menu on the Fill button (fill empty rows only or overwrite, fill
  the next empty pilgrim, contact-only, choose a saved set, fill-and-continue) plus
  an **undo last fill** action and a hint when a known booking page shows no
  recognised form. Added `Alt`+`A` (fill) and `Alt`+`Shift`+`A` (overwrite)
  keyboard shortcuts.
- **Smarter, sturdier on-page fill** — auto-detects Pilgrim / Sevak (Srivari Seva or
  Group) / Srivani forms and relabels the button to match, so the popup no longer
  needs to be opened first. Added visible per-field fill feedback (green/amber
  flashes, a progress pill, screen-reader announcements), a shared routine for
  React-controlled inputs, wait-for-ready checks in place of fixed delays,
  verification for file uploads and the passport pop-up, and preference for stable
  field names/labels over the site's hashed CSS classes so layout changes don't
  break filling.

Everything above shipped as part of the 1.2.0 line — the extension's `version`
field has not changed since this repository's history began, so there is no
separate 1.0.0 / 1.1.0 release to list.

## Layout

```
manifest.json          Chrome / Edge / Safari
manifest.firefox.json  Firefox variant (background.scripts)
background.js          Serves decrypted data to the on-page Fill button when locked
content/autofill.js    The actual form-filling logic, injected on TTD pages
popup/                 Toolbar popup: the four booking tabs
options/               Settings: saved pilgrims, sets, tabs, backup, security
shared/                Storage, crypto, validation, i18n, reference data
_locales/              English, Hindi, Kannada, Malayalam, Tamil, Telugu
```
