#!/usr/bin/env python3
"""Clear one-time admin bootstrap variables after the account exists."""

import os
import sys
from pathlib import Path


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: clear-production-admin-bootstrap.py DOTENV")

    path = Path(sys.argv[1])
    keys = {"DEFAULT_ADMIN_USERNAME", "DEFAULT_ADMIN_PASSWORD"}
    lines = path.read_text(encoding="utf-8").splitlines()
    output = []
    seen = set()

    for line in lines:
        key = line.split("=", 1)[0].strip() if "=" in line else ""
        if key in keys:
            output.append(f"{key}=")
            seen.add(key)
        else:
            output.append(line)

    if output and output[-1] != "":
        output.append("")
    output.extend(f"{key}=" for key in sorted(keys - seen))

    temporary = path.with_name(f".{path.name}.admin-bootstrap.tmp")
    temporary.write_text("\n".join(output) + "\n", encoding="utf-8")
    os.chmod(temporary, 0o600)
    os.replace(temporary, path)
    os.chmod(path, 0o600)
    print("One-time admin bootstrap variables cleared")


if __name__ == "__main__":
    main()
