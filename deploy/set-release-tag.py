#!/usr/bin/env python3
"""Atomically update the immutable production release tag."""

import os
import re
import sys
from pathlib import Path


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: set-release-tag.py DOTENV RELEASE_TAG")

    path = Path(sys.argv[1])
    release_tag = sys.argv[2]
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,63}", release_tag):
        raise SystemExit("invalid release tag")
    if release_tag.lower() in {"latest", "local", "dev"}:
        raise SystemExit("release tag must be immutable")

    lines = path.read_text(encoding="utf-8").splitlines()
    output = []
    updated = False
    for line in lines:
        if line.split("=", 1)[0].strip() == "RELEASE_TAG":
            output.append(f"RELEASE_TAG={release_tag}")
            updated = True
        else:
            output.append(line)
    if not updated:
        if output and output[-1] != "":
            output.append("")
        output.append(f"RELEASE_TAG={release_tag}")

    temporary = path.with_name(f".{path.name}.release-tag.tmp")
    temporary.write_text("\n".join(output) + "\n", encoding="utf-8")
    os.chmod(temporary, 0o600)
    os.replace(temporary, path)
    os.chmod(path, 0o600)
    print(f"Release tag updated: {release_tag}")


if __name__ == "__main__":
    main()
