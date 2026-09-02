#!/usr/bin/env python3
"""Builds the two ready-to-load zips published at the repository root.

These are the "unpacked" bundles a user downloads and side-loads: the extension
files inside a version-named folder, plus README.md and a short HOW-TO-LOAD.txt.
That is deliberately different from `package.py`, which builds the trimmed
store-upload payload (no README, files at the archive root).

They used to be produced by hand, which is how they ended up nine releases
behind the source. Run this whenever the version changes:

    python bundle.py            # writes ../TTD-Form-Helper-v<version>-*.zip
    python bundle.py --check    # report what would be written, write nothing

The signed `main.crx` at the repository root is NOT built here — it needs the
private key at dist/signing.pem (gitignored) so the extension id stays stable
across releases. Rebuild that with `python package.py` on a machine that has it.
"""
import datetime
import pathlib
import sys
import zipfile

import package  # reuse the exact file set the packager already agrees on

ROOT = pathlib.Path(__file__).parent.resolve()
REPO_ROOT = ROOT.parent

TARGETS = {
    "chrome-edge-brave-opera": {
        "manifest": "manifest.json",
        "label": "Chrome / Edge / Brave / Opera",
        "load": """LOAD IT (Chrome / Edge / Brave / Opera)
  1. Unzip this file — you'll get a folder named '{folder}'.
  2. Open  chrome://extensions  (or edge://extensions).
  3. Turn ON 'Developer mode' (top-right).
  4. Click 'Load unpacked' and select the '{folder}' folder.
  5. The TTD Form Helper icon appears in your toolbar.
  (Requires Chrome / Edge 114+ for the side panel.)""",
    },
    "firefox": {
        "manifest": "manifest.firefox.json",
        "label": "Firefox",
        "load": """LOAD IT (Firefox)
  1. Unzip this file — you'll get a folder named '{folder}'.
  2. Open  about:debugging#/runtime/this-firefox
  3. Click 'Load Temporary Add-on...'
  4. Select the 'manifest.json' inside the '{folder}' folder.
  (Temporary add-ons are removed when Firefox restarts. Requires Firefox 115+.)""",
    },
}

HOW_TO_LOAD = """TTD Form Helper — v{version}  (unpacked / developer load)
Build date: {date}   Target: {label}
============================================================
{load}

WHAT IT IS
  A free browser extension that fills your saved details into the official TTD
  (Tirumala Tirupati Devasthanams) Darshan, Srivari Seva / Group and Srivani
  booking forms. Everything is stored only in your own browser — no server, no
  account, no network of any kind. It never bypasses CAPTCHA / OTP / payment and
  never submits a booking by itself.

USING IT
  1. Click the toolbar icon to open the side panel and save your pilgrims /
     sevak / Srivani details. The panel stays open while you work and can be
     resized by dragging its inner edge.
  2. Open a TTD booking page. A floating fill button appears at bottom-right.
  3. Click it (or press Alt+A) to fill. Right-click the button, or use the small
     down-arrow, for more options: overwrite, fill one row, contact only,
     saved sets, group members, fill-and-continue, or undo/clear what was filled.
  4. After each fill, every field on the page is checked: green means filled,
     red means still blank.

See README.md in this folder for full details, privacy notes and browser support.
"""


def build(target, spec, version, check=False):
    folder = f"TTD-Form-Helper-v{version}"
    out = REPO_ROOT / f"{folder}-{target}-unpacked.zip"
    manifest_text = (ROOT / spec["manifest"]).read_text(encoding="utf-8")
    how_to = HOW_TO_LOAD.format(
        version=version,
        date=datetime.date.today().isoformat(),
        label=spec["label"],
        load=spec["load"].format(folder=folder),
    )
    files = package.collect()

    if check:
        print(f"  {out.name}  ({len(files) + 3} entries)")
        return out

    buf = zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED)
    with buf as z:
        # The variant manifest always ships as plain "manifest.json".
        z.writestr(f"{folder}/manifest.json", manifest_text)
        z.writestr(f"{folder}/HOW-TO-LOAD.txt", how_to)
        z.write(ROOT / "README.md", f"{folder}/README.md")
        for path in files:
            z.write(path, f"{folder}/{path.relative_to(ROOT).as_posix()}")
    size_kb = out.stat().st_size / 1024
    print(f"  {out.name}  ({size_kb:.0f} KB, {len(files) + 3} entries)")
    return out


def main():
    check = "--check" in sys.argv
    manifest = package.json.load(open(ROOT / "manifest.json", encoding="utf-8"))
    version = manifest["version"]
    print(f"TTD Form Helper v{version} — unpacked bundles\n")

    problems = package.check_locales(manifest)
    if problems:
        print("  BUNDLE WOULD SHIP A BROKEN PACKAGE:")
        for p in problems:
            print(f"    - {p}")
        sys.exit(1)

    for target, spec in TARGETS.items():
        build(target, spec, version, check=check)

    if check:
        print("\nCheck only — nothing written.")
    else:
        print("\nDone. Stale bundles for older versions should be deleted.")
        print("main.crx is not rebuilt here — see the note at the top of this file.")


if __name__ == "__main__":
    main()
