# 알리고 고정 IP 연결

알리고 계정의 ‘발송 서버 IP’ 인증을 유지하는 연결 서버입니다. Cloudflare Pages의 변동 출발 IP를 넓게 허용하지 않습니다. **현재는 서버용 코드만 준비되어 있으며 서버·DNS를 생성하거나 운영하지 않았습니다.** 기존 서버 소유자·사용 권한·고정 IP 확인 후 배포합니다.

## 설치할 서버

- 고정 공인 IP가 있는 사용자 소유 서버. 해당 IP를 알리고에 등록합니다.
- Node.js 24 이상, 지속 저장 디스크, HTTPS 리버스 프록시.
- `server.mjs`는 `127.0.0.1:8787`에만 바인딩합니다. 외부에는 HTTPS `https://aligo.megaspot.kr/v1/aligo`만 연결합니다.
- `data/aligo-relay.sqlite`는 영구 디스크에 보관합니다. 전송 요청 ID와 결과를 저장해 재시작·중복 요청에도 같은 발송을 다시 실행하지 않습니다. 결과 미확인 건을 임의 삭제하면 안 됩니다.

## Secret 환경 변수

서버: `ALIGO_USERID`, `ALIGO_API_KEY`, `ALIGO_SENDER_KEY`, `ALIGO_SENDER`, `ALIGO_RELAY_SECRET`(32자 이상 무작위), `ALIGO_TEMPLATE_CODES=UN_2584`.

Cloudflare Pages 운영 환경: `ALIGO_RELAY_URL=https://aligo.megaspot.kr/v1/aligo`, 같은 `ALIGO_RELAY_SECRET`, `ALIGO_SENDER_KEY`, `ALIGO_SENDER`. **알리고 API 키는 연결 서버에만 보관합니다.** Cloudflare에서 API 키를 보내지 않습니다. 설정 변경 후 기존 프로젝트를 다시 배포합니다.

`ALIGO_LIVE_ENABLED=true`는 연결·승인·시험 수신 확인 후 설정합니다. 어드민의 고객 발송·자동 발송 설정은 별도로 기본 OFF입니다. Preview 배포에 운영 비밀값을 복사하지 않습니다.

## 확인 순서

1. 서버 환경 변수와 지속 디스크 설정 → `node server.mjs`를 프로세스 관리자로 실행.
2. DNS·TLS·리버스 프록시 연결 및 알리고 고정 IP 등록.
3. 메가스팟 어드민에서 ‘승인 상태 확인’으로 서명·연결·본문·버튼 일치 확인.
4. 템플릿 `UN_2584` 승인 후 운영자 실제 시험 수신 및 전송 결과 확인.
5. 확인한 호점만 선택하고 고객 발송 활성화. 기존 확정 고객은 미리보기 후 따로 일괄 발송.

허용 API는 템플릿 조회, 메시지 결과 조회, 단일 수신자 알림톡 전송뿐입니다. HMAC-SHA256 서명·1분 요청 유효시간·고정 수신자 프로필·허용 템플릿 목록·지속 중복 방지를 적용합니다. 대체 문자는 항상 OFF입니다. 운영자가 확인하지 않은 알리고 IP 범위를 추가하거나 기존 다른 서비스 키를 교체하지 않습니다.
