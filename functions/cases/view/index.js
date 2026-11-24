// 행사 사례 상세(/cases/view/?id=EC-…) — 공개 사례면 제목·설명·본문을 서버에서 채웁니다 (2026-11-25)
import { serveCaseView } from '../../api/_case_pages.js';
export const onRequestGet = serveCaseView;
