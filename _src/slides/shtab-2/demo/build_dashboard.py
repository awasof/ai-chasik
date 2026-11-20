"""Собирает самодостаточный HTML-прототип из локальных карточек штаба."""
import json
from pathlib import Path
import re


ROOT = Path(__file__).resolve().parent
UI = ROOT / "chrome-extension"


def main():
    projects = ROOT / "projects"
    cards = {
        card.parent.name: card.read_text(encoding="utf-8")
        for card in sorted(projects.glob("*/README.md"))
        if not card.parent.name.startswith((".", "_"))
    }
    rules_json = ROOT / "dashboard-rules.json"
    rules = json.loads(rules_json.read_text(encoding="utf-8")) if rules_json.is_file() else None
    data = json.dumps({"cards": cards, "rules": rules}, ensure_ascii=False).replace("<", "\\u003c")
    css = (UI / "dashboard.css").read_text(encoding="utf-8")
    model = re.sub(r"(?m)^export ", "", (UI / "cards.mjs").read_text(encoding="utf-8"))
    ui = (UI / "dashboard.mjs").read_text(encoding="utf-8").split("\n", 1)[1]
    html = (UI / "dashboard.html").read_text(encoding="utf-8")
    html = html.replace('  <link rel="stylesheet" href="dashboard.css">', f"  <style>\n{css}  </style>")
    html = html.replace('  <script type="module" src="dashboard.mjs"></script>\n', "")
    html = html.replace("<title>", '<meta name="robots" content="noindex, nofollow">\n  <title>', 1)
    script = f"<script type=\"module\">\nwindow.SHTAB_DEMO = {data};\n{model}\n{ui}</script>"
    html = html.replace("</body>", f"{script}\n</body>", 1)
    (ROOT / "dashboard.html").write_text(html, encoding="utf-8")
    print(f"Собран HTML-прототип, проектов: {len(cards)}")


if __name__ == "__main__":
    main()
