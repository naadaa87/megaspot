// MC·강사 섭외(/mc/) — 공개 중인 진행자 카드를 서버에서 채웁니다 (2026-11-25)
import { serveTalentList } from '../api/_talent_view.js';
export const onRequestGet = serveTalentList;
