#!/usr/bin/env python3
"""Готовит репозиторий awasof/ai-chasik к коммиту.

Исходники лежат в _src/ этого репозитория, сайт — в корне (GitHub Pages: ветка main, корень).
Скрипт собирает сайт и кладёт его в корень репозитория, не трогая .git и _src.
Запуск из корня клона:  python3 _src/publish.py
Дальше: git add -A && git commit && git push.
"""
import shutil
import subprocess
import sys
from pathlib import Path

SRC = Path(__file__).resolve().parent
REPO = SRC.parent
KEEP = {".git", "_src"}

if SRC.name != "_src" or not (REPO / ".git").exists():
    sys.exit("publish.py должен лежать в _src/ внутри клона awasof/ai-chasik")

subprocess.run([sys.executable, str(SRC / "build.py")], check=True)
site = SRC / "site"

for p in REPO.iterdir():
    if p.name in KEEP:
        continue
    shutil.rmtree(p) if p.is_dir() else p.unlink()
for p in site.iterdir():
    dst = REPO / p.name
    shutil.copytree(p, dst) if p.is_dir() else shutil.copy2(p, dst)
print(f"Сайт разложен в корень {REPO}. Проверьте git status и закоммитьте.")
