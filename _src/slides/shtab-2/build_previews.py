"""Читаемые страницы для показа учебных Markdown-файлов в браузере."""
from html import escape

try:
    from markdown_it import MarkdownIt
except ImportError:
    MarkdownIt = None


STYLE = """
:root { color: #1e2925; background: #f7f6f1; font: 17px/1.55 system-ui, sans-serif; }
body { margin: 0 auto; max-width: 70rem; padding: clamp(1rem, 4vw, 3rem); }
h1 { font-size: clamp(1.9rem, 4vw, 3.2rem); line-height: 1.13; margin: 1.3rem 0 .6rem; }
h2 { font-size: 1.28rem; margin-top: 1.7rem; }
p { max-width: 72ch; }
a { color: #245c44; text-underline-offset: .17em; }
nav { display: flex; gap: 1rem; flex-wrap: wrap; }
dl { display: grid; grid-template-columns: auto 1fr; gap: .35rem 1rem; width: fit-content;
     padding: 1rem; background: #e6eee7; border-radius: .45rem; }
dt { font-weight: 700; }
dd { margin: 0; }
.content { overflow-x: auto; }
table { border-collapse: collapse; min-width: min(100%, 38rem); }
th, td { text-align: left; padding: .62rem .75rem; vertical-align: top; border-bottom: 1px solid #cbd6cd; }
th { background: #e6eee7; }
ul, ol { padding-inline-start: 1.4rem; }
li { margin: .28rem 0; }
.task-done, .task-open { display: inline-block; min-width: 1.5rem; color: #245c44; font-weight: 700; }
code { font-size: .9em; background: #e9ece6; border-radius: .25rem; padding: .1em .25em; }
pre { padding: .8rem; background: #e9ece6; white-space: pre-wrap; overflow-wrap: anywhere; }
"""


def markdown(text):
    if MarkdownIt is None:
        return f"<pre>{escape(text)}</pre>"
    result = MarkdownIt("commonmark", {"html": False}).enable("table").render(text)
    return (result.replace("<li>[x] ", '<li><span class="task-done">✓</span>')
            .replace("<li>[ ] ", '<li><span class="task-open">☐</span>'))


def page(folder, name, title, content, source, slide):
    filename = escape(source, quote=True)
    html = f"""<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>{escape(title)}</title>
  <style>{STYLE}</style>
</head>
<body>
  <nav aria-label="Материалы занятия"><a href="../index.html#s{slide}">← К слайду {slide}</a>
    <a href="{filename}" download>Скачать исходный Markdown</a></nav>
  <main><h1>{escape(title)}</h1><div class="content">{content}</div></main>
</body>
</html>
"""
    (folder / name).write_text(html, encoding="utf-8")


def build_previews(folder):
    rules = (folder / "team-rules.md").read_text(encoding="utf-8")
    _, _, remainder = rules.partition("\n## Модель статусов\n")
    statuses, _, _ = remainder.partition("\n## Стадии проекта\n")
    if not statuses.strip():
        raise ValueError("В team-rules.md отсутствует раздел «Модель статусов»")
    page(folder, "status-model.html", "Модель статусов", markdown(statuses), "team-rules.md", 3)
    page(folder, "team-rules.html", "Team Rules · пример штаба", markdown(rules.split("\n", 1)[1]), "team-rules.md", 5)

    source = "project-samovyvoz.md"
    card = (folder / source).read_text(encoding="utf-8")
    _, _, rest = card.partition("---\n")
    header, end, body = rest.partition("\n---\n")
    if not end:
        raise ValueError(f"Нет шапки карточки в {source}")
    fields = dict(tuple(line.split(": ", 1)) for line in header.splitlines() if ": " in line)
    status = {"todo": "To do", "ongoing": "Ongoing", "done": "Done"}.get(fields.get("status"), "")
    rows = [("Статус", f"{status} · status: {fields.get('status', '')}"),
            ("Исследователь", fields.get("исследователь")),
            ("Следующий шаг", fields.get("следующий_шаг")), ("За кем шаг", fields.get("за_кем_шаг"))]
    summary = "<dl>" + "".join(f"<dt>{escape(k)}</dt><dd>{escape(v)}</dd>" for k, v in rows if v) + "</dl>"
    page(folder, "project-card.html", fields.get("имя", "Карточка проекта"), summary + markdown(body), source, 6)

    guide = (folder / "chrome-setup.md").read_text(encoding="utf-8").split("\n", 1)[1]
    page(folder, "chrome-setup.html", "Как добавить дашборд в Chrome", markdown(guide), "chrome-setup.md", 12)
