#!/usr/bin/env python3
import os
import re
import sys
from pathlib import Path
from typing import Dict, List


def extract(source: str, name: str) -> str:
    match = re.search(rf"{name}\s*:\s*['\"]([^'\"]+)['\"]", source)
    if not match:
        raise RuntimeError(f"missing {name} in legacy SMS source")
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
    path.write_text("\n".join(output) + "\n", encoding="utf-8")
    os.chmod(path, 0o600)


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: configure-sms-from-legacy.py LEGACY_SMS_JS DOTENV")
    source = Path(sys.argv[1]).read_text(encoding="utf-8")
    values = {
        "ALIBABA_CLOUD_ACCESS_KEY_ID": extract(source, "accessKeyId"),
        "ALIBABA_CLOUD_ACCESS_KEY_SECRET": extract(source, "accessKeySecret"),
        "ALIYUN_SMS_ENDPOINT": "dysmsapi.aliyuncs.com",
        "ALIYUN_SMS_REGION_ID": "cn-hangzhou",
        "ALIYUN_SMS_SIGN_NAME": extract(source, "signName"),
        "ALIYUN_SMS_TEMPLATE_CODE": extract(source, "templateCode"),
    }
    update_dotenv(Path(sys.argv[2]), values)
    print(
        "SMS configuration installed: "
        f"sign={values['ALIYUN_SMS_SIGN_NAME']} "
        f"template={values['ALIYUN_SMS_TEMPLATE_CODE']}"
    )


if __name__ == "__main__":
    main()
