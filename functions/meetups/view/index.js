// 모임 모집 상세(/meetups/view/?id=MO-…) — 공개된 모임이면 제목·설명·일정(Event 구조화 데이터)을 서버에서 채웁니다 (2026-11-25)
import { serveMeetup } from '../../api/_view_heads.js';
export const onRequestGet = serveMeetup;
