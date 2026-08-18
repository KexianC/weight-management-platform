#!/usr/bin/env python3
"""Create a gzip-compressed MySQL backup without exposing credentials in argv."""

import gzip
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Dict
from urllib.parse import unquote, urlparse


def read_dotenv(path: Path) -> Dict[str, str]:
    values: Dict[str, str] = {}
    for source_line in path.read_text(encoding="utf-8").splitlines():
        line = source_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = value[1:-1]
        values[key.strip()] = value
    return values


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: backup-mysql.py DOTENV OUTPUT.sql.gz")

    env_path = Path(sys.argv[1]).resolve()
    output_path = Path(sys.argv[2]).resolve()
    database_url = read_dotenv(env_path).get("DATABASE_URL", "")
    parsed = urlparse(database_url)
    database = parsed.path.lstrip("/")
    if parsed.scheme != "mysql" or not parsed.hostname or not parsed.username or not parsed.password or not database:
        raise RuntimeError("DATABASE_URL must contain a MySQL host, user, password, and database")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    temporary = output_path.with_name(f".{output_path.name}.partial")
    command = [
        "mysqldump",
        "--single-transaction",
        "--quick",
        "--routines",
        "--triggers",
        "--events",
        "--hex-blob",
        "--no-tablespaces",
        "--default-character-set=utf8mb4",
        "--host",
        parsed.hostname,
        "--port",
        str(parsed.port or 3306),
        "--user",
        unquote(parsed.username),
        "--databases",
        unquote(database),
    ]
    child_env = dict(os.environ)
    child_env["MYSQL_PWD"] = unquote(parsed.password)

    try:
        with gzip.open(temporary, "wb", compresslevel=6) as output:
            process = subprocess.Popen(command, env=child_env, stdout=subprocess.PIPE)
            if process.stdout is None:
                raise RuntimeError("mysqldump stdout pipe was not created")
            with process.stdout:
                shutil.copyfileobj(process.stdout, output, length=1024 * 1024)
            return_code = process.wait()
            if return_code != 0:
                raise subprocess.CalledProcessError(return_code, command)
        if temporary.stat().st_size < 100:
            raise RuntimeError("backup output is unexpectedly small")
        os.chmod(temporary, 0o600)
        os.replace(temporary, output_path)
        os.chmod(output_path, 0o600)
    except Exception:
        if temporary.exists():
            temporary.unlink()
        raise

    print(f"MySQL backup created: {output_path} ({output_path.stat().st_size} compressed bytes)")


if __name__ == "__main__":
    main()
