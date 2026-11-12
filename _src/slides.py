"""Слайды к часикам: site/slides/<slug>/ и список site/slides/index.html.

Исходники — _src/slides/<slug>/:
  meta.json   — slug, title, short, lead, order; "placeholder": "текст" — колоды ещё нет, будет заглушка
  data.json, host.json, files/, shots/ — колода на движке лекций курса, см. lecture.py:
              каждый слайд — своя страница, под слайдом промпты, файлы и подсказки.
Отдельная строка в списке — "upcoming" в slides/_list.json: то, что будет не слайдами (например, сайт).
Вызывается из build.py: slides.build(OUT, head, top, foot).
"""
import html
import re
import json
import shutil

import lecture
from pathlib import Path

ROOT = Path(__file__).parent / "slides"
e = html.escape


def decks():
    out = []
    for d in sorted(p for p in ROOT.iterdir() if p.is_dir()):
        meta = json.loads((d / "meta.json").read_text(encoding="utf-8"))
        meta["dir"] = d
        out.append(meta)
    return sorted(out, key=lambda m: m.get("order", 0))


def page_deck(m, head, top, foot):
    """Заглушка колоды, которой ещё нет (placeholder в meta.json)."""
    base = "../../"
    body = f"""<main class="wrap deck-page">
  <a class="back" href="../index.html">← Все слайды</a>
  <header class="page-head">
    <h1>{e(m["title"])}</h1>
    <p class="lead-text">{e(m["lead"])}</p>
    <p class="soon">{e(m["placeholder"])}</p>
  </header>
</main>
"""
    out = head(m["title"], base, m["lead"]).replace(
        f'<link rel="stylesheet" href="{base}assets/style.css">',
        f'<link rel="stylesheet" href="{base}assets/style.css">\n<link rel="stylesheet" href="{base}assets/slides.css">')
    return out + top(base, "slides") + body + foot(base)


def page_list(ds, head, top, foot):
    base = "../"
    rows = []
    for m in ds:
        state = "скоро" if m.get("placeholder") else "готово"
        rows.append(f"""<li class="deck-row">
  <div class="when">{state}</div>
  <h3><a href="{e(m["slug"])}/index.html">{e(m["title"])}</a></h3>
  <p>{e(m["lead"])}</p>
</li>""")
    extra = ROOT / "_list.json"
    if extra.exists():
        for u in json.loads(extra.read_text(encoding="utf-8")).get("upcoming", []):
            rows.append(f"""<li class="deck-row">
  <div class="when">позже</div>
  <h3>{e(u["title"])}</h3>
  <p>{e(u["lead"])}</p>
</li>""")
    body = f"""<main class="wrap">
  <header class="index-head"><h1>Слайды</h1>
    <p>Слайды к часикам: что показываю на встрече и по чему повторять дома.</p>
  </header>
  <ul class="decks">
{chr(10).join(rows)}
  </ul>
</main>
"""
    out = head("Слайды — AI-часик", base, "Слайды к часикам").replace(
        f'<link rel="stylesheet" href="{base}assets/style.css">',
        f'<link rel="stylesheet" href="{base}assets/style.css">\n<link rel="stylesheet" href="{base}assets/slides.css">')
    return out + top(base, "slides") + body + foot(base)


def build(out, head, top, foot):
    ds = decks()
    root = out / "slides"
    root.mkdir(parents=True, exist_ok=True)
    shutil.copy(Path(__file__).parent / "assets" / "slides.css", out / "assets" / "slides.css")
    lecture.copy_fonts(out / "assets" / "fonts")
    for m in ds:
        d = root / m["slug"]
        if lecture.is_lecture(m["dir"]):
            n = lecture.build(m["dir"], d, "../../assets/fonts/", hub="../index.html")
            print(f"  {m['slug']}: {n} слайдов")
        else:
            d.mkdir()
            (d / "index.html").write_text(page_deck(m, head, top, foot), encoding="utf-8")
    (root / "index.html").write_text(page_list(ds, head, top, foot), encoding="utf-8")
    print(f"Слайды: {len(ds)} шт. в {root}")
