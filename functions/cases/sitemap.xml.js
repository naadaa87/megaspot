// 공개 중인 행사 사례 주소 목록 — robots.txt 에 Sitemap 으로 적어 둡니다
import { casesSitemap } from '../api/_case_pages.js';
export const onRequestGet = ({ env }) => casesSitemap(env);
