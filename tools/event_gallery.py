"""Published event photos: only reviewed copies with obscured faces.

The original uploads stay outside the public repository. Used by the home page;
rerun this file to refresh the home-page section.
"""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = '/assets/img/events/20261102'
FOLDER_ASSET_DIR = '/assets/img/events/20261102-folder'
RECENT_ASSET_DIR = '/assets/img/events/20261104-wine-setting'
RECENT_PHOTOS = [
    ('와인잔과 테이블 세팅', '와인잔과 병이 준비된 긴 테이블과 행사 공간'),
    ('대형 스크린 행사 준비', '대형 빔프로젝터 스크린과 행사 준비 공간'),
    ('창가에서 본 행사장', '창가에서 바라본 테이블 배치와 행사장 전경'),
    ('스크린과 테이블 배치', '스크린 앞에서 이어지는 긴 테이블과 와인잔 세팅'),
    ('정면에서 본 테이블 세팅', '행사장 정면에서 본 테이블과 스크린 배치'),
    ('행사 공간과 동선', '스크린과 테이블 사이의 넓은 이동 공간'),
    ('현장 준비 중인 공간', '와인잔과 테이블을 준비한 실제 행사 현장'),
]
CSS_LINK = '<link rel="stylesheet" href="/assets/css/event-gallery.css?v=20261103customerflow1">'
HOME_CSS_LINK = '<link rel="stylesheet" href="/assets/css/event-gallery.css?v=20261109homepreview1">'
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
          for directory, group in [(RECENT_ASSET_DIR,RECENT_PHOTOS),(FOLDER_ASSET_DIR,FOLDER_PHOTOS),(ASSET_DIR,ORIGINAL_PHOTOS)]
          for i,(title,alt) in enumerate(group,1)]

def event_gallery_section():
    featured = [(RECENT_ASSET_DIR, 3), (RECENT_ASSET_DIR, 2), (FOLDER_ASSET_DIR, 2)]
    by_key = {photo[:2]: photo for photo in PHOTOS}
    ordered = [by_key[key] for key in featured] + [photo for photo in PHOTOS if photo[:2] not in featured]
    cards=[]
    for directory,i,title,alt in ordered:
        cards.append(f'''<figure class="event-photo"><a href="{directory}/photo-{i:02}.jpg" data-event-photo data-title="{title}" aria-label="{title} 사진 크게 보기"><img src="{directory}/thumb-{i:02}.jpg" alt="{alt} · 참석자 얼굴 가림 처리" width="720" height="540" loading="lazy" decoding="async"></a><figcaption>{title}</figcaption></figure>''')
    preview=''.join(cards[:len(featured)])
    rest=''.join(cards[len(featured):])
    more=f'<details class="home-gallery-more"><summary>현장 사진 {len(cards)-len(featured)}장 더 보기</summary><div class="event-photo-grid">{rest}</div></details>' if rest else ''
    return f'''<!-- EVENT_GALLERY_START -->
<section class="section sec-white sec-line" id="event-gallery"><div class="container"><div class="section-head"><h2 class="h-l">실제 행사 현장</h2><p class="lead">홀 전체, 스크린, 뷔페가 행사에서 어떻게 쓰이는지 확인하세요. 사진을 누르면 전체 {len(PHOTOS)}장을 크게 볼 수 있습니다.</p></div><div data-event-gallery><div class="home-event-preview">{preview}</div>{more}</div><p class="tiny muted mt-3">참석자 얼굴은 모자이크·흐림 처리했습니다.</p></div></section>
<!-- EVENT_GALLERY_END -->'''

def build_home():
    path=ROOT/'index.html';page=path.read_text()
    section=event_gallery_section()
    if '<!-- EVENT_GALLERY_START -->' in page:
        page=re.sub(r'<!-- EVENT_GALLERY_START -->.*?<!-- EVENT_GALLERY_END -->',lambda _:section,page,flags=re.S)
    elif 'id="event-gallery"' in page:
        page=re.sub(r'<section\b[^>]*id="event-gallery"[^>]*>.*?</section>',lambda _:section,page,count=1,flags=re.S)
    else:
        marker='<!-- ===== 활용 장면 ===== -->'
        if marker not in page:raise ValueError('Home-page insertion point missing')
        page=page.replace(marker,section+'\n\n'+marker,1)
    page=re.sub(r'<link rel="stylesheet" href="/assets/css/event-gallery.css\?v=[^"]+">',lambda _:HOME_CSS_LINK,page)
    page=re.sub(r'<script src="/assets/js/event-gallery.js\?v=[^"]+"></script>',lambda _:SCRIPT_LINK,page)
    if HOME_CSS_LINK not in page:page=page.replace('</head>',HOME_CSS_LINK+'\n</head>')
    if SCRIPT_LINK not in page:page=page.replace('</body>',SCRIPT_LINK+'\n</body>')
    path.write_text(page)

def build_venue():
    path=ROOT/'spaces/megaspot-gundae/index.html';page=path.read_text()
    cards=[]
    for i,(title,alt) in enumerate(RECENT_PHOTOS,1):
        cards.append(f'<figure class="event-photo"><a href="{RECENT_ASSET_DIR}/photo-{i:02}.jpg" data-event-photo data-title="{title}" aria-label="{title} 사진 크게 보기"><img src="{RECENT_ASSET_DIR}/thumb-{i:02}.jpg" alt="{alt} · 얼굴 가림 처리" width="720" height="540" loading="lazy" decoding="async"><span class="event-photo-zoom" aria-hidden="true">크게 보기 ↗</span></a><figcaption><span>{i:02}</span>{title}</figcaption></figure>')
    section='<!-- VENUE_EVENT_GALLERY_START -->\n<section class="section sec-white sec-line" id="event-gallery"><div class="container"><div class="section-head"><div class="eyebrow">Real event setting</div><h2 class="h-l">행사 준비 현장 사진</h2><p class="lead">와인잔을 준비한 테이블부터 대형 스크린과 전체 배치까지, 실제 현장 7장을 확인하세요.</p></div><div class="event-photo-grid" data-event-gallery>'+''.join(cards)+'</div><p class="tiny muted mt-3">사진을 누르면 크게 볼 수 있습니다. 참석자 얼굴은 가림 처리했습니다.</p></div></section>\n<!-- VENUE_EVENT_GALLERY_END -->'
    if '<!-- VENUE_EVENT_GALLERY_START -->' in page:
        page=re.sub(r'<!-- VENUE_EVENT_GALLERY_START -->.*?<!-- VENUE_EVENT_GALLERY_END -->',lambda _:section,page,flags=re.S)
    else:
        marker='<!-- ===== ② 내부 배치와 동선 ===== -->'
        if marker not in page:raise ValueError('Venue gallery insertion point missing')
        page=page.replace(marker,section+'\n\n'+marker,1)
    if CSS_LINK not in page:page=page.replace('</head>',CSS_LINK+'\n</head>')
    if SCRIPT_LINK not in page:page=page.replace('</body>',SCRIPT_LINK+'\n</body>')
    path.write_text(page)

if __name__=='__main__':
    build_home()
    build_venue()
