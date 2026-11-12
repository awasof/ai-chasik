"""Страница-лекция AI-часика на движке сайта лекций курса: каждый слайд — своя страница,
сверху слайд 16:9, ниже разделы A, B, C (промпты с кнопкой «Скопировать», файлы, «Как у меня», «Если не получилось»),
стрелки ← → листают страницы, N — заметки ведущего, P — пульт, F — фокус, M — содержание.

Исходники колоды — _src/slides/<slug>/:
  data.json  — window.LECTURE: meta, parts, slides, prompts, hw, pages (формат — в _src/lecture/README.md)
  host.json  — window.LECTURE_HOST: заметки ведущего по номеру слайда (show, main, next, prep, check) и prep — «Подготовка»
  files/     — файлы для скачивания: ссылка в данных {"file": "имя"} или [текст](files/имя)
  shots/     — скриншоты: имя файла — как в заглушке на слайде
Движок — _src/lecture/: app.js (обобщённая копия движка курса), site.css, brand.css (фирменный стиль курса), fonts/.
Версия одна для всех, как в курсе: заметки ведущего видит любой, кто нажмёт N, — в них только то, что можно показать.
"""
import json
import mimetypes
import shutil
import unicodedata
import urllib.parse
from html import escape as e
from pathlib import Path

ENGINE = Path(__file__).parent / "lecture"

FONTS = [
    ('Source Serif 4', '200 900', 'source-serif-4-cyrillic-opsz-normal.woff2', 'cyr'),
    ('Source Serif 4', '200 900', 'source-serif-4-latin-opsz-normal.woff2', 'lat'),
    ('Golos Text', '400 900', 'golos-text-cyrillic-wght-normal.woff2', 'cyr'),
    ('Golos Text', '400 900', 'golos-text-latin-wght-normal.woff2', 'lat'),
    ('JetBrains Mono', '100 800', 'jetbrains-mono-cyrillic-wght-normal.woff2', 'cyr'),
    ('JetBrains Mono', '100 800', 'jetbrains-mono-latin-wght-normal.woff2', 'lat'),
]
RANGES = {
    'cyr': 'U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116',
    'lat': 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
}
FAVICON = ('<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 32 32%27%3E'
           '%3Crect width=%2732%27 height=%2732%27 rx=%276%27 fill=%27%23141413%27/%3E%3Ccircle cx=%2716%27 cy=%2716%27 r=%277%27 fill=%27%23d0694a%27/%3E%3C/svg%3E">')


def nfc(s):
    return unicodedata.normalize('NFC', s)


def is_lecture(d):
    return (d / "data.json").exists()


def load(d):
    data = json.loads((d / "data.json").read_text(encoding="utf-8"))
    host = json.loads((d / "host.json").read_text(encoding="utf-8")) if (d / "host.json").exists() else None
    return data, host


def count(d):
    return len(load(d)[0]["slides"])


def font_css(src):
    return '\n'.join(
        f'@font-face{{font-family:"{fam}";font-style:normal;font-display:swap;font-weight:{w};'
        f'src:url({src}{f}) format("woff2");unicode-range:{RANGES[r]};}}' for fam, w, f, r in FONTS)


def assets(d):
    def ls(sub, images=False):
        p = d / sub
        out = []
        if p.exists():
            for f in sorted(p.iterdir()):
                if f.is_file() and not f.name.startswith('.'):
                    if images and not (mimetypes.guess_type(f.name)[0] or '').startswith('image/'):
                        continue
                    out.append((nfc(f.name), f))
        return out
    return ls('shots', images=True), ls('files')


def build(d, out, fonts_url, hub="../", hub_label="Все слайды"):
    """Собрать колоду из папки d в out/index.html (+ files/, shots/). fonts_url — путь к шрифтам от страницы."""
    data, host = load(d)
    data["meta"].setdefault("hubLabel", hub_label)
    shots, files = assets(d)
    out.mkdir(parents=True, exist_ok=True)
    smap, fmap = {}, {}
    for sub, items in (("shots", shots), ("files", files)):
        for name, p in items:
            (out / sub).mkdir(exist_ok=True)
            shutil.copyfile(p, out / sub / name)
            url = f"{sub}/" + urllib.parse.quote(name)
            if sub == "shots":
                smap[name] = url
            else:
                ext = p.suffix.lstrip('.').upper() or 'FILE'
                for key in (name, p.stem):
                    fmap[nfc(key).lower().strip()] = [url, ext]
    css = font_css(fonts_url) + "\n" + (ENGINE / "brand.css").read_text(encoding="utf-8") + "\n" + \
        (ENGINE / "site.css").read_text(encoding="utf-8")
    js = lambda o: json.dumps(o, ensure_ascii=False).replace("</", "<\\/")
    title = f'{data["meta"]["title"]} — {data["meta"].get("tag", "")}'.strip(" —")
    page = (
        '<!doctype html>\n<html lang="ru">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        '<meta name="robots" content="noindex, nofollow">\n<meta name="referrer" content="no-referrer">\n'
        f'<title>{e(title)}</title>\n{FAVICON}\n<style>\n{css}\n</style>\n</head>\n<body>\n'
        '<div id="app"></div>\n<noscript><p style="padding:24px">Для страницы нужен JavaScript.</p></noscript>\n'
        f'<script>window.SITE_MODE="all";window.SITE_HUB={js(hub)};</script>\n'
        f'<script>window.LECTURE={js(data)};' + (f'window.LECTURE_HOST={js(host)};' if host else '') + '</script>\n'
        f'<script>window.LECTURE_SHOTS={js(smap)};window.LECTURE_FILES={js(fmap)};</script>\n'
        f'<script>\n{(ENGINE / "app.js").read_text(encoding="utf-8")}\n</script>\n</body>\n</html>\n')
    (out / "index.html").write_text(page, encoding="utf-8")
    return len(data["slides"])


def copy_fonts(dst):
    dst.mkdir(parents=True, exist_ok=True)
    for _, _, f, _ in FONTS:
        shutil.copyfile(ENGINE / "fonts" / f, dst / f)
