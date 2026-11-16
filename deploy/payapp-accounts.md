# 페이앱 계정 전환 — 기존 거래 보존

신규 요청은 지유공간개발 계정으로 만들고, 기존 블랭크 거래는 원래 계정의 승인·입금·취소 통보로 계속 처리합니다. 기존 주문·예약·환불 금액·거래번호·nonce는 삭제하거나 새 거래로 바꾸지 않습니다.

## 운영 설정

기존 Production Secret 네 개 `PAYAPP_USERID`, `PAYAPP_LINKKEY`, `PAYAPP_LINKVAL`, `PAYAPP_REQUESTKEY`는 블랭크 값 그대로 유지합니다. 새 값으로 교체하거나 구계정을 해지하면 기존 거래 통보를 처리할 수 없습니다.

| 추가 항목 | 값 | 저장 방식 |
| --- | --- | --- |
| `PAYAPP_JIYU_USERID` | `guspacedev` | Secret |
| `PAYAPP_JIYU_LINKKEY` | 새 계정 연동 KEY | Secret |
| `PAYAPP_JIYU_LINKVAL` | 새 계정 연동 VALUE | Secret |
| `PAYAPP_JIYU_REQUESTKEY` | 새 계정 결제 KEY | Secret |
| `PAYAPP_ACTIVE_ACCOUNT` | `legacy` 또는 `jiyu` | 일반 변수 |

선택을 생략하면 `legacy`를 유지합니다. `jiyu` 선택 시 새 계정 네 값과 기존 계정 네 값이 모두 있어야 신규 결제가 활성화됩니다. 불완전하거나 계정 ID가 중복되면 다른 계정으로 대신 결제하지 않고 요청을 차단합니다. `PAYAPP_ENABLED=0`도 신규 요청만 중단하며, 유효한 과거 거래 통보는 계속 처리합니다.

## 배포·전환 순서

1. 최신 운영 소스에서 이 변경만 반영합니다. 로컬 작업 중인 다른 변경을 함께 배포하지 않습니다.
2. 기존 네 Secret을 그대로 둔 상태로 계정 구분 코드를 먼저 배포합니다. 새 Secret을 추가해도 활성 계정을 전환하기 전에는 블랭크로 신규 요청합니다.
3. 기존 DB에는 `merchant_userid` 두 칸과 `host_billing_pay_requests`만 추가합니다. 기존 NULL 계정은 블랭크로 해석합니다. API 미들웨어의 자동 스키마 초기화가 이를 적용합니다. `migrations/20261116_payapp_accounts.sql`은 수동 사전 적용용이며 한 번만 실행합니다. 자동 적용 후 다시 실행하지 않습니다.
4. `/api/pay/accounts`를 관리자 인증으로 조회해 `legacy`와 `jiyu`가 모두 configured인지 확인합니다. 계정명과 준비 여부만 반환하며 ID·키·nonce는 반환하지 않습니다. 공개 `/api/pay/config`는 기존 응답을 유지합니다.
5. 새 계정의 결제수단과 연동정보를 확인한 뒤 Production의 `PAYAPP_ACTIVE_ACCOUNT=jiyu`를 저장하고 재배포합니다. 이때부터 새 요청에 지유 계정을 저장합니다.
6. 관리자 조회에서 활성 계정이 `jiyu`인지 확인합니다. 운영자가 1,000원 확인 상품의 승인·전액취소와 사이트 반영을 확인합니다. 기존 블랭크 거래 취소는 블랭크 판매자 관리자에서 처리합니다. 실제 승인·취소는 자동 테스트에 포함하지 않습니다.

결과통보 주소는 기존 `/api/pay/feedback`, `/api/parking/feedback`, `/api/hostpay/feedback`을 유지합니다. 요청마다 주소를 넘기므로 공통 통보 URL을 새로 설정할 필요는 없습니다.

## 미결제 링크와 호스트 이용료

이미 만든 페이앱 링크는 생성한 계정의 거래입니다. 전환 후에도 해당 계정으로 통보를 검증하며, 링크를 새 계정 거래로 자동 변경하지 않습니다. 새 링크를 발급하려면 원래 요청의 취소 여부를 먼저 확인합니다.

호스트 이용료는 요청별 계정·nonce·거래번호를 별도로 보존합니다. 기존 계정의 요청이 미확인 상태면 새 계정으로 두 번째 결제를 요청하지 않고 409로 안내합니다. 기존 요청 취소 통보가 확인된 뒤에 새 계정 요청을 만들 수 있습니다. 이전 요청 응답을 잃어 거래번호가 없는 경우도 임의로 취소된 것으로 처리하지 않습니다. 운영팀이 원래 계정의 거래를 확인해야 합니다.

## 되돌리기

신규 요청을 중단하려면 `PAYAPP_ENABLED=0`, 블랭크로 다시 받으려면 `PAYAPP_ACTIVE_ACCOUNT=legacy`를 사용하고 재배포합니다. 두 계정의 Secret과 계정 구분 코드는 계속 유지합니다. 지유 거래가 한 번이라도 만들어진 뒤에는 계정 구분 기능이 없는 이전 코드로 되돌리지 않습니다.

## 법인 표시와 입금 안내

페이앱 계정 전환은 홈페이지 법인정보·보증금/잔금 입금계좌·알림톡을 자동으로 바꾸지 않습니다. 새 법인 및 기업은행 계좌용 변경안은 별도 검토합니다. 기존 승인 알림톡은 은행·계좌·예금주가 고정 문구이므로, 승인된 본문을 임의로 교체하지 않습니다. 새로운 계좌 안내는 새 템플릿 승인 및 발송 설정과 함께 활성화해야 합니다. 과거 발급 문서의 공급자 정보도 소급해 바꾸지 않습니다.

## 로컬 검증

`node --test tests/payapp-accounts.test.mjs tests/payment-merchant-transition.test.mjs tests/hostbilling-accounts.test.mjs tests/payapp.test.mjs tests/hostbilling.test.mjs tests/payapp-refund-lifecycle.test.mjs tests/parking.test.mjs tests/parking-batches.test.mjs`

외부 결제·취소·고객 발송 없이 모의 네트워크와 메모리 DB에서 계정 분리, 기존 승인·부분/전체 취소, 금액·nonce 검증, 응답 유실과 동시 요청을 확인합니다.
