"""Build customer guides with fixed-width live selling-price slots.
Run with bundled Python; templates and slot manifests are deployed together.
"""
from pathlib import Path
from io import BytesIO
import json,re,subprocess,sys
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor
from reportlab.lib.utils import ImageReader
from PIL import Image,ImageOps
from pypdf import PdfReader,PdfWriter
from pypdf.generic import DecodedStreamObject,NameObject
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
import build_reception as reception
for n,f in [('R','Regular'),('B','Bold'),('S','SemiBold')]:pdfmetrics.registerFont(TTFont(n,str(Path.home()/'Library/Fonts'/f'Pretendard-{f}.ttf')))
CAT=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {CATERING} from './functions/api/_catalog.js';console.log(JSON.stringify(CATERING))"],cwd=ROOT))
slots=[]
def live(c,x,y,s,size,color,font):
    cursor=x
    for part in re.split(r'(\[\[[^\]]+\]\])',str(s)):
        if part.startswith('[['):
            key=part[2:-2];numsize=min(size,22);width=142 if size>=20 else 108 if size>=14 else 88
            marker=f'MSFOOD_{len(slots)}';right=cursor+width
            slots.append(dict(marker=marker,key=key,right=right,y=y,size=numsize))
            c.setFillColor(HexColor(color));c.setFont('Helvetica-Bold',numsize);c.addLiteral('%'+marker);c.drawRightString(right,y,'0'.rjust(16));cursor=right+3
        else:
            c.setFillColor(HexColor(color));c.setFont(font,size);c.drawString(cursor,y,part);cursor+=pdfmetrics.stringWidth(part,font,size)
def price(key):return '[['+key+']]'
def finalize(service,path):
    reader=PdfReader(path);writer=PdfWriter();count=0
    for page in reader.pages:
        data=page.get_contents().get_data()
        pattern=rb'(%MSFOOD_\d+\nBT 1 0 0 1 )([\d.-]+) ([\d.-]+)( Tm \()(.{16})(\) Tj T\* ET)'
        def fixed(m):return m[1]+f'{float(m[2]):014.6f} {float(m[3]):014.6f}'.encode()+m[4]+m[5]+m[6]
        data,n=re.subn(pattern,fixed,data);count+=n;content=DecodedStreamObject();content.set_data(data);page[NameObject('/Contents')]=content;writer.add_page(page)
    assert count==len(slots),(count,len(slots));writer.add_metadata({'/Title':'메가스팟 '+('출장뷔페' if service=='catering' else '출장 케이터링')+' 소개서','/Author':'MEGASPOT'})
    with (ROOT/f'assets/docs/megaspot-{service}-pricing-template.pdf').open('wb') as f:writer.write(f)
    raw=(ROOT/f'assets/docs/megaspot-{service}-pricing-template.pdf').read_bytes()
    for slot in slots:
        marker=raw.index(('%'+slot['marker']+'\n').encode());slot['position']=raw.index(b'BT 1 0 0 1 ',marker)+11;slot['start']=raw.index(b' Tm (',slot['position'])+5
        assert raw[slot['start']+16:slot['start']+17]==b')'
    (ROOT/f'functions/api/_pdf_{service}_slots.js').write_text('export default '+json.dumps(slots,ensure_ascii=False,separators=(',',':'))+';\n')
    print(service,len(reader.pages),'pages',len(slots),'live prices')
def build_reception():
    global slots;slots=[]
    source=(ROOT/'tools/build_reception.py').read_text();code=source[source.index('def build_pdf():'):source.index("if __name__=='__main__':")]
    code=code.replace('pageCompression=1','pageCompression=0')
    code=code.replace("c.drawString(x,y,s)","live(c,x,y,s,size,color,font)")
    code=code.replace("for row in wrap(s,width,size,font):", "for row in ([s] if '[[' in s else wrap(s,width,size,font)):")
    code=code.replace("f\"{co['price']:,}원\"", "price('course.'+co['id'])+'원'")
    code=code.replace("'클래식은 1인 35,000원이며, 제공 방식과 인원에 맞는 비용을 더합니다.'", "'클래식은 1인 '+price('course.classic')+'원이며, 제공 방식과 인원에 맞는 비용을 더합니다.'")
    # Show separate lunchbox and box fees so future edits may differ.
    code=code.replace("[(48,'도시락·박스 / 출장·세팅',PACKED_SERVICE_FEES),(490,'테이블 / 출장·세팅·철수',SERVICE_FEES)]", "[(48,'도시락 / 출장·세팅',PACKED_SERVICE_FEES),(345,'박스 / 출장·세팅',PACKED_SERVICE_FEES),(642,'테이블 / 세팅·철수',SERVICE_FEES)]")
    code=code.replace("text(x,363,title,21", "text(x,363,title,17")
    code=code.replace("text(x+12,y,fee['label'],15,muted);text(x+270,y,f\"{fee['price']:,}원\",20,blue,'B')", "text(x+8,y,fee['label'],12,muted);text(x+130,y,price('fee.'+('lunchbox' if x==48 else 'box' if x==345 else 'table')+'.'+str(fee['upto']))+'원',16,blue,'B')")
    code=code.replace("rect(x,128,422,98,chalk)", "rect(x,115,270,110,chalk)")
    code=code.replace("text(x+16,171,f\"메뉴 1,750,000원 + 비용 {fees[0]['price']:,}원\",12,muted)", "text(x+16,170,'메뉴 '+price('example.food')+'원',12,muted);text(x+16,149,'비용 '+price('fee.'+('lunchbox' if x==48 else 'box' if x==345 else 'table')+'.'+str(fees[0]['upto']))+'원',12,muted)")
    code=code.replace("text(x+16,141,f\"합계 {1750000+fees[0]['price']:,}원\",21,blue,'B')", "text(x+16,125,'합계 '+price('example.'+('lunchbox' if x==48 else 'box' if x==345 else 'table'))+'원',16,blue,'B')")
    code=code.replace("f\"{co['name']}  /  {co['price']:,}원\"", "co['name']+'  /  '+price('course.'+co['id'])+'원'")
    code=code.replace("('1BOX' if unit=='BOX' else '1EA')+f' · {price:,}원'", "('1BOX' if unit=='BOX' else '1EA')+' · '+globals()['price']('menu.'+str(j+1).zfill(2))+'원'")
    # Local catalog tuple named price shadows the helper; rename it.
    code=code.replace('name,unit,price=CATALOG[j]','name,unit,item_price=CATALOG[j]')
    ns=dict(vars(reception));ns.update(live=live,price=price,PDF=ROOT/'assets/docs/megaspot-reception-guide.pdf');exec(code,ns);ns['build_pdf']();finalize('reception',ns['PDF'])
def build_catering():
    global slots;slots=[];path=ROOT/'assets/docs/megaspot-catering-guide.pdf';c=canvas.Canvas(str(path),pagesize=(960,540),pageCompression=0);page=0
    def text(x,y,s,size=12,color='#262B2E',font='R'):live(c,x,y,s,size,color,font)
    def rect(x,y,w,h,color):c.setFillColor(HexColor(color));c.rect(x,y,w,h,fill=1,stroke=0)
    def begin(title,subtitle=''):
        nonlocal page;page+=1;rect(0,0,960,540,'#FFFFFF');text(48,493,'MEGASPOT  /  CATERING',15,'#1F53D5','B');rect(48,476,864,1,'#D9DDE1');text(48,430,title,29,font='B');text(48,399,subtitle,12,'#5B6168');rect(48,45,864,1,'#D9DDE1');text(48,25,'메가스팟 출장뷔페  ·  megaspot.kr/catering  ·  010-2384-9580',10,'#5B6168');text(880,25,str(page).zfill(2),10,'#5B6168')
    def end():c.showPage()
    def pic(path,x,y,w,h):
        im=Image.open(path).convert('RGB');im=ImageOps.fit(im,(int(w*2),int(h*2)));buf=BytesIO();im.save(buf,format='JPEG',quality=87);buf.seek(0);c.drawImage(ImageReader(buf),x,y,w,h)
    begin('대관한 그 공간에서, 출장뷔페까지 한 번에','메뉴 상담부터 세팅·수거까지 메가스팟이 함께 준비합니다.')
    pic(ROOT/'assets/img/catering/m/hero.jpg',486,76,426,285);text(48,320,'행사에 맞는 코스와 인원',24,font='B');text(48,278,'식사 · 다과 · 한식 상차림',19,'#1F53D5','B');text(48,230,'20인부터 주문 · 공간 대관료 별도',14);text(48,195,'판매가에 부가세 10%가 더해집니다.',13);text(48,157,'바베큐·생맥주도 함께 상담하세요.',13);end()
    begin('코스별 가격표','판매가 (부가세 별도) · 주문 1건마다 출장·세팅비가 더해집니다.')
    text(48,361,'코스 / 계산 단위',12,font='B');text(540,361,'판매가',12,font='B');text(748,361,'부가세 포함',12,font='B')
    row=0
    for co in CAT['courses']:
        for tier in co.get('tiers',[None]):
            key='course.'+co['id']+('.'+str(tier['people']) if tier else '');y=333-row*23;unit=str(tier['people'])+'인 정액' if tier else '1인 · '+str(co['min'])+'인부터';text(48,y,co['name']+' / '+unit,12);text(535,y,price(key)+'원',12,'#1F53D5','B');text(742,y,price(key+'.gross')+'원',12);row+=1
    text(48,65,'출장·세팅비 '+price('delivery')+'원 (부가세 별도)',11);end()
    for i,co in enumerate(CAT['courses']):
        begin(co['name']+' · 전체 메뉴',str(co['dishes'])+'종 · '+('20·30인 정액' if co['kind']=='flat' else str(co['min'])+'인부터'))
        if co['kind']=='flat':text(48,363,'20인 '+price('course.small.20')+'원 / 30인 '+price('course.small.30')+'원',16,'#1F53D5','B')
        else:text(48,363,'1인 '+price('course.'+co['id'])+'원 (부가세 별도)',16,'#1F53D5','B')
        entries=[]
        for group,menus in co['menu'].items():
            entries.append((CAT['menuLabels'].get(group,group),True));entries.extend((m,False) for m in menus)
        percol=(len(entries)+2)//3
        for j,(item,heading) in enumerate(entries):
            col=j//percol;row=j%percol;x=48+col*294;y=328-row*min(16,240/max(percol-1,1))
            # Keep all menu names, wrap lengthy labels without touching adjacent columns.
            font='B' if heading else 'R';size=11 if heading else 9.5
            while pdfmetrics.stringWidth(item,font,size)>278:size-=.25
            text(x,y,item,size,'#1F53D5' if heading else '#262B2E',font)
        text(48,76,'메뉴는 계절·식재료 수급에 따라 일부 달라질 수 있습니다. 특정 메뉴 변경은 상담해 주세요.',10,'#5B6168')
        if co.get('live'):text(48,58,'즉석 코너: '+co['live'],9,'#5B6168')
        end()
    begin('바베큐 · 생맥주','실내형 완제품 바베큐 · 부가세 별도 판매가')
    for i,b in enumerate(CAT['bbq']['rows']):
        y=351-i*26;text(48,y,b['size']+' / '+b['people'],13);text(270,y,price('bbq.'+b['id'])+'원',13,'#1F53D5','B');text(468,y,'부가세 포함 '+price('bbq.'+b['id']+'.gross')+'원',12)
    text(48,88,'생맥주 1통 (20,000cc · 약 40잔) '+price('beer')+'원',15,'#1F53D5','B');text(48,62,'생맥주는 설치·서빙과 잔·냉각기가 함께 나옵니다. 바베큐는 보온 포장 배송합니다.',10,'#5B6168');end()
    begin('클래식 60명 견적 예시','판매가 기준 · 부가세와 출장·세팅비를 포함해 계산합니다.')
    lines=[('식사 1인 '+price('course.classic')+'원 × 60명','example.food'),('출장·세팅비','delivery'),('판매가 합계 (부가세 별도)','example.net'),('부가세 10%','example.vat'),('결제 합계','example.total')]
    for i,(label,key) in enumerate(lines):
        y=337-i*47;rect(48,y-13,864,37,'#F7F7F4');text(65,y,label,15,font='B' if i==4 else 'R');text(700,y,price(key)+'원',18,'#1F53D5','B')
    text(48,76,'공간 대관료는 별도입니다. 메뉴·인원·행사 장소와 최종 조건을 확인한 후 주문을 확정합니다.',11,'#5B6168');end()
    begin('행사 준비와 주문 안내','날짜·장소·예상 인원·희망 코스를 알려 주세요.')
    for i,(title,desc) in enumerate([('일정과 구성 상담','대관 일정, 메뉴, 반입 동선과 세팅·수거 시간을 함께 확인합니다.'),('견적 확인','최종 인원·판매가·부가세·출장비와 결제 조건을 확인합니다.'),('준비와 진행','행사 전에 테이블을 세팅하고, 행사 후 기물과 식기를 수거합니다.'),('함께 준비할 것','전기·급수·테이블·주차와 엘리베이터 사용 범위를 상담합니다.')]):
        y=340-i*63;text(48,y,'0'+str(i+1)+'  '+title,19,font='B');text(48,y-25,desc,13,'#5B6168')
    text(48,70,'상담 010-2384-9580  ·  카카오톡 pf.kakao.com/_LnxbmX/chat',14,'#1F53D5','B');end();c.save();finalize('catering',path)
if __name__=='__main__':
    build_catering();build_reception()
    # Produce valid default-price snapshots for static/local fallback, too.
    subprocess.run(['node','--input-type=module','-e',"import {readFileSync,writeFileSync} from 'node:fs';import {buildFoodPdf} from './functions/api/_food_pdf.js';import {readFoodPricing,publicFoodPricing} from './functions/api/_food_pricing.js';for(const s of ['catering','reception'])writeFileSync('assets/docs/megaspot-'+s+'-guide.pdf',buildFoodPdf(readFileSync('assets/docs/megaspot-'+s+'-pricing-template.pdf'),s,publicFoodPricing(await readFoodPricing(null,s))));"],cwd=ROOT,check=True)
