// 행사 사례 목록(/cases/) — 공개 사례가 있으면 카드를 서버에서 채우고 검색 허용으로 바꿉니다 (2026-11-25)
import { serveCaseList } from '../api/_case_pages.js';
export const onRequestGet = serveCaseList;
