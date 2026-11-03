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
text(52, 398, "판매가는 부가세 별도입니다. 계산 합계에는 부가세 10%가 추가됩니다.", 14, MUTED)
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
    text(x + 397, y + 32, "부가세 별도", 11, MUTED, "PS", True)
    text(x + 20, y + 10, f"부가세 {price // 10:,}원 · 합계 {price + price // 10:,}원", 9, MUTED)
text(52, 51, "※ 판매가는 부가세 별도입니다. 출장 범위·운영 시간·기물 포함 범위는 최종 견적에서 확인합니다.", 10, MUTED)
c.showPage()
# Replace the booking page as well, so its footer agrees with the tax policy.
c.setFillColor(BG); c.rect(0,0,960,540,fill=1,stroke=0)
text(52,497,'MEGA',20,DARK,'PB');text(108,497,'SPOT',20,BLUE,'PB')
text(908,498,'HOW TO BOOK',10,BLUE,'PB',True)
c.setStrokeColor(LINE);c.line(52,479,908,479)
text(52,27,'MEGASPOT  ·  출장 칵테일 서비스 안내',9,MUTED,'PS');text(908,27,'06',10,MUTED,'PB',True)
text(52,431,'날짜와 잔 수만 정해도 상담을 시작할 수 있습니다',28,DARK,'PB')
steps=[('01','일정 문의','행사 날짜·장소·시간'),('02','구성 협의','잔 수·저도수·논알코올 비율'),('03','최종 견적','운영 조건과 포함 범위 확인'),('04','현장 서비스','전문 바텐더가 직접 제조')]
for i,(number,title,sub) in enumerate(steps):
    x=52+i*218;c.setFillColor(HexColor('#FFFFFF'));c.setStrokeColor(LINE);c.roundRect(x,238,195,132,12,fill=1,stroke=1)
    text(x+17,337,number,17,BLUE,'PB');text(x+17,298,title,17,DARK,'PB');text(x+17,265,sub,10.5,MUTED)
    if i<3:text(x+201,298,'→',15,BLUE,'PB')
c.setFillColor(BLUE);c.roundRect(52,89,856,124,14,fill=1,stroke=0)
text(76,170,'메가스팟 대관과 함께 문의하세요',22,HexColor('#FFFFFF'),'PB')
text(76,138,'희망 날짜 · 예상 인원 · 잔 수 · 행사 장소를 알려 주시면 상담이 빨라집니다.',13,HexColor('#E7EEFF'))
text(76,108,'카카오톡  pf.kakao.com/_LnxbmX/chat',13,HexColor('#FFFFFF'),'PS');text(880,108,'megaspot.kr',13,HexColor('#FFFFFF'),'PB',True)
c.linkURL('https://pf.kakao.com/_LnxbmX/chat',(52,89,470,213),relative=0)
text(52,54,'공간 대관료와 부가세는 별도입니다. 포함 품목·운영 시간은 상담에서 확정합니다.',10,MUTED)
c.save()
buf.seek(0)
original = PdfReader(PDF)
replacements = PdfReader(buf).pages
writer = PdfWriter()
for i, page in enumerate(original.pages):
    writer.add_page(replacements[0] if i == 1 else replacements[1] if i == 5 else page)
if original.metadata:
    writer.add_metadata(dict(original.metadata))
with PDF.open("wb") as output:
    writer.write(output)
print(f"Updated {PDF}: {len(writer.pages)} pages")
