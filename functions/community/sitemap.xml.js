// 공개된 커뮤니티 글 주소 목록 — robots.txt 에 Sitemap 으로 적어 둡니다 (정적 sitemap.xml 은 그대로 둡니다)
import { communitySitemap } from '../api/_view_heads.js';
export const onRequestGet = ({ env }) => communitySitemap(env);
