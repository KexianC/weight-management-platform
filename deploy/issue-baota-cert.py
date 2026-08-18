#!/www/server/panel/pyenv/bin/python3
import json
import os
import sys

if len(sys.argv) != 2:
    raise SystemExit("usage: issue-baota-cert.py <domain>")

domain = sys.argv[1].strip().lower()
if not domain or "/" in domain:
    raise SystemExit("invalid domain")

panel_dir = "/www/server/panel"
os.chdir(panel_dir)
sys.path.insert(0, panel_dir)
sys.path.insert(0, os.path.join(panel_dir, "class"))

import panelSite  # type: ignore
import public  # type: ignore
import OpenSSL  # type: ignore

# BaoTa's older ACME client tries CSR version 2 and catches ValueError, while
# current pyOpenSSL raises a different exception. X509 CSR supports version 0.
_set_csr_version = OpenSSL.crypto.X509Req.set_version


def _set_compatible_csr_version(request, version):
    return _set_csr_version(request, 0 if version != 0 else version)


OpenSSL.crypto.X509Req.set_version = _set_compatible_csr_version

site = public.M("sites").where("name=?", (domain,)).find()
if not site:
    raise RuntimeError(f"BaoTa site does not exist: {domain}")

request = public.dict_obj()
request.siteName = domain
request.domains = json.dumps([domain])
result = panelSite.panelSite().CreateLet(request)
safe_result = {
    key: value
    for key, value in result.items()
    if key not in {"csr", "key", "private_key", "account_key"}
} if isinstance(result, dict) else result
print(json.dumps(safe_result, ensure_ascii=False))
if not isinstance(result, dict) or result.get("status") is not True:
    raise SystemExit(1)
