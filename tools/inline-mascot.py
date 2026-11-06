#!/usr/bin/env python3
"""Paste mascot.svg between the mascot markers in index.html.

CSS cannot reach an SVG loaded through <img>, so the hero copy is inlined; the pricing
section keeps the file version. Rerun after editing mascot.svg.
"""
from pathlib import Path

root = Path(__file__).resolve().parent.parent
html = (root / "index.html").read_text(encoding="utf-8")
svg = (root / "mascot-head.svg").read_text(encoding="utf-8").strip()
start, end = "<!-- mascot:start -->", "<!-- mascot:end -->"
before, rest = html.split(start, 1)
_, after = rest.split(end, 1)
(root / "index.html").write_text(before + start + "\n" + svg + "\n" + end + after, encoding="utf-8", newline="\n")
print("inlined mascot-head.svg:", len(svg), "bytes")
