"""Published event photos: only reviewed face-mosaiced, exposure-adjusted copies.

The original uploads stay outside the public repository. Used by the home page
and build_reception.py; rerun this file to refresh the home-page section.
"""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = '/assets/img/events/20261102'
CSS_LINK = '<link rel="stylesheet" href="/assets/css/event-gallery.css?v=20261102a">'
SCRIPT_LINK = '<script src="/assets/js/event-gallery.js?v=20261102a"></script>'
PHOTOS = [
    ('테이블에 둘러앉은 모임', '긴 테이블에 둘러앉아 식사와 대화를 나누는 행사 현장'),
    ('함께 나누는 식사', '파티 장식이 있는 공간에서 식사를 나누는 참석자들'),
    ('스크린 앞 행사 현장', '스크린 앞 테이블에 모여 식사하는 행사 전경'),
    ('모임이 채운 공간', '여러 테이블에 참석자들이 모여 있는 실내 행사 전경'),
    ('식사와 대화가 이어지는 시간', '따뜻한 조명 아래 함께 식사하며 교류하는 모임'),
]

def event_gallery_section():
    cards=[]
    for i,(title,alt) in enumerate(PHOTOS,1):
        cards.append(f'''<figure class="event-photo"><a href="{ASSET_DIR}/photo-{i:02}.jpg" data-event-photo data-title="{title}" aria-label="{title} 사진 크게 보기"><img src="{ASSET_DIR}/thumb-{i:02}.jpg" alt="{alt} · 참석자 얼굴 모자이크 처리" width="720" height="540" loading="lazy" decoding="async"><span class="event-photo-zoom" aria-hidden="true">크게 보기 ↗</span></a><figcaption><span>{i:02}</span>{title}</figcaption></figure>''')
    return '''<!-- EVENT_GALLERY_START -->
<section class="section sec-white sec-line" id="event-gallery"><div class="container"><div class="section-head"><div class="eyebrow">Real event moments</div><h2 class="h-l">실제 행사 현장</h2><p class="lead">식사와 대화가 함께하는 모임의 분위기를 사진으로 만나보세요.<br>사진을 누르면 크게 보고, 좌우로 넘겨 5장을 살펴볼 수 있습니다.</p></div><div class="event-photo-grid" data-event-gallery>'''+''.join(cards)+'''</div><p class="tiny muted mt-3">참석자 얼굴을 모자이크하고 밝기를 보정한 현장 사진입니다.</p></div></section>
<!-- EVENT_GALLERY_END -->'''

def build_home():
    path=ROOT/'index.html';page=path.read_text()
    section=event_gallery_section()
    if '<!-- EVENT_GALLERY_START -->' in page:
        page=re.sub(r'<!-- EVENT_GALLERY_START -->.*?<!-- EVENT_GALLERY_END -->',lambda _:section,page,flags=re.S)
    else:
        marker='<!-- ===== 활용 장면 ===== -->'
        if marker not in page:raise ValueError('Home-page insertion point missing')
        page=page.replace(marker,section+'\n\n'+marker,1)
    if CSS_LINK not in page:page=page.replace('</head>',CSS_LINK+'\n</head>')
    if SCRIPT_LINK not in page:page=page.replace('</body>',SCRIPT_LINK+'\n</body>')
    path.write_text(page)

if __name__=='__main__':build_home()
