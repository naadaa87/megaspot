// /venues/ — 공간 모음 첫 화면. 정적 페이지에 공개 중인 입점 공간 목록을 채워 내보냅니다.
import { serveHub } from '../api/_hubpages.js';
export const onRequestGet = serveHub;
