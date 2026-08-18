#!/usr/bin/env bash
set -euo pipefail

ENV_FILE=/opt/kxjz-weight-care/.env
BACKUP_FILE=${1:-/opt/kxjz-backups/weightcare-before-release.sql.gz}

case "$BACKUP_FILE" in
  /opt/kxjz-backups/*.sql.gz) ;;
  *) echo "Backup path must stay under /opt/kxjz-backups and end with .sql.gz" >&2; exit 2 ;;
esac

mkdir -p "$(dirname "$BACKUP_FILE")"

rm -f "$BACKUP_FILE"
umask 077

/www/server/panel/pyenv/bin/python3 - "$ENV_FILE" "$BACKUP_FILE" <<'PY'
import gzip
import os
import shutil
import subprocess
import sys
from urllib.parse import unquote, urlparse

env_path, backup_path = sys.argv[1:]
database_url = None

with open(env_path, encoding="utf-8") as handle:
    for line in handle:
        if line.startswith("DATABASE_URL="):
            database_url = line.rstrip("\n").split("=", 1)[1].strip()
            break

if not database_url:
    raise SystemExit("DATABASE_URL is missing")

if (
    len(database_url) >= 2
    and database_url[0] == database_url[-1]
    and database_url[0] in {"'", '"'}
):
    database_url = database_url[1:-1]

parsed = urlparse(database_url)
database_name = parsed.path.strip("/")

if parsed.scheme != "mysql" or not parsed.hostname or not parsed.username or not database_name:
    raise SystemExit("DATABASE_URL is not a valid MySQL URL")

command = [
    "mysqldump",
    "--single-transaction",
    "--routines",
    "--triggers",
    "--host",
    parsed.hostname,
    "--port",
    str(parsed.port or 3306),
    "--user",
    unquote(parsed.username),
    database_name,
]

environment = os.environ.copy()
environment["MYSQL_PWD"] = unquote(parsed.password or "")
temporary_path = backup_path + ".sql.partial"

try:
    with open(temporary_path, "wb") as output:
        result = subprocess.run(
            command,
            stdout=output,
            stderr=subprocess.PIPE,
            env=environment,
        )
    if result.returncode != 0:
        message = result.stderr.decode("utf-8", errors="replace").strip()
        raise RuntimeError(message or "mysqldump failed")
    with open(temporary_path, "rb") as source, gzip.open(
        backup_path, "wb", compresslevel=6
    ) as output:
        shutil.copyfileobj(source, output)
except Exception:
    if os.path.exists(backup_path):
        os.remove(backup_path)
    raise
finally:
    if os.path.exists(temporary_path):
        os.remove(temporary_path)
PY

test -s "$BACKUP_FILE"
chmod 600 "$BACKUP_FILE"
echo "DATABASE_BACKUP_READY=$BACKUP_FILE"
