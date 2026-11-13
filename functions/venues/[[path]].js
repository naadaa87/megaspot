// /venues/<모음>/ — 인원·목적·지역별 공간 모음. 정적 페이지에 공개 중인 입점 공간 목록을 채워 내보냅니다.
import { serveHub } from '../api/_hubpages.js';
export const onRequestGet = serveHub;
