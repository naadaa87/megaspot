# 사진을 WebP 로 한 벌 더 만듭니다 (2026-11-25 · 화면 속도 S8)
#   python3 -I tools/webp/make_webp.py          → 만들 것이 있으면 만들고 몇 장인지 알려 줌
#   python3 -I tools/webp/make_webp.py --check  → 만들어야 할 것이 있으면 목록을 보이고 1로 끝남
# 대상
#   ① 화면 스크립트가 쓰는 공간·장면 사진의 중간(m)·작은(t) 크기: gundae · gundae2 · scenes · views · aerial
#   ② 화면 HTML 의 <img src / srcset / data-src> 가 가리키는 /assets/img/…jpg
# 원본 JPG 는 그대로 둡니다(공유 미리보기·크게 보기·내려받기용). 아주 작은 썸네일은 WebP 가 조금 더 클 수 있지만
# 화면 스크립트가 같은 규칙(.webp)을 쓰도록 모두 만듭니다.
import os, re, sys
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
IMG = os.path.join(ROOT, 'assets', 'img')
SKIP = {'node_modules', '.git', '.claude', 'tools', 'tests', 'assets', 'functions', 'src', 'admin'}
ATTR = re.compile(r'(?:\bsrc|\bdata-src|\bsrcset)="([^"]+)"')

def targets():
    out = set()
    for d in ('gundae', 'gundae2', 'scenes', 'views', 'aerial'):
        for sub in ('m', 't'):
            p = os.path.join(IMG, d, sub)
            if os.path.isdir(p):
                out.update(os.path.join(p, f) for f in os.listdir(p) if f.lower().endswith('.jpg'))
    for base, dirs, files in os.walk(ROOT):
        dirs[:] = [x for x in dirs if x not in SKIP]
        for f in files:
            if not f.endswith('.html'): continue
            html = open(os.path.join(base, f), encoding='utf-8').read()
            for m in ATTR.finditer(html):
                for part in m.group(1).split(','):
                    u = part.strip().split(' ')[0]
                    if u.startswith('/assets/img/') and u.lower().endswith('.jpg'):
                        p = os.path.join(ROOT, u.lstrip('/'))
                        if os.path.isfile(p): out.add(p)
    return sorted(out)

def webp_of(p): return p[:-4] + '.webp'

def need(p):
    w = webp_of(p)
    return not os.path.isfile(w) or os.path.getmtime(w) < os.path.getmtime(p)

def make(p):
    im = Image.open(p)
    if im.mode not in ('RGB', 'RGBA'): im = im.convert('RGB')
    im.save(webp_of(p), 'WEBP', quality=80, method=6)
    return True

if __name__ == '__main__':
    todo = [p for p in targets() if need(p)]
    if '--check' in sys.argv:
        for p in todo: print('WebP 없음:', os.path.relpath(p, ROOT))
        sys.exit(1 if todo else 0)
    made = sum(1 for p in todo if make(p))
    print(f'WebP {made}장을 만들었습니다 (대상 {len(todo)}장).')
