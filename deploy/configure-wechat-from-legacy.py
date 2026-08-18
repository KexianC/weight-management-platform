#!/usr/bin/env python3
"""One-time helper for moving legacy WeChat credentials into a protected .env.

The legacy cloud function is supplied by the operator. This script never prints
the AppSecret and keeps the destination file owner-readable only.
"""

import os
import re
import sys
from pathlib import Path
from typing import Dict, List
from urllib.parse import urlparse


def extract(source: str, variable: str, environment_key: str) -> str:
    pattern = (
        rf"const\s+{re.escape(variable)}\s*=\s*process\.env\."
        rf"{re.escape(environment_key)}\s*\|\|\s*['\"]([^'\"]+)['\"]"
    )
    match = re.search(pattern, source)
    if not match:
        raise RuntimeError(f"missing {variable} fallback in legacy WeChat source")
    return match.group(1)


def update_dotenv(path: Path, values: Dict[str, str]) -> None:
    existing = path.read_text(encoding="utf-8").splitlines() if path.exists() else []
    output: List[str] = []
    pending = dict(values)
    for line in existing:
        key = line.split("=", 1)[0].strip() if "=" in line else ""
        if key in pending:
            output.append(f"{key}={pending.pop(key)}")
        else:
            output.append(line)
    if output and output[-1] != "":
        output.append("")
    output.extend(f"{key}={value}" for key, value in pending.items())

    temporary = path.with_name(f".{path.name}.wechat.tmp")
    temporary.write_text("\n".join(output) + "\n", encoding="utf-8")
    os.chmod(temporary, 0o600)
    os.replace(temporary, path)
    os.chmod(path, 0o600)


def main() -> None:
    if len(sys.argv) not in (3, 6):
        raise SystemExit(
            "usage: configure-wechat-from-legacy.py LEGACY_WECHAT_JS DOTENV "
            "[RELEASE_TAG VITE_API_BASE_URL VITE_STORAGE_BASE_URL]"
        )

    source = sys.stdin.read() if sys.argv[1] == "-" else Path(sys.argv[1]).read_text(encoding="utf-8")
    app_id = extract(source, "WECHAT_APPID", "WECHAT_APPID")
    app_secret = extract(source, "WECHAT_APPSECRET", "WECHAT_APPSECRET")
    if not re.fullmatch(r"wx[A-Za-z0-9]{16}", app_id):
        raise RuntimeError("legacy WeChat AppID has an unexpected format")
    if len(app_secret) < 16:
        raise RuntimeError("legacy WeChat AppSecret is unexpectedly short")

    values = {
        "WECHAT_MINI_APP_ID": app_id,
        "WECHAT_MINI_APP_SECRET": app_secret,
    }
    if len(sys.argv) == 6:
        release_tag, api_base, storage_base = sys.argv[3:6]
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,63}", release_tag):
            raise RuntimeError("release tag has an unexpected format")
        for name, url in (("VITE_API_BASE_URL", api_base), ("VITE_STORAGE_BASE_URL", storage_base)):
            if urlparse(url).scheme != "https":
                raise RuntimeError(f"{name} must use https")
        if not api_base.rstrip("/").endswith("/api/v1"):
            raise RuntimeError("VITE_API_BASE_URL must end with /api/v1")
        values.update(
            {
                "RELEASE_TAG": release_tag,
                "VITE_API_BASE_URL": api_base.rstrip("/"),
                "VITE_STORAGE_BASE_URL": storage_base.rstrip("/"),
            }
        )

    update_dotenv(Path(sys.argv[2]), values)
    print(f"WeChat configuration installed: appid={app_id}; AppSecret was not printed")


if __name__ == "__main__":
    main()
