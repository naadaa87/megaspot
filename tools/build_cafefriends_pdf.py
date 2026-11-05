"""Create the supplier-switch guide and byte-stable optional-price slots.
Missing selling prices render as consultation text, never zero. No supplier costs are embedded.
"""
from pathlib import Path
from io import BytesIO
import json,re
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor
from reportlab.lib.utils import ImageReader
from PIL import Image
from pypdf import PdfReader,PdfWriter
from pypdf.generic import DecodedStreamObject,NameObject
ROOT=Path(__file__).resolve().parents[1];D=json.loads((ROOT/'tools/cafefriends_catalog.json').read_text());W,H=960,540
for n,f in [('R','Regular'),('B','Bold'),('S','SemiBold')]:pdfmetrics.registerFont(TTFont(n,str(Path.home()/'Library/Fonts'/f'Pretendard-{f}.ttf')))
INK='#262B2E';BLUE='#1F53D5';MUTED='#62696E';SOFT='#F5F4F0';LINE='#D9DDE1'
slots=[];path=ROOT/'assets/docs/megaspot-reception-pricing-template.pdf';c=canvas.Canvas(str(path),pagesize=(W,H),pageCompression=0);page=0

def text(x,y,s,size=12,color=INK,font='R'):
 c.setFillColor(HexColor(color));c.setFont(font,size);c.drawString(x,y,str(s))
def wrap(s,width,size=12,font='R'):
 rows=[];row=''
 for ch in str(s):
  if ch=='\n':rows.append(row);row='';continue
  if row and pdfmetrics.stringWidth(row+ch,font,size)>width:rows.append(row);row=ch
  else:row+=ch
 if row:rows.append(row)
 return rows

def para(x,y,s,width,size=12,color=MUTED,font='R',leading=None):
 for row in wrap(s,width,size,font):text(x,y,row,size,color,font);y-=leading or size*1.5
 return y

def rect(x,y,w,h,color):c.setFillColor(HexColor(color));c.rect(x,y,w,h,fill=1,stroke=0)
def pic(filename,x,y,w,h):
 p=ROOT/filename.lstrip('/');im=Image.open(p);
 if im.mode=='RGBA':
  bg=Image.new('RGBA',im.size,'white');bg.alpha_composite(im);im=bg.convert('RGB')
 else:im=im.convert('RGB')
 iw,ih=im.size;scale=min(w/iw,h/ih);buf=BytesIO();im.save(buf,format='JPEG',quality=88,optimize=True);buf.seek(0);c.drawImage(ImageReader(buf),x+(w-iw*scale)/2,y+(h-ih*scale)/2,iw*scale,ih*scale)
def begin(title,subtitle=''):
 global page;page+=1;rect(0,0,W,H,'#FFFFFF');pic('/assets/img/brand/megaspot-official-wordmark-transparent.png',48,475,120,42);text(680,493,'MEGASPOT / CATERING',12,BLUE,'B');rect(48,465,864,1,LINE);text(48,420,title,29,INK,'B');para(48,390,subtitle,864,12);rect(48,45,864,1,LINE);text(48,26,'메가스팟 출장 케이터링 · megaspot.kr/reception · 010-8540-1886',10,MUTED);text(808,26,f'2026.11 / {page:02}',10,MUTED)
def end():c.showPage()
def price(x,y,key,size=17):
 i=len(slots);slots.append(dict(key=key,index=i,size=size,right=x+145))
 c.addLiteral(f'%CF_UNKNOWN_{i}\nBT 0 Tr ET');text(x,y,'상담 후 견적',size,BLUE,'B');c.addLiteral('BT 0 Tr ET')
 c.addLiteral(f'%CF_KNOWN_{i}\nBT 3 Tr ET');text(x,y,'1인' if key.startswith('course.') else '1건',10,MUTED);c.setFont('Helvetica-Bold',size);c.setFillColor(HexColor(BLUE));c.addLiteral('%CF_NUMBER_'+str(i));c.drawRightString(x+145,y,'0'.rjust(16));text(x+151,y,'원 · 부가세 별도',10,MUTED);c.addLiteral('BT 0 Tr ET')

begin('모임에 맞는 메뉴, 공간에 어울리는 세팅','회의의 다과부터 네트워킹 핑거푸드와 든든한 식사까지, 메가스팟이 함께 상담합니다.')
pic('/assets/img/reception/cafefriends/field-80.jpg',435,94,477,272);text(48,329,'5가지 제공 방식',22,BLUE,'B');text(48,290,'행사별 구성 · 희망 메뉴 선택',18,INK,'B');para(48,249,'테이블 세팅 / 박스 케이터링\n다과박스 / 샌드위치 도시락 / 퓨전 도시락',356,14,leading=25);para(48,159,'행사 일정과 인원·예산을 알려 주세요.\n메뉴·제공량·가격은 상담 후 확정합니다.',350,13);text(48,72,'사진: 카페프렌즈 제공 · 실제 세팅과 기본 포함 범위는 행사별로 상담합니다.',10,MUTED);end()
begin('행사에 맞는 다섯 가지 제공 방식','개별 포장과 함께 나누는 구성, 현장 세팅 여부를 함께 확인하세요.')
for i,f in enumerate(D['formats']):
 x=48+(i%3)*298;y=221-(i//3)*157
 pic('/assets/img/reception/cafefriends/'+f['image'],x,y+36,270,109);text(x,y+27,f['caption'],8,MUTED);text(x,y+8,f['name'],17,INK,'B');para(x,y-10,f['check'],270,9,leading=12)
text(650,122,'포장·제공량·세팅·수거',15,BLUE,'B');para(650,99,'실제 제공 범위와 최소 주문 조건은\n상담 후 최종 견적에서 확인합니다.',250,11,leading=17);end()
begin('행사 목적부터 골라도 좋습니다','아래는 상담을 위한 추천 예시이며, 확정 패키지와 제공량은 최종 견적에서 확인합니다.')
for i,co in enumerate(D['offerings'][:3]):
 x=48+i*298;rect(x,98,270,268,SOFT);pic('/assets/img/reception/cafefriends/'+co['image'],x+12,247,246,106);text(x+16,222,co['name'],18,INK,'B');para(x+16,196,co['intro'],236,11,leading=17);price(x+16,119,'course.'+co['id'],16)
para(48,70,'원하는 메뉴가 있다면 맞춤 구성으로 상담할 수 있습니다. 메뉴는 계절과 식재료 수급에 따라 일부 달라질 수 있습니다.',864,10);end()
for category in D['categories']:
 begin(category['name']+' 메뉴','희망 메뉴로 선택할 수 있는 대표 예시입니다. 제공량·주문 수량·단가는 상담 후 안내합니다.')
 rows=[m for m in D['items'] if m['category']==category['id']]
 for i,m in enumerate(rows):
  x=48+i%3*298;y=205-(i//3)*145
  pic(m['image'],x,y+36,270,119);para(x,y+14,m['name'],270,13,INK,'S',18)
 para(48,64,'사진: 카페프렌즈 제공 메뉴 참고 이미지. 사진 속 식기·장식·꽃·음료가 기본 포함 항목을 뜻하지 않습니다.',864,9);end()
begin('공간과 행사가 달라지면, 세팅도 달라집니다','협력사 진행 사례입니다. 메가스팟 현장의 세팅은 공간·메뉴·예산에 맞춰 상담합니다.')
for i,(filename,label) in enumerate([('field-76.jpg','공간 분위기에 맞춘 연출'),('field-65.jpg','핑거푸드 테이블'),('field-75.jpg','박스형 메뉴 진열'),('field-78.jpg','개별 다과와 샌드위치')]):
 x=48+(i%2)*442;y=215-(i//2)*147;pic('/assets/img/reception/cafefriends/'+filename,x,y+18,420,123);text(x,y,label,11,MUTED)
end()
begin('비용과 주문 조건을 함께 확인해 주세요','메뉴와 출장·세팅비는 부가세 별도이며 최종 공급가액에 부가세 10%를 더합니다.')
text(48,348,'테이블 세팅 50명 이하 · 현행 세팅비',17,INK,'B');price(48,315,'fee.cf-table.50',20);para(48,279,'메뉴 금액·공간 대관료는 별도입니다. 그 밖의 인원·제공 방식과 배송·기물·인력·철수 비용은 상담 후 확정합니다.',864,12)
for i,(a,b) in enumerate([('최소 주문·준비 기간','행사 일정·메뉴·제공 방식에 따라 상담 후 확인합니다.'),('메뉴·포함 범위','실제 메뉴·수량·포장·장식·식기·현장 인력·세팅·철수 여부를 견적에 표시합니다.'),('변경·취소','계절·식재료 수급에 따라 메뉴가 일부 달라질 수 있으며, 희망 메뉴 변경과 알레르기는 미리 상담해 주세요.'),('문의','행사 날짜·장소·시간·인원·희망 방식·메뉴·예산을 알려 주세요. megaspot.kr/reception')]):
 y=220-i*41;text(48,y,a,12,BLUE,'B');para(194,y,b,714,11,leading=15)
end();c.save()
reader=PdfReader(path);writer=PdfWriter()
for pg in reader.pages:
 raw=pg.get_contents().get_data()
 raw=re.sub(rb'(%CF_NUMBER_\d+\nBT 1 0 0 1 )([\d.-]+) ([\d.-]+)( Tm \()',lambda m:m[1]+f'{float(m[2]):014.6f} {float(m[3]):014.6f}'.encode()+m[4],raw)
 stream=DecodedStreamObject();stream.set_data(raw);pg[NameObject('/Contents')]=stream;writer.add_page(pg)
writer.add_metadata({'/Title':'메가스팟 출장 케이터링 소개서','/Author':'MEGASPOT'})
with path.open('wb') as out:writer.write(out)
raw=path.read_bytes()
for sl in slots:
 i=sl.pop('index');sl['unknown']=raw.index(f'%CF_UNKNOWN_{i}\nBT '.encode())+len(f'%CF_UNKNOWN_{i}\nBT ');sl['known']=raw.index(f'%CF_KNOWN_{i}\nBT '.encode())+len(f'%CF_KNOWN_{i}\nBT ')
 pos=raw.index(f'%CF_NUMBER_{i}\n'.encode())+len(f'%CF_NUMBER_{i}\n');sl['position']=raw.index(b'BT 1 0 0 1 ',pos)+11;sl['start']=raw.index(b' Tm (',sl['position'])+5
 assert raw[sl['start']+16:sl['start']+17]==b')'
(ROOT/'functions/api/_pdf_reception_cafefriends_slots.js').write_text('export default '+json.dumps(slots,separators=(',',':'))+';\n')
print('Created',len(reader.pages),'pages with',len(slots),'optional price slots')
