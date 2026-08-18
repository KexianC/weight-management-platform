#!/usr/bin/env python3
"""Set non-secret public release URLs without printing protected .env values."""

import os
import sys
from pathlib import Path


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: set-production-public-env.py DOTENV")

    path = Path(sys.argv[1])
    values = {
        "VITE_API_BASE_URL": "https://kxjzapi.hzmwmt.cn/api/v1",
        "VITE_STORAGE_BASE_URL": "https://kxjzapi.hzmwmt.cn",
    }
    lines = path.read_text(encoding="utf-8").splitlines()
    output = []
    pending = dict(values)

    for line in lines:
        key = line.split("=", 1)[0].strip() if "=" in line else ""
        if key in pending:
            output.append(f"{key}={pending.pop(key)}")
        else:
            output.append(line)

    if output and output[-1] != "":
        output.append("")
    output.extend(f"{key}={value}" for key, value in pending.items())

    temporary = path.with_name(f".{path.name}.public-urls.tmp")
    temporary.write_text("\n".join(output) + "\n", encoding="utf-8")
    os.chmod(temporary, 0o600)
    os.replace(temporary, path)
    os.chmod(path, 0o600)
    print("Production public URL keys updated")


if __name__ == "__main__":
    main()
