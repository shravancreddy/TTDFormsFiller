#!/usr/bin/env python3
"""Upload (and optionally publish) the Chrome zip to the Chrome Web Store API.

Reads credentials from environment variables or ttd-form-helper/cws.env:

    CWS_CLIENT_ID
    CWS_CLIENT_SECRET
    CWS_REFRESH_TOKEN
    CWS_PUBLISHER_ID
    CWS_EXTENSION_ID

    python publish_cws.py              # upload a new package (does not publish)
    python publish_cws.py --publish    # upload, then submit for review
"""
from __future__ import annotations

import json
import os
import pathlib
import sys
import urllib.error
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).parent.resolve()
ENV_FILE = ROOT / "cws.env"
TOKEN_URL = "https://oauth2.googleapis.com/token"
SCOPE = "https://www.googleapis.com/auth/chromewebstore"

REQUIRED = (
    "CWS_CLIENT_ID",
    "CWS_CLIENT_SECRET",
    "CWS_REFRESH_TOKEN",
    "CWS_PUBLISHER_ID",
    "CWS_EXTENSION_ID",
)


def load_env():
    if ENV_FILE.is_file():
        for raw in ENV_FILE.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key, value = key.strip(), value.strip().strip('"').strip("'")
            os.environ.setdefault(key, value)


def require_creds():
    missing = [k for k in REQUIRED if not os.environ.get(k, "").strip()]
    if missing:
        print("Missing Chrome Web Store API credentials:")
        for k in missing:
            print(f"  - {k}")
        print(f"\nCopy {ENV_FILE.name}.example to {ENV_FILE.name} and fill the Google OAuth values.")
        sys.exit(1)
    return {k: os.environ[k].strip() for k in REQUIRED}


def http_json(url, method="POST", data=None, headers=None, raw=False):
    req = urllib.request.Request(url, data=data, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(req) as resp:
            body = resp.read()
            if raw:
                return resp.status, body
            if not body:
                return resp.status, {}
            return resp.status, json.loads(body.decode("utf-8"))
    except urllib.error.HTTPError as exc:
        err = exc.read().decode("utf-8", errors="replace")
        print(f"HTTP {exc.code} {method} {url}\n{err}")
        sys.exit(1)


def access_token(creds):
    payload = urllib.parse.urlencode(
        {
            "client_id": creds["CWS_CLIENT_ID"],
            "client_secret": creds["CWS_CLIENT_SECRET"],
            "refresh_token": creds["CWS_REFRESH_TOKEN"],
            "grant_type": "refresh_token",
        }
    ).encode()
    _, body = http_json(
        TOKEN_URL,
        data=payload,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    token = body.get("access_token")
    if not token:
        print("Token response had no access_token:", json.dumps(body, indent=2))
        sys.exit(1)
    return token


def chrome_zip():
    from package import zip_payload

    data, nfiles = zip_payload("manifest.json")
    out = ROOT / "dist" / "ttd-form-helper-chrome-webstore.zip"
    out.parent.mkdir(exist_ok=True)
    out.write_bytes(data)
    print(f"Package {out.name}  ({len(data) / 1024:.0f} KB, {nfiles} files)")
    return out


def upload(creds, token, zip_path):
    pub, ext = creds["CWS_PUBLISHER_ID"], creds["CWS_EXTENSION_ID"]
    url = (
        "https://chromewebstore.googleapis.com/upload/v2/publishers/"
        f"{urllib.parse.quote(pub)}/items/{urllib.parse.quote(ext)}:upload"
    )
    print(f"Uploading to item {ext} …")
    status, body = http_json(
        url,
        data=zip_path.read_bytes(),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/zip",
            "x-goog-api-version": "2",
        },
    )
    print(f"Upload HTTP {status}")
    print(json.dumps(body, indent=2) if body else "(empty response)")
    return body


def publish(creds, token):
    pub, ext = creds["CWS_PUBLISHER_ID"], creds["CWS_EXTENSION_ID"]
    url = (
        "https://chromewebstore.googleapis.com/v2/publishers/"
        f"{urllib.parse.quote(pub)}/items/{urllib.parse.quote(ext)}:publish"
    )
    print("Submitting for review / publish …")
    status, body = http_json(
        url,
        data=b"{}",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "x-goog-api-version": "2",
        },
    )
    print(f"Publish HTTP {status}")
    print(json.dumps(body, indent=2) if body else "(empty response)")
    return body


def main():
    load_env()
    creds = require_creds()
    do_publish = "--publish" in sys.argv
    zip_path = chrome_zip()
    token = access_token(creds)
    upload(creds, token, zip_path)
    if do_publish:
        publish(creds, token)
        print("\nDone. Check the item in the Chrome Web Store developer dashboard.")
    else:
        print("\nUploaded only. Re-run with --publish to submit for review.")


if __name__ == "__main__":
    main()
