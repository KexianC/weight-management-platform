#!/www/server/panel/pyenv/bin/python3
import json
import os
import sys

PANEL_DIR = "/www/server/panel"
os.chdir(PANEL_DIR)
sys.path.insert(0, PANEL_DIR)
sys.path.insert(0, os.path.join(PANEL_DIR, "class"))

import panelSite  # type: ignore
import public  # type: ignore


def register(domain: str, path: str, description: str) -> None:
    existing = public.M("sites").where("name=?", (domain,)).find()
    if existing:
        print(json.dumps({"domain": domain, "status": "existing", "id": existing.get("id")}, ensure_ascii=False))
        return

    request = public.dict_obj()
    request.webname = json.dumps({"domain": domain, "domainlist": [], "count": 0})
    request.path = path
    request.port = "80"
    request.version = "00"
    request.ftp = "false"
    request.sql = "false"
    request.codeing = "utf8"
    request.type = "PHP"
    request.type_id = "0"
    request.ps = description

    result = panelSite.panelSite().AddSite(request)
    if isinstance(result, dict) and result.get("status") is False:
        raise RuntimeError(f"BaoTa AddSite failed for {domain}: {result}")
    print(json.dumps({"domain": domain, "status": "created", "result": result}, ensure_ascii=False))


register("kxjz.hzmwmt.cn", "/www/wwwroot/kxjz.hzmwmt.cn", "数字减重助手管理后台")
register("kxjzapi.hzmwmt.cn", "/www/wwwroot/kxjzapi.hzmwmt.cn", "轻衡健康独立 API")
