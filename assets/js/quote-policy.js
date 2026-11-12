/* Shared appendix for public estimates and administrator quotations. */
(function(){
  'use strict';
  var sections = [
    ['1. 시설 및 집기류 원상복구', [
      '이용 중 이동하거나 재배치한 테이블, 의자 및 기타 집기류는 입실 당시의 위치와 상태로 원상복구해 주시기 바랍니다.',
      '사용한 비품 및 시설물은 정리하여 주시기 바랍니다.'
    ]],
    ['2. 쓰레기 수거 및 정리', [
      '이용 중 발생한 일반쓰레기, 음식물쓰레기, 재활용품 등은 종류별로 분리하여 정리해 주시기 바랍니다.',
      '수거한 쓰레기는 봉투에 담아 지정된 출입문 앞 한곳에 모아주시기 바랍니다.',
      '음식물 및 음료 등이 공간 내에 남아 있지 않도록 정리해 주시기 바랍니다.'
    ]],
    ['3. 테이블 및 주변 정리', [
      '테이블 위에 남은 음식물, 음료, 일회용품 및 기타 물품을 모두 수거해 주시기 바랍니다.',
      '테이블 표면에 남은 음식물이나 오염물은 닦아 깨끗한 상태로 정리해 주시기 바랍니다.',
      '바닥 및 주변에 떨어진 쓰레기나 음식물도 함께 수거해 주시기 바랍니다.'
    ]],
    ['4. 퇴실 전 최종 확인', [
      '모든 집기류의 원상복구 및 쓰레기 정리 상태를 확인해 주시기 바랍니다.',
      '청소 및 정리가 미흡하거나 시설물의 오염·파손이 발생한 경우, 추가 청소비 또는 복구 비용이 보증금에서 차감될 수 있습니다.'
    ]]
  ];
  function esc(value){return String(value || '').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function html(spaceName){
    return '<section class="qp qp-cleanup" aria-label="메가스팟 퇴실 시 청소 및 원상복구 기준">'
      + '<header class="qp-head"><div><div class="qp-logo">MEGA<b>SPOT</b></div><div class="qp-sub">' + esc(spaceName) + ' · 퇴실 안내</div></div><div class="qp-meta"><b>청소 및 원상복구 안내</b></div></header>'
      + '<h2 class="qp-title">메가스팟 퇴실 시 청소 및 원상복구 기준</h2>'
      + '<p class="qp-cleanup-intro">메가스팟 이용 고객께서는 쾌적한 공간 유지와 다음 이용 고객을 위해 퇴실 전 아래 사항을 준수해 주시기 바랍니다.</p>'
      + sections.map(function(section){return '<section class="qp-cleanup-group"><h3>' + section[0] + '</h3><ul>' + section[1].map(function(text){return '<li>' + text + '</li>';}).join('') + '</ul></section>';}).join('')
      + '<p class="qp-cleanup-note">※ 일반적인 전문 청소 수준이 아닌, <strong>이용 과정에서 발생한 쓰레기와 오염물을 정리하고 시설 및 집기류를 원상복구하는 수준</strong>을 기본 청소 기준으로 합니다.</p>'
      + '</section>';
  }
  window.MEGASPOT_QUOTE_POLICY = { html: html };
})();
