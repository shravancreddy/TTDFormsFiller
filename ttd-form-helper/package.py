#!/usr/bin/env python3
"""Builds upload-ready zips and pre-checks the Chrome Web Store rules that
reject an upload (missing __MSG__ keys per locale, over-length name/description).

    python package.py            # build both zips
    python package.py --check    # validate only, don't write anything
"""
import json, os, re, sys, zipfile, pathlib

ROOT = pathlib.Path(__file__).parent.resolve()
OUT = ROOT / "dist"

# Everything not listed here stays out of the uploaded package.
INCLUDE_DIRS = ["_locales", "content", "icons", "options", "popup", "shared"]
INCLUDE_FILES = ["background.js"]
# Dev-only files that must never ship inside a store package.
EXCLUDE_NAMES = {"gen_icons.py", "package.py", "manifest.firefox.json", "README.md", ".DS_Store"}
EXCLUDE_SUFFIXES = {".pyc"}
EXCLUDE_DIRS = {"__pycache__", "dist"}

MAX_NAME, MAX_DESC = 45, 132


def check_locales(manifest):
    """Mirror the Web Store's own validation so failures surface here, not on upload."""
    problems = []
    placeholders = set(re.findall(r"__MSG_([A-Za-z0-9_]+)__", json.dumps(manifest)))
    locales = sorted(p.name for p in (ROOT / "_locales").iterdir() if p.is_dir())

    default_locale = manifest.get("default_locale")
    if default_locale not in locales:
        problems.append(f"default_locale '{default_locale}' has no _locales folder")

    for loc in locales:
        path = ROOT / "_locales" / loc / "messages.json"
        try:
            data = json.load(open(path, encoding="utf-8"))
        except Exception as exc:
            problems.append(f"{loc}: messages.json is not valid JSON ({exc})")
            continue

        # The store resolves __MSG__ per locale with no fallback, so each one
        # needs its own copy of every placeholder the manifest references.
        for key in sorted(placeholders):
            entry = data.get(key)
            if not entry or not str(entry.get("message", "")).strip():
                problems.append(f"{loc}: missing '{key}' (required by manifest)")
                continue
            msg = entry["message"]
            if key == "extension_name" and len(msg) > MAX_NAME:
                problems.append(f"{loc}: extension_name is {len(msg)} chars (max {MAX_NAME})")
            if key == "extension_description" and len(msg) > MAX_DESC:
                problems.append(f"{loc}: extension_description is {len(msg)} chars (max {MAX_DESC})")

        for key in data:
            if not re.fullmatch(r"[A-Za-z0-9_@]+", key):
                problems.append(f"{loc}: invalid message key '{key}'")
    return problems


def collect():
    files = []
    for name in INCLUDE_FILES:
        if (ROOT / name).is_file():
            files.append(ROOT / name)
    for d in INCLUDE_DIRS:
        base = ROOT / d
        if not base.is_dir():
            continue
        for p in sorted(base.rglob("*")):
            if not p.is_file():
                continue
            if any(part in EXCLUDE_DIRS for part in p.relative_to(ROOT).parts):
                continue
            if p.name in EXCLUDE_NAMES or p.suffix in EXCLUDE_SUFFIXES:
                continue
            files.append(p)
    return files


def build(target, manifest_src):
    OUT.mkdir(exist_ok=True)
    manifest = json.load(open(ROOT / manifest_src, encoding="utf-8"))
    zip_path = OUT / f"ttd-form-helper-{manifest['version']}-{target}.zip"

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        # The variant manifest is always written as plain "manifest.json".
        z.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
        for p in collect():
            z.write(p, p.relative_to(ROOT).as_posix())

    size_kb = zip_path.stat().st_size / 1024
    print(f"  {zip_path.name}  ({size_kb:.0f} KB, {len(collect()) + 1} files)")
    return zip_path


def main():
    manifest = json.load(open(ROOT / "manifest.json", encoding="utf-8"))
    print(f"TTD Form Helper v{manifest['version']}\n")

    print("Checking store requirements...")
    problems = check_locales(manifest)
    if problems:
        print("\n  UPLOAD WOULD FAIL:")
        for p in problems:
            print(f"    - {p}")
        sys.exit(1)
    print("  all locale/manifest checks passed\n")

    if "--check" in sys.argv:
        return

    print("Building packages...")
    build("chrome", "manifest.json")
    if (ROOT / "manifest.firefox.json").is_file():
        build("firefox", "manifest.firefox.json")
    print(f"\nDone. Upload dist/ttd-form-helper-{manifest['version']}-chrome.zip to the Web Store.")


if __name__ == "__main__":
    main()
