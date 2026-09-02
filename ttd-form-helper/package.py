#!/usr/bin/env python3
"""Builds upload-ready zips, a signed Chromium CRX, and pre-checks the Chrome
Web Store rules that reject an upload (missing __MSG__ keys per locale,
over-length name/description).

    python package.py            # build zips + repo-root main.crx
    python package.py --check    # validate only, don't write anything
"""
import hashlib
import io
import json
import os
import pathlib
import re
import struct
import subprocess
import sys
import tempfile
import zipfile

ROOT = pathlib.Path(__file__).parent.resolve()
OUT = ROOT / "dist"
REPO_ROOT = ROOT.parent
CRX_PATH = REPO_ROOT / "main.crx"
PEM_PATH = OUT / "signing.pem"

# Everything not listed here stays out of the uploaded package.
INCLUDE_DIRS = ["_locales", "content", "icons", "options", "popup", "shared"]
INCLUDE_FILES = ["background.js"]
# Dev-only files that must never ship inside a store package.
EXCLUDE_NAMES = {"gen_icons.py", "package.py", "bundle.py", "manifest.firefox.json", "README.md", ".DS_Store"}
EXCLUDE_SUFFIXES = {".pyc"}
EXCLUDE_DIRS = {"__pycache__", "dist"}

MAX_NAME, MAX_DESC = 45, 132

CRX3_MAGIC = b"Cr24"
CRX3_VERSION = 3
CRX3_SIGNED_DATA_CONTEXT = b"CRX3 SignedData\x00"


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


def zip_payload(manifest_src):
    """Return (zip_bytes, file_count) for a store-ready package."""
    manifest = json.load(open(ROOT / manifest_src, encoding="utf-8"))
    buf = io.BytesIO()
    files = collect()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        # The variant manifest is always written as plain "manifest.json".
        z.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
        for p in files:
            z.write(p, p.relative_to(ROOT).as_posix())
    return buf.getvalue(), len(files) + 1


def build(target, manifest_src):
    OUT.mkdir(exist_ok=True)
    manifest = json.load(open(ROOT / manifest_src, encoding="utf-8"))
    zip_path = OUT / f"ttd-form-helper-{manifest['version']}-{target}.zip"
    data, nfiles = zip_payload(manifest_src)
    zip_path.write_bytes(data)
    print(f"  {zip_path.name}  ({len(data) / 1024:.0f} KB, {nfiles} files)")
    return zip_path, data


def _varint(n):
    out = bytearray()
    while n > 0x7F:
        out.append((n & 0x7F) | 0x80)
        n >>= 7
    out.append(n)
    return bytes(out)


def _ld(field, data):
    """Protobuf length-delimited field."""
    return _varint((field << 3) | 2) + _varint(len(data)) + data


def _ensure_pem(pem_path):
    pem_path.parent.mkdir(parents=True, exist_ok=True)
    if pem_path.is_file() and pem_path.stat().st_size > 0:
        return pem_path
    subprocess.run(
        ["openssl", "genrsa", "-out", str(pem_path), "2048"],
        check=True,
        capture_output=True,
    )
    os.chmod(pem_path, 0o600)
    return pem_path


def _public_key_der(pem_path):
    result = subprocess.run(
        ["openssl", "rsa", "-in", str(pem_path), "-pubout", "-outform", "DER"],
        check=True,
        capture_output=True,
    )
    return result.stdout


def _rsa_sha256_sign(pem_path, data):
    with tempfile.NamedTemporaryFile(delete=False) as tmp:
        tmp.write(data)
        tmp_path = tmp.name
    try:
        result = subprocess.run(
            ["openssl", "dgst", "-sha256", "-sign", str(pem_path), tmp_path],
            check=True,
            capture_output=True,
        )
        return result.stdout
    finally:
        os.unlink(tmp_path)


def _extension_id(crx_id):
    return "".join(
        chr(ord("a") + ((b >> 4) & 0xF)) + chr(ord("a") + (b & 0xF)) for b in crx_id
    )


def build_crx(zipdata, dest):
    """Wrap a zip payload in a CRX3 container signed with a local RSA key."""
    pem = _ensure_pem(PEM_PATH)
    pubkey = _public_key_der(pem)
    crx_id = hashlib.sha256(pubkey).digest()[:16]
    signed_header = _ld(1, crx_id)  # crx3.SignedData.crx_id
    to_sign = (
        CRX3_SIGNED_DATA_CONTEXT
        + struct.pack("<I", len(signed_header))
        + signed_header
        + zipdata
    )
    signature = _rsa_sha256_sign(pem, to_sign)
    proof = _ld(1, pubkey) + _ld(2, signature)  # crx3.AsymmetricKeyProof
    header = _ld(2, proof) + _ld(10000, signed_header)  # crx3.CrxFileHeader
    dest.write_bytes(
        CRX3_MAGIC
        + struct.pack("<I", CRX3_VERSION)
        + struct.pack("<I", len(header))
        + header
        + zipdata
    )
    if dest.read_bytes()[:4] != CRX3_MAGIC:
        raise RuntimeError("CRX write failed: missing Cr24 magic")
    return _extension_id(crx_id)


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
    _, chrome_zip = build("chrome", "manifest.json")
    if (ROOT / "manifest.firefox.json").is_file():
        build("firefox", "manifest.firefox.json")

    print("Building CRX3...")
    ext_id = build_crx(chrome_zip, CRX_PATH)
    size_kb = CRX_PATH.stat().st_size / 1024
    print(f"  {CRX_PATH.name}  ({size_kb:.0f} KB, id {ext_id})")

    print(f"\nDone. Upload dist/ttd-form-helper-{manifest['version']}-chrome.zip to the Web Store.")
    print(f"CRX is at {CRX_PATH} (drag onto chrome://extensions with Developer mode on).")


if __name__ == "__main__":
    main()
