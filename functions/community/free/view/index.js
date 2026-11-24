// 자유게시판 글(/community/free/view/?id=CF-…) — 공개된 글이면 제목·설명·본문 첫 화면을 서버에서 채웁니다 (검색 노출용 · 2026-11-25)
import { servePost } from '../../../api/_view_heads.js';
export const onRequestGet = servePost('free');
