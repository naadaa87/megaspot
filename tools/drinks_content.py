"""Shared, statically rendered drinks summary for catering service pages."""
from pathlib import Path
from html import escape as esc
import json
import re

ROOT = Path(__file__).resolve().parents[1]
STAMP = '20261102-bottle'
PDF_URL = f'/assets/docs/megaspot-drinks-guide.pdf?v={STAMP}'
CSS = f'<link rel="stylesheet" href="/assets/css/drinks.css?v={STAMP}">'
CUSTOM_REQUEST = '맥주·소주·와인·위스키·전통주 등 대부분의 주류를 별도 상담으로 준비해 드립니다. 리스트에 없는 희망 제품도 편하게 문의해 주세요.'
CONDITIONS = '희망 제품명·수량·행사일을 알려 주시면 수급 가능 여부와 최종 가격을 안내합니다.'

def products():
    return json.loads((ROOT / 'assets/data/drinks.json').read_text())['products']

def drinks_section():
    by_id = {p['id']:p for p in products()}
    groups = [
        ('바틀 칵테일·저도수 와인','750ml 한 병 기준','sangria',['sangria','villam','bellini']),
        ('한 사람씩 즐기는 병 칵테일','275ml 한 병 기준','bernini',['kgb','bernini']),
        ('무알콜·논알콜 스파클링','750ml 한 병 기준','etoile',['etoile','bottega']),
    ]
    cards=[]
    for title,unit,image_id,ids in groups:
        p=by_id[image_id]
        rows=''.join(f'<li><span>{esc(by_id[k]["name"])}</span><b>{by_id[k]["price"]:,}원</b></li>' for k in ids)
        cards.append(f'''<article class="drinks-card"><div class="drinks-card-image"><img src="{p['image']}" alt="{esc(p['name'])} 제품 이미지" width="600" height="600" loading="lazy"></div><div class="drinks-card-body"><h3>{title}</h3><p class="small muted">{unit}</p><ul class="drinks-price-list">{rows}</ul></div></article>''')
    return f'''<!-- drinks-summary:start -->
<section class="section sec-white sec-line drinks-section" id="drinks" aria-labelledby="drinks-heading">
  <div class="container">
    <div class="section-head split"><div><div class="eyebrow">Drinks for your event</div><h2 class="h-l" id="drinks-heading">식사와 함께, 주류도 준비하세요</h2></div><p class="lead">가벼운 병 칵테일부터 달콤한 와인, 무알콜·논알콜까지.<br>5,000원부터 행사 분위기에 맞춰 선택할 수 있습니다.</p></div>
    <div class="drinks-grid">{''.join(cards)}</div>
    <p class="small muted mt-2">모든 제품은 바틀(병) 단위로 판매합니다. 주류 안내가는 부가세 포함이며 식사 코스·대관료와 별도입니다. 제품 사진과 전체 가격은 PDF에서 확인할 수 있습니다. 보테가 제로는 알코올 0.5% 미만입니다.</p>
    <div class="drinks-request mt-3"><div><h3 class="h-s">원하시는 주류가 따로 있나요?</h3><p class="mt-1">{CUSTOM_REQUEST}</p><p class="small muted mt-1">{CONDITIONS} 현장 제공 조건도 함께 안내합니다.</p></div><div class="drinks-actions"><a class="btn btn-primary" href="{PDF_URL}" target="_blank" rel="noopener">제품 사진·전체 가격표 PDF ↗</a><a class="btn btn-light" href="{PDF_URL}" download="메가스팟_주류_음료_안내.pdf">PDF 다운로드 ↓</a><a class="btn btn-kakao" href="https://pf.kakao.com/_LnxbmX/chat" target="_blank" rel="noopener" data-kakao>희망 주류 문의</a></div></div>
  </div>
</section>
<!-- drinks-summary:end -->
'''

def update_pages():
    for name in ['catering','reception']:
        dest=ROOT/name/'index.html'
        page=dest.read_text()
        page=re.sub(r'<!-- drinks-summary:start -->.*?<!-- drinks-summary:end -->\s*','',page,flags=re.S)
        if '/assets/css/drinks.css' not in page: page=page.replace('</head>',CSS+'\n</head>')
        else: page=re.sub(r'<link rel="stylesheet" href="/assets/css/drinks\.css[^\"]*">',CSS,page)
        marker='<!-- ===== 06 사진 ===== -->' if name=='catering' else '<section class="section sec-white sec-line" id="process">'
        assert marker in page, f'Missing drinks insertion target: {name}'
        page=page.replace(marker,drinks_section()+'\n'+marker,1)
        if name=='catering' and 'href="#drinks"' not in page:
            page=page.replace('<a class="btn btn-ghost btn-lg" href="/inquiry/?catering=1#estimate">','<a class="btn btn-light btn-lg" href="#drinks">주류·논알콜 안내 ↓</a>\n          <a class="btn btn-ghost btn-lg" href="/inquiry/?catering=1#estimate">',1)
        if name=='reception' and 'href="#drinks"' not in page:
            page=page.replace('<a href="#process">진행 안내</a>','<a href="#drinks">주류·논알콜</a><a href="#process">진행 안내</a>',1)
        if name=='catering':
            page=page.replace('표시 금액은 부가세 별도입니다. 결제할 때 10%가 더해집니다.','뷔페·바베큐·생맥주 금액은 부가세 별도이며 결제할 때 10%가 더해집니다. 아래 바틀 주류 안내가는 부가세 포함입니다.',1)
            page=page.replace('아래 병·잔 주류 안내가는','아래 바틀 주류 안내가는')
        dest.write_text(page)

if __name__=='__main__':
    update_pages()
