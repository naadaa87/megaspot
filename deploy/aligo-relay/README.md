# 알리고 고정 IP 연결

알리고 계정의 ‘발송 서버 IP’ 인증을 유지하는 연결 서버입니다. Cloudflare Pages의 변동 출발 IP를 넓게 허용하지 않습니다. 실제 배포 상태는 아래 운영 기록을 확인합니다. 기존 서버 `158.247.232.204`의 SSH 접속과 Caddy 도메인 `relay.naranhistory.com`을 확인했습니다. 기존 서비스는 그대로 두고 `/megaspot/aligo` 경로를 별도 Node 서비스로 연결합니다.

## 설치할 서버

- 고정 공인 IP가 있는 사용자 소유 서버. 해당 IP를 알리고에 등록합니다.
- Node.js 22.13 이상, 지속 저장 디스크, HTTPS 리버스 프록시.
- `server.mjs`는 `127.0.0.1:8787`에만 바인딩합니다. 외부에는 HTTPS `https://relay.naranhistory.com/megaspot/aligo`만 연결합니다.
- `data/aligo-relay.sqlite`는 영구 디스크에 보관합니다. 전송 요청 ID와 결과를 저장해 재시작·중복 요청에도 같은 발송을 다시 실행하지 않습니다. 결과 미확인 건을 임의 삭제하면 안 됩니다.

## Secret 환경 변수

서버: `ALIGO_USERID`, `ALIGO_API_KEY`, `ALIGO_SENDER_KEY`, `ALIGO_SENDER`, `ALIGO_RELAY_SECRET`(32자 이상 무작위), `ALIGO_TEMPLATE_CODES=UN_2584`.

Cloudflare Pages 운영 환경: `ALIGO_RELAY_URL=https://relay.naranhistory.com/megaspot/aligo`, 같은 `ALIGO_RELAY_SECRET`, `ALIGO_SENDER_KEY`, `ALIGO_SENDER`. **알리고 API 키는 연결 서버에만 보관합니다.** Cloudflare에서 API 키를 보내지 않습니다. 설정 변경 후 기존 프로젝트를 다시 배포합니다.

`ALIGO_LIVE_ENABLED=true`는 연결·승인·시험 수신 확인 후 설정합니다. 어드민의 고객 발송·자동 발송 설정은 별도로 기본 OFF입니다. Preview 배포에 운영 비밀값을 복사하지 않습니다.

## 확인 순서

1. 서버 환경 변수와 지속 디스크 설정 → `node server.mjs`를 프로세스 관리자로 실행.
2. 기존 TLS 도메인에 `/megaspot/aligo` Caddy 경로 연결. 해당 고정 IP는 알리고에 이미 등록되어 있습니다.
3. 메가스팟 어드민에서 ‘승인 상태 확인’으로 서명·연결·본문·버튼 일치 확인.
4. 템플릿 `UN_2584` 승인 후 운영자 실제 시험 수신 및 전송 결과 확인.
5. 확인한 호점만 선택하고 고객 발송 활성화. 기존 확정 고객은 미리보기 후 따로 일괄 발송.

허용 API는 템플릿 조회, 메시지 결과 조회, 단일 수신자 알림톡 전송뿐입니다. HMAC-SHA256 서명·1분 요청 유효시간·고정 수신자 프로필·허용 템플릿 목록·지속 중복 방지를 적용합니다. 대체 문자는 항상 OFF입니다. 운영자가 확인하지 않은 알리고 IP 범위를 추가하거나 기존 다른 서비스 키를 교체하지 않습니다.


## 운영 준비 기록 · 2026-11-03

- 알리고 등록 IP `158.247.232.204`와 이 맥의 기존 SSH 호스트 기록을 대조하고, 기존 키로 접속을 확인했습니다. 서버 호스트명은 `relay`, Node 버전은 `22.22.1`입니다.
- 기존 서비스는 Caddy와 `naranhi-commerce`이며 둘 다 정상 동작 중임을 확인했습니다. 기존 `/socialfactory/aligo/send` 경로를 변경하지 않습니다.
- `/opt/megaspot-aligo/`에 전용 소스·systemd unit·Caddy 경로 설정을 별도로 준비했습니다. 이 서버의 실제 Node 환경에서 모의 API 테스트 6개와 Caddy 임시 설정 검증을 통과했습니다.
- 사용자 본인 인증과 연결 승인을 완료한 뒤 기존 알리고 API 키를 재사용했습니다. 원본 API 키는 서버의 `/etc/megaspot-aligo.env`에 root 전용 권한으로 저장하고, 전용 사용자 `megaspot-aligo`의 systemd 서비스를 활성화했습니다.
- Caddy 기존 설정을 비공개 백업하고 검증한 뒤 `/megaspot/aligo` 경로를 추가했습니다. 기존 Caddy·commerce 서비스와 전용 릴레이 모두 정상 동작합니다. 로컬 서비스와 공개 HTTPS 경로에서 실제 템플릿 조회가 성공했고, `UN_2584`는 `REQ`(검수 중)입니다. 실제 메시지는 발송하지 않았습니다.
- Cloudflare 운영 환경에 연결 변수 5개를 저장했습니다. 서버 인증 키와 메가스팟 발신 키는 Secret으로 보관하고 `ALIGO_LIVE_ENABLED=false`로 유지합니다. 알리고 원본 API 키는 Cloudflare나 저장소에 복사하지 않습니다. 환경 변수 적용을 위해 이 운영 기록과 함께 다시 배포합니다.
- 실제 발송 전에는 `UN_2584` 승인, 호점별 안내 확인, 운영자 시험 수신이 필요합니다. 결과 조회는 이 릴레이가 만든 메시지 ID만 허용해 다른 서비스의 발송 내역을 읽지 못하게 합니다.
