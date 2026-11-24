// 다가오는 모임 모집 주소 목록 — robots.txt 에 Sitemap 으로 적어 둡니다
import { meetupSitemap } from '../api/_view_heads.js';
export const onRequestGet = ({ env }) => meetupSitemap(env);
