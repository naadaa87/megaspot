// 진행자 섭외 화면 주소 목록 — robots.txt 에 Sitemap 으로 적어 둡니다 (2026-11-25)
import { talentSitemap } from '../api/_talent_view.js';
export const onRequestGet = ({ env }) => talentSitemap(env);
