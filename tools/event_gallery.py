"""Published event photos: only reviewed copies with obscured faces.

The original uploads stay outside the public repository. Used by the home page
and build_reception.py; rerun this file to refresh the home-page section.
"""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = '/assets/img/events/20261102'
FOLDER_ASSET_DIR = '/assets/img/events/20261102-folder'
CSS_LINK = '<link rel="stylesheet" href="/assets/css/event-gallery.css?v=20261102b">'
SCRIPT_LINK = '<script src="/assets/js/event-gallery.js?v=20261102b"></script>'
ORIGINAL_PHOTOS = [
    ('테이블에 둘러앉은 모임', '긴 테이블에 둘러앉아 식사와 대화를 나누는 행사 현장'),
    ('함께 나누는 식사', '파티 장식이 있는 공간에서 식사를 나누는 참석자들'),
    ('스크린 앞 행사 현장', '스크린 앞 테이블에 모여 식사하는 행사 전경'),
    ('모임이 채운 공간', '여러 테이블에 참석자들이 모여 있는 실내 행사 전경'),
    ('식사와 대화가 이어지는 시간', '따뜻한 조명 아래 함께 식사하며 교류하는 모임'),
]
FOLDER_PHOTOS = [
    ('네트워킹 리셉션', '창가 공간에서 참석자들이 서서 대화하는 네트워킹 리셉션'),
    ('뷔페 리셉션', '길게 준비된 뷔페 테이블에서 음식을 담는 참석자들'),
    ('만찬과 네트워킹', '테이블 사이에서 대화를 나누며 저녁 모임을 즐기는 참석자들'),
    ('함께하는 저녁 만찬', '스크린이 있는 공간의 테이블에 둘러앉아 식사하는 참석자들'),
    ('따뜻한 조명의 뷔페', '따뜻한 실내 조명 아래 뷔페를 이용하는 행사 현장'),
    ('리셉션 공간의 대화', '음료가 준비된 리셉션 공간에서 대화하는 참석자들'),
    ('스크린 앞 네트워킹', '스크린 앞에서 소그룹으로 모여 교류하는 행사 현장'),
    ('공간을 채운 네트워킹', '테이블과 창가 사이의 넓은 공간에서 대화하는 참석자들'),
    ('만찬 뷔페 테이블', '뷔페와 음료 테이블 주변에서 식사와 대화를 나누는 참석자들'),
    ('저녁 모임의 한 장면', '긴 테이블에 둘러앉거나 서서 대화를 나누는 저녁 모임 현장'),
]
# New folder photos first; retain all five previously published party photos.
PHOTOS = [(directory, i, title, alt)
          for directory, group in [(FOLDER_ASSET_DIR,FOLDER_PHOTOS),(ASSET_DIR,ORIGINAL_PHOTOS)]
          for i,(title,alt) in enumerate(group,1)]

def event_gallery_section():
    cards=[]
    for order,(directory,i,title,alt) in enumerate(PHOTOS,1):
        cards.append(f'''<figure class="event-photo"><a href="{directory}/photo-{i:02}.jpg" data-event-photo data-title="{title}" aria-label="{title} 사진 크게 보기"><img src="{directory}/thumb-{i:02}.jpg" alt="{alt} · 참석자 얼굴 가림 처리" width="720" height="540" loading="lazy" decoding="async"><span class="event-photo-zoom" aria-hidden="true">크게 보기 ↗</span></a><figcaption><span>{order:02}</span>{title}</figcaption></figure>''')
    return f'''<!-- EVENT_GALLERY_START -->
<section class="section sec-white sec-line" id="event-gallery"><div class="container"><div class="section-head"><div class="eyebrow">Real event moments</div><h2 class="h-l">실제 행사 현장</h2><p class="lead">네트워킹과 뷔페, 식사 모임까지 현장의 분위기를 사진으로 만나보세요.<br>사진을 누르면 크게 보고, 좌우로 넘겨 {len(PHOTOS)}장을 살펴볼 수 있습니다.</p></div><div class="event-photo-grid" data-event-gallery>'''+''.join(cards)+'''</div><p class="tiny muted mt-3">참석자 얼굴은 모자이크·흐림 처리했습니다.</p></div></section>
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
    page=re.sub(r'<link rel="stylesheet" href="/assets/css/event-gallery.css\?v=[^"]+">',lambda _:CSS_LINK,page)
    page=re.sub(r'<script src="/assets/js/event-gallery.js\?v=[^"]+"></script>',lambda _:SCRIPT_LINK,page)
    if CSS_LINK not in page:page=page.replace('</head>',CSS_LINK+'\n</head>')
    if SCRIPT_LINK not in page:page=page.replace('</body>',SCRIPT_LINK+'\n</body>')
    path.write_text(page)

if __name__=='__main__':build_home()
