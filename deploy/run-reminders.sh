#!/usr/bin/env sh
set -eu

ENV_FILE=/opt/kxjz-weight-care/.env
CRON_SECRET=$(sed -n 's/^REMINDER_CRON_SECRET=//p' "$ENV_FILE" | head -n 1)

if [ "${#CRON_SECRET}" -lt 32 ]; then
  echo "REMINDER_CRON_SECRET is missing or too short" >&2
  exit 1
fi

curl -fsS \
  -X POST \
  -H "X-Cron-Secret: $CRON_SECRET" \
  http://127.0.0.1:13000/api/v1/internal/reminders/run \
  >/dev/null
