from datetime import date
from html import escape
from pathlib import Path


ROOT = Path(__file__).resolve().parent
COLUMNS = (
    ("todo", "To do"),
    ("ongoing", "Ongoing"),
    ("done", "Done — контроль эффекта"),
)


def read_card(path):
    """Читаем шапку демо-карточки: по одному полю «ключ: значение» на строку."""
    opening, _, rest = path.read_text(encoding="utf-8").partition("\n")
    header, end, _ = rest.partition("\n---\n")
    if opening != "---" or not end:
        raise ValueError(f"В {path} отсутствует шапка карточки")
    fields = {}
    for line in header.splitlines():
        if not line.strip():
            continue
        key, sep, value = line.partition(":")
        if not sep or not key.strip():
            raise ValueError(f"Строка шапки в {path}: {line}")
        fields[key.strip()] = value.strip().strip("\"'")
    if not fields.get("имя") or fields.get("status") not in dict(COLUMNS):
        raise ValueError(f"В {path} проверьте поля «имя» и «status»")
    return fields


def render_card(path, fields):
    name = escape(fields["имя"])
    href = escape(path.relative_to(ROOT).as_posix())
    content = []
    for key, label in (("rp", "Номер"), ("стадия", "На очереди"),
                       ("следующий_шаг", "Следующий шаг"), ("за_кем_шаг", "За кем")):
        if fields.get(key) and not (key == "стадия" and fields.get("эффект") == "зафиксирован"):
            content.append(f"<p><b>{label}</b> {escape(fields[key])}</p>")
    for key, label in (("дедлайн", "Срок"), ("проверка_эффекта", "Проверка эффекта")):
        if value := fields.get(key):
            due = date.fromisoformat(value)
            style = ' class="late"' if due < date.today() else ""
            content.append(f"<p{style}><b>{label}</b> {due:%d.%m.%Y}</p>")
    if fields.get("эффект") == "зафиксирован":
        content.append("<p><b>Эффект зафиксирован</b></p>")
    return f'<article><h3><a href="{href}">{name}</a></h3>{"".join(content)}</article>'


def main():
    cards = [(path, read_card(path)) for path in sorted(ROOT.glob("projects/*/README.md"))]
    sections = []
    for status, label in COLUMNS:
        items = [render_card(path, fields) for path, fields in cards if fields["status"] == status]
        sections.append(f"<section><h2>{label}</h2>{''.join(items)}</section>")

    document = """<!doctype html>
<html lang="ru">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Дашборд штаба — учебное демо</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0 auto; max-width: 76rem; padding: clamp(1rem, 4vw, 3rem);
         font: 16px/1.5 system-ui, sans-serif; color: #1d302a; background: #f3f6f4; }
  h1 { margin: 0; font-size: clamp(1.8rem, 4vw, 3rem); letter-spacing: -.035em; }
  header { margin-bottom: 2rem; }
  header p { color: #4b5c54; }
  main { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1rem; align-items: start; }
  section { padding: .95rem; border-top: 3px solid #356951; border-radius: .35rem;
            background: #e5ede7; min-width: 0; }
  h2 { margin: 0 0 .8rem; font-size: 1.1rem; }
  article { margin: .65rem 0 0; padding: .85rem; background: white; border: 1px solid #cad8cf;
            border-radius: .35rem; overflow-wrap: anywhere; }
  h3 { margin: 0 0 .55rem; font-size: 1rem; }
  article p { margin: .35rem 0 0; font-size: .9rem; }
  article b { color: #354a40; }
  a { color: #1c5740; text-underline-offset: .15em; }
  .late, .late b { color: #a32020; }
  @media (max-width: 750px) { main { grid-template-columns: 1fr; } }
</style>
<body>
<header><h1>Штаб исследователя</h1><p>Учебный дашборд с вымышленными проектами</p></header>
<main>""" + "\n".join(sections) + "</main>\n</body>\n</html>\n"
    (ROOT / "dashboard.html").write_text(document, encoding="utf-8")
    print(f"Собран dashboard.html, проектов: {len(cards)}")


if __name__ == "__main__":
    main()
