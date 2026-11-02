"""Build the customer-facing, one-page drinks menu from public prices."""
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor
from reportlab.lib.utils import ImageReader
from reportlab.lib.pagesizes import A4
from drinks_content import ROOT, products, CUSTOM_REQUEST, CONDITIONS
import shutil

FONT_DIR=Path('/Users/choejun-won/Library/Fonts')
for name,file in [('R','Regular'),('B','Bold'),('S','SemiBold')]:
    pdfmetrics.registerFont(TTFont(name,str(FONT_DIR/f'Pretendard-{file}.ttf')))
OUT=ROOT/'assets/docs/megaspot-drinks-guide.pdf'
OUT.parent.mkdir(parents=True,exist_ok=True)
W,H=A4
c=canvas.Canvas(str(OUT),pagesize=A4,pageCompression=1)
c.setTitle('메가스팟 주류·음료 안내')
c.setAuthor('MEGASPOT')
c.setSubject('병 칵테일·저도수 와인·무알콜·논알콜 가격 및 맞춤 주류 상담')
INK='#262B2E'; BLUE='#1F53D5'; MUTED='#606872'; PALE='#E6ECFB'; LINE='#D5D0C8'
def rect(x,y,w,h,color):
    c.setFillColor(HexColor(color)); c.rect(x,y,w,h,stroke=0,fill=1)
def text(x,y,s,size=10,color=INK,font='R',align='left'):
    c.setFillColor(HexColor(color));c.setFont(font,size)
    (c.drawRightString if align=='right' else c.drawString)(x,y,s)
def wrap(s,width,size,font='R'):
    lines=[];buf=''
    for ch in s:
        if pdfmetrics.stringWidth(buf+ch,font,size)>width and buf:
            lines.append(buf);buf=ch
        else:buf+=ch
    if buf:lines.append(buf)
    return lines
def paragraph(x,y,s,width,size=9,leading=13,color=MUTED,font='R'):
    for line in wrap(s,width,size,font):
        text(x,y,line,size,color,font);y-=leading
    return y
def picture(path,x,y,w,h):
    img=ImageReader(str(path));iw,ih=img.getSize();scale=min(w/iw,h/ih)
    dw,dh=iw*scale,ih*scale
    c.drawImage(img,x+(w-dw)/2,y+(h-dh)/2,dw,dh,mask='auto')

m=36;right=W-m;inner=W-2*m
logo=ROOT/'assets/img/brand/megaspot-official-wordmark-transparent.png'
picture(logo,m,H-69,126,44)
text(right,H-43,'EVENT DRINKS',9,BLUE,'B','right')
text(right,H-58,'2026.11.02',8,MUTED,'R','right')
rect(m,H-83,inner,0.8,LINE)
text(m,H-122,'행사에 어울리는 한 잔',25,INK,'B')
text(m,H-145,'병 칵테일과 달콤한 와인, 무알콜·논알콜까지 함께 준비하세요.',10,MUTED)
text(m,H-165,'주류 안내가 · 부가세 포함 · 식사 코스 및 대관료 별도',9,BLUE,'S')

top=H-187; header_h=27; row_h=63
x_name=m+57;x_glass=m+290;x_bottle=m+411
rect(m,top-header_h,inner,header_h,INK)
for x,s in [(m+9,'사진'),(x_name,'제품 / 용량·알코올'),(x_glass,'잔·소병 판매'),(x_bottle,'750ml 바틀')]:
    text(x,top-17,s,9,'#FFFFFF','S')
all_products=products()
for i,p in enumerate(all_products):
    y_top=top-header_h-i*row_h;y_bottom=y_top-row_h
    if i%2==0:rect(m,y_bottom,inner,row_h,'#F4F6FA')
    rect(m,y_bottom,inner,0.4,LINE)
    picture(ROOT/p['image'].lstrip('/'),m+3,y_bottom+4,48,57)
    text(x_name,y_top-18,p['name'],10,INK,'S')
    text(x_name,y_top-33,f'{p["category"]} · {p["volume"]}ml · {p["abv"]}',8.1,MUTED)
    paragraph(x_name,y_top-47,p['description'],218,8.1,10,MUTED)
    text(x_glass,y_top-25,f'{p["price"]:,}원',12,BLUE,'B')
    text(x_glass,y_top-41,p['serving'],8.1,MUTED)
    if p['bottlePrice'] is not None:
        text(x_bottle,y_top-25,f'{p["bottlePrice"]:,}원',12,INK,'B')
        text(x_bottle,y_top-41,'750ml 한 병',8.1,MUTED)
    else:
        text(x_bottle,y_top-25,'소병으로 제공',8.1,MUTED)

bottom=top-header_h-len(all_products)*row_h
text(m,bottom-16,'750ml는 150ml씩 약 5잔 분량입니다. 보테가 제로는 알코올 0.5% 미만입니다.',8,MUTED)
text(m,bottom-30,'제품 라벨은 입고 시기에 따라 다를 수 있습니다. 잔·얼음·현장 서빙 등 제공 범위는 상담에서 확인합니다.',7.7,MUTED)
box_top=bottom-47;box_h=91
rect(m,box_top-box_h,inner,box_h,PALE)
text(m+14,box_top-21,'원하시는 주류가 따로 있나요?',13,BLUE,'B')
y=paragraph(m+14,box_top-39,CUSTOM_REQUEST,inner-28,9,13,INK)
paragraph(m+14,y-3,CONDITIONS,inner-28,8.2,12,MUTED)
c.linkURL('https://pf.kakao.com/_LnxbmX/chat',(m,box_top-box_h,right,box_top),relative=0,thickness=0)
text(m,34,'상담 010-8540-1886  |  카카오톡 메가스팟',9,BLUE,'S')
c.linkURL('https://pf.kakao.com/_LnxbmX/chat',(m,29,m+270,46),relative=0,thickness=0)
text(right,34,'megaspot.kr',9,BLUE,'S','right')
c.linkURL('https://megaspot.kr',(right-90,29,right,46),relative=0,thickness=0)
text(m,19,'제품 사진: 데일리샷·와인21 제품 소개 이미지',7,MUTED)
text(right,19,'MEGASPOT',7,MUTED,'S','right')
c.showPage();c.save()
copy=ROOT.parent/'output/pdf/메가스팟_주류_음료_안내.pdf'
copy.parent.mkdir(parents=True,exist_ok=True)
shutil.copy2(OUT,copy)
print(OUT)
print(copy)
