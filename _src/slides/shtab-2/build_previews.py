"""Читаемые страницы для показа учебных Markdown-файлов в браузере."""
from html import escape
import json
import re

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
.checklist { max-width: 37rem; margin: 1.5rem 0; padding: 1rem; border: 1px solid #cbd6cd; border-radius: .45rem; }
.checklist legend { font-weight: 700; }
.checklist label { display: flex; align-items: baseline; gap: .6rem; padding: .4rem; cursor: pointer; }
.checklist input { accent-color: #245642; }
button { font: inherit; padding: .5rem .85rem; background: #245642; color: white; border: 0; border-radius: .45rem; cursor: pointer; }
"""


def markdown(text):
    if MarkdownIt is None:
        return f"<pre>{escape(text)}</pre>"
    result = MarkdownIt("commonmark", {"html": False}).enable("table").render(text)
    return (result.replace("<li>[x] ", '<li><span class="task-done">✓</span>')
            .replace("<li>[ ] ", '<li><span class="task-open">☐</span>'))


def page(folder, name, title, content, source, slide, script=""):
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
{script}
</body>
</html>
"""
    (folder / name).write_text(html, encoding="utf-8")


def checklist_page(folder, card, source, title):
    heading = "## Передача результатов\n"
    before, separator, after = card.partition(heading)
    section, _, _ = after.partition("\n## ")
    if not separator or not section.strip():
        raise ValueError(f"Нет раздела «Передача результатов» в {source}")
    first_line = (before + heading).count("\n")
    labels = []
    for index, line in enumerate(section.splitlines(), start=first_line):
        task = re.fullmatch(r"- \[([ xX])\] (.+)", line)
        if task:
            checked = " checked" if task[1] != " " else ""
            labels.append(f'<label><input type="checkbox" data-line="{index}"{checked}> {escape(task[2])}</label>')
    if not labels:
        raise ValueError(f"Нет галочек передачи результатов в {source}")
    content = f"""
      <p>Учебная карточка. Поставьте галочку рядом с выполненным действием, затем скачайте обновлённую копию Markdown.</p>
      <fieldset class="checklist"><legend>Передача результатов</legend>{''.join(labels)}</fieldset>
      <p id="progress" role="status"></p>
      <button type="button" id="save">Скачать карточку с отметками</button>
    """
    data = json.dumps({"card": card, "filename": source}, ensure_ascii=False).replace("<", "\\u003c")
    script = "<script>\nconst data = " + data + r""";
const inputs = [...document.querySelectorAll('.checklist input')];
function updateCount() {
  const count = inputs.filter(input => input.checked).length;
  document.getElementById('progress').textContent = `Отмечено ${count} из ${inputs.length}`;
}
for (const input of inputs) input.addEventListener('change', updateCount);
updateCount();
document.getElementById('save').addEventListener('click', () => {
  const lines = data.card.split('\n');
  for (const input of inputs) {
    const index = Number(input.dataset.line);
    lines[index] = lines[index].replace(/^(- \[)[ xX](\])/, `$1${input.checked ? 'x' : ' '}$2`);
  }
  const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = data.filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
</script>"""
    page(folder, "project-checklist.html", title, content, source, 7, script)


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
    checklist_page(folder, card, source, fields.get("имя", "Учебный чек-лист"))

    guide = (folder / "chrome-setup.md").read_text(encoding="utf-8").split("\n", 1)[1]
    page(folder, "chrome-setup.html", "Как подключить свой штаб к дашборду в Chrome", markdown(guide), "chrome-setup.md", 12)
