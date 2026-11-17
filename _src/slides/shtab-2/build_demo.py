"""Собирает учебный ZIP и онлайн-дашборд из одних и тех же карточек."""
from pathlib import Path
from tempfile import TemporaryDirectory
from zipfile import ZIP_DEFLATED, ZipFile
import shutil
import subprocess
import sys


ROOT = Path(__file__).resolve().parent
FILES = ROOT / "files"

BUTTON = '''<button type="button" id="confirm-demo" aria-pressed="false">Показать переход в Done</button>
<p id="demo-result" role="status"></p>'''

SCRIPT = '''<script>
const button = document.querySelector('#confirm-demo');
const result = document.querySelector('#demo-result');
const card = document.querySelector('a[href="project-samovyvoz.md"]').closest('article');
const ongoing = card.parentElement;
const done = document.querySelector('main section:last-child');
const initialDetails = [...card.querySelectorAll('p')];
const effect = document.createElement('p');
effect.textContent = 'Проверка эффекта · 01.12.2026';

button.addEventListener('click', () => {
  const confirmed = button.getAttribute('aria-pressed') === 'false';
  button.setAttribute('aria-pressed', String(confirmed));
  for (const detail of initialDetails) detail.hidden = confirmed;
  if (confirmed) {
    card.append(effect);
    done.querySelector('h2').after(card);
  } else {
    effect.remove();
    ongoing.querySelector('h2').after(card);
  }
  button.textContent = confirmed ? 'Вернуть исходный вид' : 'Показать переход в Done';
  result.textContent = confirmed
    ? 'Загрузку в библиотеку подтвердили. «Самовывоз» перешёл в Done.'
    : '«Самовывоз» снова в Ongoing и ждёт подтверждения загрузки.';
});
</script>'''


def main():
    with TemporaryDirectory() as tmp:
        demo = Path(tmp) / "demo-shtaba"
        shutil.copytree(ROOT / "demo", demo)
        shutil.copyfile(FILES / "team-rules.md", demo / "team-rules.md")
        shutil.copyfile(FILES / "prompts.md", demo / "prompts.md")
        subprocess.run([sys.executable, str(demo / "build_dashboard.py")], check=True)
        with ZipFile(FILES / "demo-shtaba.zip", "w", ZIP_DEFLATED) as archive:
            for p in sorted(demo.rglob("*")):
                if p.is_file():
                    archive.writestr((Path(demo.name) / p.relative_to(demo)).as_posix(), p.read_bytes())

        online = (demo / "dashboard.html").read_text(encoding="utf-8")
        for card in sorted((demo / "projects").glob("*/README.md")):
            filename = f"project-{card.parent.name}.md"
            shutil.copyfile(card, FILES / filename)
            online = online.replace(f'href="{card.relative_to(demo).as_posix()}"', f'href="{filename}"')
        online = online.replace('<title>', '<meta name="robots" content="noindex, nofollow">\n<title>', 1)
        online = online.replace('</style>', '''  button { font: inherit; padding: .45rem .8rem; border: 1px solid #356951;
           border-radius: .35rem; color: #1d302a; background: white; cursor: pointer; }
</style>''', 1)
        online = online.replace('</header>', BUTTON + '</header>', 1)
        online = online.replace('</body>', SCRIPT + '\n</body>', 1)
        (FILES / "dashboard.html").write_text(online, encoding="utf-8")


if __name__ == "__main__":
    main()
