"""Собирает ZIP учебного штаба и интерактивный HTML-прототип из одних карточек."""
from pathlib import Path
from tempfile import TemporaryDirectory
from zipfile import ZIP_DEFLATED, ZipFile
import shutil
import subprocess
import sys


ROOT = Path(__file__).resolve().parent
FILES = ROOT / "files"


def main():
    with TemporaryDirectory() as tmp:
        demo = Path(tmp) / "demo-shtaba"
        shutil.copytree(ROOT / "demo", demo, ignore=shutil.ignore_patterns("__pycache__", ".DS_Store"))
        for name in ("team-rules.md", "prompts.md", "setup-prompts.md", "chrome-setup.md"):
            shutil.copyfile(FILES / name, demo / name)
        subprocess.run([sys.executable, str(demo / "build_dashboard.py")], check=True)
        with ZipFile(FILES / "demo-shtaba.zip", "w", ZIP_DEFLATED) as archive:
            for p in sorted(demo.rglob("*")):
                if p.is_file():
                    archive.writestr((Path(demo.name) / p.relative_to(demo)).as_posix(), p.read_bytes())

        for card in sorted((demo / "projects").glob("*/README.md")):
            shutil.copyfile(card, FILES / f"project-{card.parent.name}.md")
        shutil.copyfile(demo / "dashboard.html", FILES / "dashboard.html")


if __name__ == "__main__":
    main()
