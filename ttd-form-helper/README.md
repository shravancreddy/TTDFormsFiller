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
- **Options menu & fill modes** — right-click the button (or use the ▾ / long-press) for
  a keyboard-reachable menu: fill only empty rows or overwrite, fill the next empty
  pilgrim, fill contact only, pick a saved set, choose a group Seva member, fill-and-
  continue, or undo the last fill. `Alt`+`A` fills; `Alt`+`Shift`+`A` overwrites.

Motion is skipped automatically when the browser is set to *reduce motion*.

---

## Install

### Prebuilt bundle (easiest — no repo clone needed)

Download the ready-to-load zip for your browser from the repository root and unzip it —
you'll get a `TTD-Form-Helper-v1.2.0` folder with a `HOW-TO-LOAD.txt` inside:

- `TTD-Form-Helper-v1.2.0-chrome-edge-brave-opera-unpacked.zip` — Chrome / Edge / Brave / Opera
- `TTD-Form-Helper-v1.2.0-firefox-unpacked.zip` — Firefox

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
   `TTD-Form-Helper-v1.2.0` folder from the prebuilt bundle).

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
| Popup, settings, 6 languages | ✅ | ✅ | ✅ |
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
"permissions":      ["storage"],
"host_permissions": ["https://tirupatibalaji.ap.gov.in/*",
                     "https://ttdevasthanams.ap.gov.in/*"]
```

`activeTab` was deliberately **removed** in favour of two explicit host permissions.
`activeTab` would have granted access to whatever tab you were on — any site — each
time you opened the popup. With host permissions the browser itself refuses to load
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
