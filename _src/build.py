#!/usr/bin/env python3
"""Сборка сайта AI-часика.

Данные каждого часика — content/NN.json. Сборка кладёт готовый сайт в site/:
  index.html          — главная: поиск и список часиков
  <slug>/index.html   — страница часика
  ukazatel/index.html — указатель: термины, лайфхаки, вопросы со всех часиков
  assets/             — стиль, скрипт, поисковый индекс
Запуск: python3 build.py            → сайт в site/
        python3 build.py <папка>     → сайт в указанную папку (папка пересоздаётся)
"""
import html
import json
import math
import re
import shutil
from pathlib import Path

import sys

ROOT = Path(__file__).parent
OUT = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else ROOT / "site"

SITE_TITLE = "AI-часик"
SITE_FULL = "AI-часик для исследователей"
HOST = "Игорь Волошин"
LEAD_HOME = ("Час про ИИ в работе исследователя: как устроены инструменты и что из этого "
             "работает на практике. Здесь записи и короткие конспекты: пропустили встречу — "
             "прочитайте за три минуты; забыли, где что было, — найдите поиском и откройте запись на нужной минуте.")

e = html.escape


def fmt(t):
    t = int(t)
    return f"{t // 60:02d}:{t % 60:02d}"


def vlink(ch, t):
    return f"{ch['video']}?start_from={max(0, int(t) - 3)}"


def tc(ch, t, label=None):
    return (f'<a class="tc" href="{e(vlink(ch, t))}" target="_blank" rel="noopener noreferrer" '
            f'aria-label="Смотреть запись с {fmt(t)}">{label or fmt(t)}</a>')


TR = dict(zip("абвгдеёжзийклмнопрстуфхцчшщъыьэюя",
              ["a", "b", "v", "g", "d", "e", "e", "zh", "z", "i", "y", "k", "l", "m", "n", "o", "p", "r", "s", "t",
               "u", "f", "h", "c", "ch", "sh", "sch", "", "y", "", "e", "yu", "ya"]))


def slugify(s):
    s = "".join(TR.get(c, c) for c in s.lower())
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def term_id(ch, t):
    """Якорь термина в указателе: номер часика + слово, чтобы один термин из разных часиков не путался."""
    return f"term-{ch['n']}-{slugify(t['term'])}"


def plural(n, one, few, many):
    n10, n100 = n % 10, n % 100
    if n10 == 1 and n100 != 11:
        return one
    if 2 <= n10 <= 4 and not 12 <= n100 <= 14:
        return few
    return many


# ---------- циферблат ----------

def pt(r, deg):
    a = math.radians(deg)
    return r * math.cos(a), r * math.sin(a)


def ang(t):
    return -90 + 360 * t / 3600


def dial(ch, kind="full", animate=False):
    """kind: full — с номерами тем и ссылками; mini — только дуга записи и точки тем."""
    R = 96
    parts = [f'<circle class="face" r="{R}"/>']
    for m in range(60):
        five = m % 5 == 0
        x1, y1 = pt(R - (12 if five else 6), ang(m * 60))
        x2, y2 = pt(R - 2, ang(m * 60))
        parts.append(f'<line class="tick{" five" if five else ""}" x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}"/>')
    if kind == "full":
        for m in (0, 15, 30, 45):
            # подпись часа прячем, если рядом с ней тема — иначе налезает на номер
            if any(abs(((t["t"] / 60 - m + 30) % 60) - 30) < 4.5 for t in ch["topics"]):
                continue
            x, y = pt(R - 21, ang(m * 60))
            parts.append(f'<text class="hour" x="{x:.1f}" y="{y:.1f}">{m}</text>')

    frac = min(ch["durationSec"], 3599) / 3600
    x0, y0 = pt(R, -90)
    x1, y1 = pt(R, ang(ch["durationSec"]))
    large = 1 if frac > 0.5 else 0
    length = 2 * math.pi * R * frac
    parts.append(f'<path class="run" style="--len:{length:.1f}" d="M{x0:.1f},{y0:.1f} A{R},{R} 0 {large} 1 {x1:.1f},{y1:.1f}"/>')

    for t in ch["topics"]:
        x, y = pt(R, ang(t["t"]))
        parts.append(f'<circle class="dot" cx="{x:.1f}" cy="{y:.1f}" r="{3.6 if kind == "full" else 6}"/>')

    if kind == "full":
        placed = []
        for i, t in enumerate(ch["topics"], 1):
            a = ang(t["t"])
            for r in (62, 42, 24):
                x, y = pt(r, a)
                if all((x - px) ** 2 + (y - py) ** 2 > 19 ** 2 for px, py in placed):
                    break
            placed.append((x, y))
            sx1, sy1 = pt(R - 13, a)
            sx2, sy2 = pt(r + 9, a)
            parts.append(
                f'<a class="mark" data-topic="{i}" href="{e(vlink(ch, t["t"]))}" target="_blank" rel="noopener noreferrer" '
                f'aria-label="{i}. {e(t["title"])}, {fmt(t["t"])}">'
                f'<title>{i}. {e(t["title"])} — {fmt(t["t"])}</title>'
                f'<line class="spoke" x1="{sx1:.1f}" y1="{sy1:.1f}" x2="{sx2:.1f}" y2="{sy2:.1f}"/>'
                f'<circle cx="{x:.1f}" cy="{y:.1f}" r="8.5"/><text x="{x:.1f}" y="{y:.1f}">{i}</text></a>')
        center = (f'<text class="center-big" y="4" font-size="20">{ch["durationMin"]}</text>'
                  f'<text class="center-small" y="18" font-size="8">{plural(ch["durationMin"], "минута", "минуты", "минут")} из 60</text>')
        # центр не должен перекрывать отметки с малым радиусом — если они есть, центр убираем
        if any(abs(x) < 22 and abs(y) < 22 for x, y in placed):
            center = ""
        parts.append(center)
    else:
        parts.append(f'<text class="center-big" y="13" font-size="38">{ch["n"]}</text>')

    cls = "dial" + (" animate" if animate else "")
    label = (f'Циферблат часика {ch["n"]}: запись {ch["durationMin"]} минут, '
             f'{len(ch["topics"])} тем по минутам') if kind == "full" else f'Часик {ch["n"]}'
    return (f'<svg class="{cls}" viewBox="-104 -104 208 208" role="img" aria-label="{e(label)}">'
            + "".join(parts) + "</svg>")


LOGO = ('<svg viewBox="-16 -16 32 32" aria-hidden="true"><circle r="14" fill="#fff" stroke="#1D2A2F" stroke-width="2"/>'
        '<path d="M0,-14 A14,14 0 1 1 -8.2,-11.3" fill="none" stroke="#2346B4" stroke-width="3.2" stroke-linecap="round"/>'
        '<line x1="0" y1="0" x2="0" y2="-8" stroke="#1D2A2F" stroke-width="2" stroke-linecap="round"/>'
        '<line x1="0" y1="0" x2="6" y2="3" stroke="#1D2A2F" stroke-width="2" stroke-linecap="round"/>'
        '<circle r="2" fill="#F2B90C"/></svg>')
FAVICON = "data:image/svg+xml," + LOGO.replace('aria-hidden="true"', 'xmlns="http://www.w3.org/2000/svg"').replace("#", "%23").replace('"', "'")


# ---------- общие куски ----------

def head(title, base, desc=""):
    return f"""<!doctype html>
<html lang="ru" data-base="{base}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive, nosnippet, noimageindex">
<meta name="googlebot" content="noindex, nofollow">
<meta name="yandex" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
<link rel="icon" href="{FAVICON}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500;600&family=Unbounded:wght@500;600&display=swap">
<link rel="stylesheet" href="{base}assets/style.css">
</head>
<body>
"""


def top(base, current):
    def nav(href, label, key):
        cur = ' aria-current="page"' if key == current else ""
        return f'<a href="{base}{href}"{cur}>{label}</a>'
    return f"""<header class="wrap top">
  <a class="brand" href="{base}index.html">{LOGO}<span>{SITE_TITLE}</span></a>
  <nav class="nav" aria-label="Разделы">{nav("index.html", "Все часики", "home")}{nav("ukazatel/index.html", "Указатель", "index")}</nav>
</header>
"""


def foot(base):
    return f"""<footer class="wrap foot">
  <p>{SITE_FULL}. Модератор часика — {HOST}.</p>
  <p>Сайт закрыт от поисковиков. Делитесь ссылкой только с участниками.</p>
</footer>
<script src="{base}assets/index.js"></script>
<script src="{base}assets/app.js"></script>
</body>
</html>
"""


def search_box(label, hint):
    return f"""<div class="search" role="search">
  <label for="q">{label}</label>
  <input id="q" type="search" autocomplete="off" placeholder="Например: контекст, лимит, навык">
  <p class="hint">{hint}</p>
  <ul class="results" id="results" aria-live="polite"></ul>
</div>
"""


def btn_video(ch, primary=True):
    play = '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1.5v11l9-5.5z" fill="currentColor"/></svg>'
    return (f'<a class="btn{" primary" if primary else ""}" href="{e(ch["video"])}" target="_blank" '
            f'rel="noopener noreferrer">{play}Смотреть запись</a>')


def reading_minutes(ch):
    chunks = list(ch["summary"])
    for t in ch["topics"]:
        chunks += [t["title"], t["text"]]
    for t in ch["tips"]:
        chunks += [t["title"], t["text"], t.get("prompt", "")]
    for q in ch["questions"]:
        chunks += [q["q"], q["a"]]
    for t in ch.get("try", []):
        chunks.append(t["text"])
    words = len(" ".join(chunks).split())
    return words, max(1, round(words / 200))


# ---------- страницы ----------

def page_home(chs):
    base = ""
    rows = []
    for ch in sorted(chs, key=lambda c: c["n"], reverse=True):
        rows.append(f"""<li class="chasik-row">
  <a class="mini" href="{ch['slug']}/index.html" aria-hidden="true" tabindex="-1">{dial(ch, "mini")}</a>
  <div>
    <div class="when">Часик {ch['n']}. {e(ch['dateText'])}, запись {ch['durationMin']} {plural(ch['durationMin'], 'минута', 'минуты', 'минут')}</div>
    <h3><a href="{ch['slug']}/index.html">{e(ch['title'])}</a></h3>
    <p>{e(ch['lead'])}</p>
    <div class="actions">{btn_video(ch, primary=False)}<a class="btn" href="{ch['slug']}/index.html">Читать конспект</a></div>
  </div>
</li>""")
    n = len(chs)
    return (head(SITE_FULL, base, LEAD_HOME) + top(base, "home") + f"""<main class="wrap">
  <section class="hero">
    <div>
      <h1>{SITE_FULL}</h1>
      <p class="lead">{LEAD_HOME}</p>
      <p class="host">Модератор часика — {HOST}</p>
    </div>
  </section>
  {search_box("Поиск по всем часикам", "Ищет по темам, терминам, лайфхакам и вопросам из зала. Время рядом с результатом открывает запись на этой минуте.")}
  <section data-hide-on-search>
    <div class="list-head"><h2>Все часики</h2><span>{n} {plural(n, 'встреча', 'встречи', 'встреч')}, новые сверху</span></div>
    <ul class="chasiki">
      {''.join(rows)}
    </ul>
  </section>
</main>
""" + foot(base))


def page_chasik(ch, chs):
    base = "../"
    words, mins = reading_minutes(ch)
    topics = "".join(
        f'<li id="topic-{i}" data-topic="{i}"><span class="n" aria-hidden="true">{i}</span>'
        f'<div class="t-head"><h3>{e(t["title"])}</h3>{tc(ch, t["t"])}</div>'
        f'<p class="t-text">{e(t["text"])}</p></li>'
        for i, t in enumerate(ch["topics"], 1))
    tips = []
    for i, t in enumerate(ch["tips"], 1):
        prompt = ""
        if t.get("prompt"):
            prompt = (f'<div class="prompt"><blockquote>{e(t["prompt"])}</blockquote>'
                      f'<button class="copy" type="button">Скопировать</button></div>')
        tips.append(f'<li id="tip-{i}"><h3>{e(t["title"])} {tc(ch, t["t"])}</h3><p>{e(t["text"])}</p>{prompt}</li>')
    qa = "".join(
        f'<div id="q-{i}"><dt>{e(q["q"])}</dt><dd>{e(q["a"])}{tc(ch, q["t"])}</dd></div>'
        for i, q in enumerate(ch["questions"], 1))
    trys = "".join(f'<li>{e(t["text"])} {tc(ch, t["t"])}</li>' for t in ch.get("try", []))
    terms = "".join(
        f'<li><a href="../ukazatel/index.html#{term_id(ch, t)}">{e(t["term"])}</a></li>'
        for t in sorted(ch["terms"], key=lambda x: (0 if re.match(r"[а-яё]", x["term"].lower()) else 1, x["term"].lower().replace("ё", "е"))))
    summary = "".join(f"<p>{e(p)}</p>" for p in ch["summary"])
    materials = (f'<a class="btn" href="{e(ch["materials"])}" target="_blank" rel="noopener noreferrer">Слайды и материалы</a>'
                 if ch.get("materials") else "")

    others = sorted(chs, key=lambda c: c["n"])
    idx = [c["n"] for c in others].index(ch["n"])
    pager = []
    if idx > 0:
        p = others[idx - 1]
        pager.append(f'<a href="../{p["slug"]}/index.html">← Часик {p["n"]}: {e(p["title"])}</a>')
    if idx < len(others) - 1:
        nx = others[idx + 1]
        pager.append(f'<a href="../{nx["slug"]}/index.html">Часик {nx["n"]}: {e(nx["title"])}</a>')
    pager_html = f'<nav class="block" aria-label="Другие часики"><p>{" · ".join(pager)}</p></nav>' if pager else ""

    print(f"  часик {ch['n']}: {words} слов, читать ≈ {mins} мин")
    return (head(f"Часик {ch['n']}. {ch['title']} — {SITE_TITLE}", base, ch["lead"]) + top(base, "") + f"""<main class="wrap">
  <a class="back" href="../index.html">← Все часики</a>
  <header class="page-head">
    <div class="num">Часик {ch['n']}</div>
    <h1>{e(ch['title'])}</h1>
    <p class="meta">{e(ch['dateText'])}. Запись {ch['durationMin']} {plural(ch['durationMin'], 'минута', 'минуты', 'минут')}, читать {mins} {plural(mins, 'минуту', 'минуты', 'минут')}.</p>
    <div class="actions">{btn_video(ch)}{materials}</div>
    <p class="note">Запись открывается в Dion — нужно войти в свой аккаунт. Жёлтое время рядом с темой открывает запись на этой минуте.</p>
  </header>

  <section class="block summary measure"><h2>Коротко</h2>{summary}</section>

  <section class="block"><h2>О чём говорили</h2>
    <div class="topics-grid">
      <ol class="topics">{topics}</ol>
      <div class="dial-wrap">{dial(ch, "full", animate=True)}<p class="dial-caption">Синяя дуга — запись, кружки — темы по минутам часа. Нажмите на номер, чтобы открыть запись с этого места.</p></div>
    </div>
  </section>

  <section class="block measure"><h2>Лайфхаки</h2><ul class="tips">{''.join(tips)}</ul></section>

  <section class="block measure"><h2>Вопросы из зала</h2><dl class="qa">{qa}</dl></section>

  {f'<section class="block measure"><h2>Попробовать до следующего часика</h2><ol class="try">{trys}</ol></section>' if trys else ''}

  <section class="block"><h2>Термины этого часика</h2><ul class="terms">{terms}</ul>
    <p class="terms-more">Определения и минуты записи — в <a href="../ukazatel/index.html">указателе</a>.</p></section>
  {pager_html}
</main>
""" + foot(base))


def page_index(chs):
    base = "../"
    terms, tips, qs = [], [], []
    for ch in chs:
        for t in ch["terms"]:
            terms.append((t, ch))
        for i, t in enumerate(ch["tips"], 1):
            tips.append((t, ch, i))
        for i, q in enumerate(ch["questions"], 1):
            qs.append((q, ch, i))

    def where(ch, t, anchor):
        return (f'<div class="where"><a class="page" href="../{ch["slug"]}/index.html{anchor}">Часик {ch["n"]}</a>'
                f'{tc(ch, t)}</div>')

    # Термины по алфавиту, кириллица первой, латиница после
    def key(x):
        s = x[0]["term"].lower()
        return (0 if re.match(r"[а-яё]", s) else 1, s.replace("ё", "е"))
    terms.sort(key=key)
    groups, letters = [], []
    cur = None
    for t, ch in terms:
        L = t["term"][0].upper()
        L = "A–Z" if re.match(r"[A-Za-z]", L) else L
        if L != cur:
            cur = L
            letters.append(L)
            groups.append(f'<div class="letter" id="letter-{slugify(L) or "lat"}">{L}</div>')
        groups.append(f'<div class="entry" id="{term_id(ch, t)}"><dt>{e(t["term"])}</dt>'
                      f'<dd>{e(t["def"])}{where(ch, t["t"], "")}</dd></div>')
    letter_links = "".join(f'<a href="#letter-{slugify(L) or "lat"}">{L}</a>' for L in letters)

    tips_html = "".join(
        f'<div class="entry"><dt>{e(t["title"])}</dt><dd>{e(t["text"])}{where(ch, t["t"], f"#tip-{i}")}</dd></div>'
        for t, ch, i in sorted(tips, key=lambda x: x[0]["title"].lower()))
    qs_html = "".join(
        f'<div class="entry"><dt>{e(q["q"])}</dt><dd>{e(q["a"])}{where(ch, q["t"], f"#q-{i}")}</dd></div>'
        for q, ch, i in qs)

    return (head(f"Указатель — {SITE_TITLE}", base, "Термины, лайфхаки и вопросы со всех часиков") + top(base, "index") + f"""<main class="wrap">
  <header class="index-head"><h1>Указатель</h1>
    <p>Термины, лайфхаки и вопросы из зала со всех часиков. Жёлтое время открывает запись на той минуте, где об этом говорили.</p>
  </header>
  {search_box("Найти в указателе", "Начните печатать — список сократится до совпадений.")}
  <div data-hide-on-search>
    <section class="block"><h2>Термины</h2><nav class="letters" aria-label="Буквы">{letter_links}</nav><dl class="entries">{''.join(groups)}</dl></section>
    <section class="block"><h2>Лайфхаки</h2><dl class="entries">{tips_html}</dl></section>
    <section class="block"><h2>Вопросы из зала</h2><dl class="entries">{qs_html}</dl></section>
  </div>
</main>
""" + foot(base))


def search_index(chs):
    items = []
    for ch in chs:
        s, n = ch["slug"], ch["n"]
        for t in ch["terms"]:
            items.append(dict(type="term", title=t["term"], text=t["def"], n=n, t=t["t"],
                              href=f"ukazatel/index.html#{term_id(ch, t)}", video=vlink(ch, t["t"])))
        for i, t in enumerate(ch["tips"], 1):
            items.append(dict(type="tip", title=t["title"], text=t["text"] + (" " + t["prompt"] if t.get("prompt") else ""),
                              n=n, t=t["t"], href=f"{s}/index.html#tip-{i}", video=vlink(ch, t["t"])))
        for i, q in enumerate(ch["questions"], 1):
            items.append(dict(type="question", title=q["q"], text=q["a"], n=n, t=q["t"],
                              href=f"{s}/index.html#q-{i}", video=vlink(ch, q["t"])))
        for i, t in enumerate(ch["topics"], 1):
            items.append(dict(type="topic", title=t["title"], text=t["text"], n=n, t=t["t"],
                              href=f"{s}/index.html#topic-{i}", video=vlink(ch, t["t"])))
    return "window.CHASIK_INDEX = " + json.dumps(items, ensure_ascii=False, separators=(",", ":")) + ";\n"


def main():
    chs = [json.loads(p.read_text(encoding="utf-8")) for p in sorted((ROOT / "content").glob("*.json"))]
    if OUT.exists():
        shutil.rmtree(OUT)
    (OUT / "assets").mkdir(parents=True)
    for f in ("style.css", "app.js"):
        shutil.copy(ROOT / "assets" / f, OUT / "assets" / f)
    (OUT / "assets" / "index.js").write_text(search_index(chs), encoding="utf-8")
    (OUT / "index.html").write_text(page_home(chs), encoding="utf-8")
    for ch in chs:
        d = OUT / ch["slug"]
        d.mkdir()
        (d / "index.html").write_text(page_chasik(ch, chs), encoding="utf-8")
    (OUT / "ukazatel").mkdir()
    (OUT / "ukazatel" / "index.html").write_text(page_index(chs), encoding="utf-8")
    (OUT / "robots.txt").write_text("User-agent: *\nDisallow: /\n", encoding="utf-8")
    (OUT / ".nojekyll").write_text("", encoding="utf-8")
    print(f"Готово: {OUT} — {len(chs)} {plural(len(chs), 'часик', 'часика', 'часиков')}")


if __name__ == "__main__":
    main()
