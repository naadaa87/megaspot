"""Publish reviewed cocktail field photos and the home-page cocktail thumbnail.

Run after exporting face-mosaiced photos and thumbnails to the asset directory.
The source uploads remain outside the public repository. The first original
photo is explicitly authorized for the unmasked home-page thumbnail.
"""
from pathlib import Path
import re
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
ASSET_DIR='/assets/img/cocktail/field/20261102'
HOME_PHOTO=ASSET_DIR+'/home-bartender.jpg'
CSS_LINK='<link rel="stylesheet" href="/assets/css/cocktail-field.css?v=20261102a">'
SCRIPT_LINK='<script src="/assets/js/event-gallery.js?v=20261102b"></script>'
PHOTOS=[
    ('바텐더와 바 테이블','바 테이블에서 주류와 바 도구를 준비하는 출장 바텐더'),
    ('칵테일 현장 제조','바텐더들이 지거로 계량하며 파란색 칵테일을 준비하는 모습'),
    ('웰컴 드링크 세팅','리본과 꽃 장식으로 준비한 웰컴 드링크 잔'),
    ('바텐딩 퍼포먼스','실제 행사 현장에서 진행한 바텐딩 퍼포먼스'),
    ('리셉션 칵테일 서비스','행사 참석자 앞에서 다양한 색의 칵테일을 제공하는 바텐더들'),
]

def gallery_section():
    cards=[]
    for i,(title,alt) in enumerate(PHOTOS,1):
        with Image.open(ROOT/f'{ASSET_DIR.lstrip("/")}/thumb-{i:02}.jpg') as im:w,h=im.size
        cards.append(f'<figure><a href="{ASSET_DIR}/photo-{i:02}.jpg" data-event-photo data-title="{title}" aria-label="{title} 사진 크게 보기"><img src="{ASSET_DIR}/thumb-{i:02}.jpg" alt="{alt}" width="{w}" height="{h}" loading="lazy" decoding="async"><span aria-hidden="true">크게 보기 ↗</span></a><figcaption><small>{i:02}</small>{title}</figcaption></figure>')
    return '''<!-- COCKTAIL_FIELD_START -->
<section class="section sec-line" id="field-gallery"><div class="container"><div class="section-head"><div class="eyebrow">On-site cocktail service</div><h2 class="h-l">실제 현장 사진</h2><p class="lead">바텐더의 현장 제조부터 웰컴 드링크와 바 테이블, 퍼포먼스까지.<br>사진을 누르면 실제 행사 현장 5장을 크게 볼 수 있습니다.</p></div><div class="cocktail-field-grid" data-event-gallery>'''+''.join(cards)+'''</div><p class="tiny muted mt-3">참석자와 바텐더 얼굴은 모자이크 처리했습니다. 사진 속 메뉴·잔·장식·퍼포먼스의 제공 가능 여부와 포함 범위는 상담에서 확인합니다.</p></div></section>
<!-- COCKTAIL_FIELD_END -->'''

def add_css(page):
    page=re.sub(r'<link rel="stylesheet" href="/assets/css/cocktail-field.css\?v=[^"]+">',lambda _:CSS_LINK,page)
    return page if CSS_LINK in page else page.replace('</head>',CSS_LINK+'\n</head>')

def build():
    path=ROOT/'cocktail/index.html';page=path.read_text();section=gallery_section()
    if '<!-- COCKTAIL_FIELD_START -->' in page:
        page=re.sub(r'<!-- COCKTAIL_FIELD_START -->.*?<!-- COCKTAIL_FIELD_END -->',lambda _:section,page,flags=re.S)
    else:
        marker='<section class="section sec-white sec-line" id="calc">'
        if marker not in page:raise ValueError('Cocktail gallery insertion point missing')
        page=page.replace(marker,section+'\n'+marker,1)
    if 'href="#field-gallery"' not in page:
        marker='<a class="btn btn-ghost btn-lg" href="/assets/docs/megaspot-cocktail-service-guide.pdf?v=202610302230" target="_blank" rel="noopener">소개서 PDF 보기</a>'
        if marker not in page:raise ValueError('Cocktail gallery jump-link insertion point missing')
        page=page.replace(marker,marker+'<a class="btn btn-ghost btn-lg" href="#field-gallery">실제 현장 사진 보기 ↓</a>',1)
    page=add_css(page)
    if SCRIPT_LINK not in page:page=page.replace('</body>',SCRIPT_LINK+'\n</body>')
    path.write_text(page)
    path=ROOT/'index.html';page=path.read_text()
    with Image.open(ROOT/HOME_PHOTO.lstrip('/')) as im:w,h=im.size
    img=f'<img src="{HOME_PHOTO}" alt="출장 칵테일 실제 현장 · 바텐더와 바 테이블" width="{w}" height="{h}" loading="lazy" decoding="async">'
    page,count=re.subn(r'(<div class="cat-band cocktail-home-band"><div class="cat-band-ph">)<img[^>]+>',lambda m:m[1]+img,page,count=1)
    if count!=1:raise ValueError('Home cocktail thumbnail not found')
    path.write_text(add_css(page))

if __name__=='__main__':build()
