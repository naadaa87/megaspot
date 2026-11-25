// 진행자 상세(/mc/view/?id=kim-sol) — 공개 중인 진행자면 소개·이력·사진을 서버에서 채웁니다 (2026-11-25)
import { serveTalentView } from '../../api/_talent_view.js';
export const onRequestGet = serveTalentView;
