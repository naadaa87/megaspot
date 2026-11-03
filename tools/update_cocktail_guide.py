"""Refresh the public cocktail guide's price page from the website calculator.

Retains every other page, including the complete menu catalogue.
Requires reportlab, pypdf and the Pretendard fonts (FONT_DIR may override).
"""
from io import BytesIO
from pathlib import Path
import os
import re

from pypdf import PdfReader, PdfWriter
from reportlab.lib.colors import HexColor
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parents[1]
PDF = ROOT / "assets/docs/megaspot-cocktail-service-guide.pdf"
FONT_DIR = Path(os.environ.get("FONT_DIR", str(Path.home() / "Library/Fonts")))
for key, suffix in [("PR", "Regular"), ("PS", "SemiBold"), ("PB", "Bold")]:
    pdfmetrics.registerFont(TTFont(key, str(FONT_DIR / f"Pretendard-{suffix}.ttf")))

source = (ROOT / "assets/js/cocktail-calc.js").read_text()
table = re.search(r"var prices=\{([^}]+)\}", source).group(1)
prices = [(int(cups), int(price)) for cups, price in re.findall(r"(\d+):(\d+)", table)]
assert [cups for cups, _ in prices] == [100, 200, 300, 400]

BLUE, DARK, MUTED, LINE, BG = map(HexColor, ["#1F53D5", "#1E2225", "#5B6168", "#D9DDE1", "#F7F7F4"])
buf = BytesIO()
c = canvas.Canvas(buf, pagesize=(960, 540), pageCompression=1)


def text(x, y, label, size=16, color=DARK, font="PR", right=False):
    c.setFillColor(color)
    c.setFont(font, size)
    (c.drawRightString if right else c.drawString)(x, y, label)


c.setFillColor(BG)
c.rect(0, 0, 960, 540, fill=1, stroke=0)
text(52, 497, "MEGA", 20, DARK, "PB")
text(108, 497, "SPOT", 20, BLUE, "PB")
text(908, 498, "PACKAGES & PRICES", 10, BLUE, "PB", True)
c.setStrokeColor(LINE)
c.line(52, 479, 908, 479)
text(52, 27, "MEGASPOT  ·  출장 칵테일 서비스 안내", 9, MUTED, "PS")
text(908, 27, "02", 10, MUTED, "PB", True)
text(52, 431, "행사 규모에 맞는 네 가지 패키지", 29, DARK, "PB")
text(52, 398, "많은 잔을 준비할수록 잔당 가격이 낮아집니다.", 14, MUTED)
for i, (cups, price) in enumerate(prices):
    x, y = 52 + (i % 2) * 438, 235 - (i // 2) * 159
    c.setFillColor(HexColor("#FFFFFF"))
    c.setStrokeColor(LINE)
    c.roundRect(x, y, 418, 142, 14, fill=1, stroke=1)
    c.setFillColor(BLUE if i == 0 else HexColor("#13A0A0") if i == 3 else HexColor("#E6ECFB"))
    c.roundRect(x, y + 132, 418, 10, 5, fill=1, stroke=0)
    text(x + 20, y + 92, f"{cups}잔 패키지", 21, DARK, "PB")
    text(x + 396, y + 91, f"{price // 10000}만 원", 24, BLUE, "PB", True)
    c.setStrokeColor(LINE)
    c.line(x + 20, y + 70, x + 398, y + 70)
    unit = price / cups
    label = ("약 " if price % cups else "") + f"{unit:,.0f}원"
    text(x + 20, y + 32, "잔당", 12, MUTED, "PS")
    text(x + 61, y + 30, label, 16, DARK, "PB")
    text(x + 397, y + 32, "현장 제조", 12, MUTED, "PS", True)
text(52, 51, "※ 표기 가격은 고객 안내 판매가입니다. 부가세·출장 범위·운영 시간·기물 포함 범위는 최종 견적에서 확인합니다.", 10, MUTED)
c.save()
buf.seek(0)
original = PdfReader(PDF)
replacement = PdfReader(buf).pages[0]
writer = PdfWriter()
for i, page in enumerate(original.pages):
    writer.add_page(replacement if i == 1 else page)
if original.metadata:
    writer.add_metadata(dict(original.metadata))
with PDF.open("wb") as output:
    writer.write(output)
print(f"Updated {PDF}: {len(writer.pages)} pages")
