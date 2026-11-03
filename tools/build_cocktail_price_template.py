"""Build the blank Korean price page used by the live customer guide."""
from pathlib import Path
from io import BytesIO
import re
from pypdf import PdfReader,PdfWriter
from pypdf.generic import DecodedStreamObject,NameObject
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor
import os
ROOT=Path(__file__).resolve().parents[1]
FONT=Path(os.environ.get('FONT_DIR',str(Path.home()/'Library/Fonts')))
for name,suffix in [('R','Regular'),('B','Bold')]:pdfmetrics.registerFont(TTFont(name,str(FONT/f'Pretendard-{suffix}.ttf')))
buf=BytesIO()
c=canvas.Canvas(buf,pagesize=(960,540),pageCompression=0)
BLUE,DARK,MUTED,LINE,BG=map(HexColor,['#1F53D5','#1E2225','#5B6168','#D9DDE1','#F7F7F4'])
def number(cups,field,value,right,y,size,color):
 padded=f'{value:,}'.rjust(16)
 c.setFont('Helvetica-Bold',size);c.setFillColor(color);c.addLiteral(f'%MS_{cups}_{field}')
 c.drawRightString(right,y,padded)
def text(x,y,s,size=12,color=DARK,font='R',right=False):
 c.setFont(font,size);c.setFillColor(color);(c.drawRightString if right else c.drawString)(x,y,s)
c.setFillColor(BG);c.rect(0,0,960,540,fill=1,stroke=0)
text(52,497,'MEGA',20,DARK,'B');text(108,497,'SPOT',20,BLUE,'B');text(908,498,'PACKAGES & PRICES',10,BLUE,'B',True)
c.setStrokeColor(LINE);c.line(52,479,908,479)
text(52,431,'행사 규모에 맞는 네 가지 패키지',29,DARK,'B')
text(52,398,'판매가는 부가세 별도입니다. 합계에는 부가세 10%가 포함됩니다.',14,MUTED)
prices={int(a):int(b) for a,b in re.findall(r'(\d+):(\d+)',re.search(r'var prices=\{([^}]+)\}',(ROOT/'assets/js/cocktail-calc.js').read_text())[1])}
for i,cups in enumerate([100,200,300,400]):
 x,y=52+(i%2)*438,235-(i//2)*159
 c.setFillColor(HexColor('#FFFFFF'));c.setStrokeColor(LINE);c.roundRect(x,y,418,142,14,fill=1,stroke=1)
 c.setFillColor(BLUE if i==0 else HexColor('#13A0A0') if i==3 else HexColor('#E6ECFB'));c.roundRect(x,y+132,418,10,5,fill=1,stroke=0)
 text(x+20,y+104,f'{cups}잔 패키지',20,DARK,'B')
 text(x+20,y+79,'판매가 (부가세 별도)',10,MUTED)
 number(cups,'PRICE',prices[cups],x+380,y+91,22,BLUE)
 text(x+386,y+90,'원',21,BLUE,'B')
 c.setStrokeColor(LINE);c.line(x+20,y+67,x+398,y+67)
 number(cups,'UNIT',round(prices[cups]/cups),x+166,y+44,11,DARK)
 number(cups,'VAT',round(prices[cups]/10),x+166,y+18,11,DARK)
 number(cups,'TOTAL',prices[cups]+round(prices[cups]/10),x+389,y+18,11,BLUE)
 text(x+20,y+44,'잔당 (약)',10,MUTED);text(x+171,y+44,'원',11,DARK,'B')
 text(x+20,y+18,'부가세',10,MUTED);text(x+171,y+18,'원',11,DARK,'B')
 text(x+225,y+18,'합계',10,MUTED);text(x+394,y+18,'원',11,BLUE,'B')
text(52,51,'※ 공간 대관료는 별도입니다. 출장 범위·운영 시간·기물 포함 범위는 최종 견적에서 확인합니다.',10,MUTED)
text(52,27,'MEGASPOT  ·  출장 칵테일 서비스 안내',9,MUTED);text(908,27,'02',10,MUTED,'B',True)
c.save();buf.seek(0)
page=PdfReader(buf).pages[0]
stream=page.get_contents().get_data()
pattern=rb'(%MS_\d+_[A-Z]+\nBT 1 0 0 1 )([\d.]+) ([\d.]+)( Tm \()(.{16})(\) Tj T\* ET)'
def fixed(m):return m[1]+f'{float(m[2]):014.6f} {float(m[3]):014.6f}'.encode()+m[4]+m[5]+m[6]
stream,count=re.subn(pattern,fixed,stream);assert count==16,count
content=DecodedStreamObject();content.set_data(stream);page[NameObject('/Contents')]=content
original=PdfReader(ROOT/'assets/docs/megaspot-cocktail-service-guide.pdf');writer=PdfWriter()
for i,old in enumerate(original.pages):writer.add_page(page if i==1 else old)
if original.metadata:writer.add_metadata(dict(original.metadata))
with (ROOT/'assets/docs/megaspot-cocktail-pricing-template.pdf').open('wb') as f:writer.write(f)

