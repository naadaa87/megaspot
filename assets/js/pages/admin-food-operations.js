(function(){
  'use strict';
  const admin = window.MEGASPOT_ADMIN, site = window.MEGASPOT;
  if (!admin || !site) return;

  const stages = [['delivery', '납품'], ['setup', '세팅'], ['teardown', '철수']];
  const orderStatuses = [['not_ordered', '발주 전'], ['sent', '발주 요청'], ['confirmed', '업체 확인'], ['cancelled', '발주 취소']];
  const esc = admin.esc;
  const dialog = document.createElement('dialog');
  dialog.className = 'adm-card food-ops-dialog';
  dialog.setAttribute('aria-labelledby','food-ops-title');
  dialog.innerHTML = `
    <div class="food-ops-header">
      <h2 id="food-ops-title">식음료 현장 운영</h2>
      <button type="button" class="btn btn-light btn-sm" id="food-ops-close">닫기</button>
    </div>
    <p class="food-ops-booking small muted" id="food-ops-booking"></p>
    <p class="small" id="food-ops-state" role="status"></p>
    <div class="food-ops-error" id="food-ops-error-wrap" hidden>
      <p class="form-note" id="food-ops-error" role="alert"></p>
      <button type="button" class="btn btn-light btn-sm" id="food-ops-reload">최신 내용 불러오기</button>
    </div>
    <form id="food-ops-form" hidden>
      <fieldset id="food-ops-inputs">
        <div class="food-ops-section">
          <h3>현장 일정과 담당자</h3>
          <div id="food-ops-stages"></div>
          <label class="food-ops-check" id="food-ops-review-schedule" hidden>
            <input type="checkbox" name="review_schedule"> 변경된 예약 조건에 맞게 현장 일정을 확인했습니다.
          </label>
        </div>
        <div class="food-ops-section">
          <h3>업체 발주</h3>
          <div id="food-ops-orders"></div>
        </div>
        <div class="food-ops-section">
          <h3>최종 확인</h3>
          <div class="food-ops-checks">
            <label class="food-ops-check">
              <input type="checkbox" name="headcount"> 최종 인원 확인
              <span class="food-ops-review" id="food-ops-review-headcount" hidden>다시 확인</span>
            </label>
            <label class="food-ops-check">
              <input type="checkbox" name="menu"> 최종 메뉴 확인
              <span class="food-ops-review" id="food-ops-review-menu" hidden>다시 확인</span>
            </label>
          </div>
        </div>
        <div class="food-ops-section">
          <label for="food-ops-memo">내부 메모</label>
          <textarea id="food-ops-memo" class="textarea" name="memo" maxlength="1200" rows="3"></textarea>
        </div>
      </fieldset>
      <div class="food-ops-actions">
        <button type="submit" class="btn btn-primary" id="food-ops-save">현장 운영 저장</button>
      </div>
    </form>
    <section class="food-ops-section" id="food-ops-reminder" aria-labelledby="food-ops-reminder-title" hidden>
      <div class="food-ops-header">
        <h3 id="food-ops-reminder-title">고객 잔금 안내</h3>
        <button type="button" class="btn btn-light btn-sm" id="food-ops-prepare">현재 잔금으로 안내문 준비</button>
      </div>
      <p id="food-ops-reminder-state" class="small muted" role="status"></p>
      <div id="food-ops-reminder-result" hidden>
        <label for="food-ops-message" class="sr-only">고객에게 전달할 잔금 안내문</label>
        <textarea id="food-ops-message" class="textarea" rows="7" readonly></textarea>
        <button type="button" class="btn btn-light btn-sm" id="food-ops-copy">잔금 안내문 복사</button>
      </div>
    </section>`;
  document.body.appendChild(dialog);

  const $ = selector => dialog.querySelector(selector);
  const form = $('#food-ops-form');
  let session = null;

  function fieldValue(name) { return form.elements.namedItem(name); }
  function api(state, options, suffix = '') {
    return admin.A('/bookings/' + encodeURIComponent(state.code) + '/food-operations' + suffix, options);
  }
  function active(state) { return session === state && dialog.open; }

  function flash(message) { $('#food-ops-state').textContent = message; }
  function hideError() { $('#food-ops-error-wrap').hidden = true; }
  function showError(error, retry) {
    if (admin.guard(error)) {
      dialog.close();
      return;
    }
    $('#food-ops-error').textContent = error.code === 'NO_API'
      ? '연결 상태를 확인한 뒤 다시 시도해 주세요.'
      : error.message || '현장 운영 정보를 불러오지 못했습니다.';
    $('#food-ops-reload').hidden = !retry;
    $('#food-ops-error-wrap').hidden = false;
  }

  function stageFields(stage, label, task) {
    return `<fieldset class="food-ops-stage">
      <legend>${label}</legend>
      <div class="food-ops-row">
        <label>날짜 <input class="input" type="date" name="${stage}_date" value="${esc(task.date || '')}"></label>
        <label>시각 <input class="input" type="time" name="${stage}_time" value="${esc(task.time || '')}"></label>
        <label>담당자 <input class="input" name="${stage}_owner" maxlength="80" value="${esc(task.owner || '')}"></label>
      </div>
    </fieldset>`;
  }

  function orderFields(order) {
    const title = [order.item !== order.label ? order.item : '', order.people ? order.people + '명' : '',
      order.cups ? order.cups + '잔' : '', order.format].filter(Boolean).join(' · ');
    const options = (order.needs_review ? [['', '재확인 필요']] : []).concat(orderStatuses);
    return `<div class="food-ops-order">
      <label for="food-ops-order-${order.kind}">
        <strong>${esc(order.label)}</strong>
        <span class="small muted">${esc(title)}</span>
      </label>
      <select class="input" name="order_${order.kind}" id="food-ops-order-${order.kind}">${options.map(([value, label]) => {
        const selected = order.needs_review ? value === '' : value === order.status;
        return `<option value="${value}"${selected ? ' selected' : ''}>${label}</option>`;
      }).join('')}</select>
    </div>`;
  }

  function clearReminder() {
    $('#food-ops-message').value = '';
    $('#food-ops-reminder-result').hidden = true;
    $('#food-ops-reminder-state').textContent = '';
  }

  function render(state, data) {
    state.data = data;
    state.dirty = false;
    const b = data.booking;
    const time = [b.start, b.end].filter(Boolean).join('–');
    $('#food-ops-booking').textContent = [b.code, b.name, b.date, time, b.location, b.headcount ? b.headcount + '명' : ''].filter(Boolean).join(' · ');
    $('#food-ops-stages').innerHTML = stages.map(([stage, label]) => stageFields(stage, label, data.schedule[stage] || {})).join('');
    $('#food-ops-orders').innerHTML = data.orders.length ? data.orders.map(orderFields).join('') : '<p class="small muted">선택된 식음료 항목이 없습니다.</p>';
    $('#food-ops-review-schedule').hidden = !data.schedule_needs_review;
    fieldValue('review_schedule').checked = false;
    fieldValue('memo').value = data.memo;
    for (const name of ['headcount', 'menu']) {
      fieldValue(name).checked = data.checklist[name] === 'confirmed';
      $('#food-ops-review-' + name).hidden = data.checklist[name] !== 'needs_review';
    }
    form.hidden = false;
    $('#food-ops-inputs').disabled = !data.editable;
    $('#food-ops-save').hidden = !data.editable;
    $('#food-ops-save').disabled = true;
    $('#food-ops-reminder').hidden = !data.editable;
    clearReminder();
    flash(data.editable ? '' : '지난 예약의 현장 운영 기록입니다.');
  }

  async function load(state) {
    hideError();
    state.busy = true;
    $('#food-ops-inputs').disabled = true;
    $('#food-ops-save').disabled = true;
    flash('현장 운영 정보를 불러오는 중입니다.');
    try {
      const result = await api(state);
      if (active(state)) render(state, result);
    } catch (error) {
      if (active(state)) {
        flash('');
        showError(error, true);
      }
    } finally {
      state.busy = false;
      if (active(state) && state.data) {
        $('#food-ops-inputs').disabled = !state.data.editable;
        $('#food-ops-save').disabled = !state.dirty;
      }
    }
  }

  function scheduleInput() {
    const schedule = {};
    for (const [stage] of stages) {
      const date = fieldValue(stage + '_date');
      const time = fieldValue(stage + '_time');
      if (time.value && !date.value) {
        date.setCustomValidity('시각을 지정하려면 날짜를 입력해 주세요.');
        date.reportValidity();
        return null;
      }
      schedule[stage] = {date:date.value, time:time.value, owner:fieldValue(stage + '_owner').value.trim()};
    }
    return schedule;
  }

  form.addEventListener('input', event => {
    if (!session?.data?.editable) return;
    session.dirty = true;
    $('#food-ops-save').disabled = false;
    const name = event.target.name || '';
    if (name.endsWith('_date')) event.target.setCustomValidity('');
    if (name.endsWith('_time')) fieldValue(name.replace('_time','_date')).setCustomValidity('');
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const state = session, data = state.data;
    if (!data?.editable || !state.dirty || state.busy) return;
    const schedule = scheduleInput();
    if (!schedule) return;
    hideError();
    state.busy = true;
    $('#food-ops-save').disabled = true;
    $('#food-ops-inputs').disabled = true;
    flash('현장 운영 정보를 저장하는 중입니다.');
    const body = {
      version:data.version, booking_revision:data.booking_revision, schedule,
      review_schedule:fieldValue('review_schedule').checked,
      orders:Object.fromEntries(data.orders.map(({kind}) => [kind, fieldValue('order_' + kind).value])),
      checklist:{headcount:fieldValue('headcount').checked, menu:fieldValue('menu').checked},
      memo:fieldValue('memo').value,
    };
    try {
      const result = await api(state,{method:'PUT',body});
      if (active(state)) {
        render(state,result);
        flash('현장 운영 정보를 저장했습니다.');
      }
    } catch (error) {
      if (active(state)) {
        flash('');
        showError(error,error.status === 409 || error.code === 'NO_API');
      }
    } finally {
      state.busy = false;
      if (active(state)) {
        $('#food-ops-inputs').disabled = !state.data.editable;
        $('#food-ops-save').disabled = !state.dirty;
      }
    }
  });

  function discard(state) {
    return !state.dirty || window.confirm('저장하지 않은 현장 운영 변경을 버릴까요?');
  }

  $('#food-ops-close').addEventListener('click', () => {
    if (!session.busy && discard(session)) dialog.close();
  });
  dialog.addEventListener('cancel', event => {
    if (session.busy || !discard(session)) event.preventDefault();
  });
  dialog.addEventListener('close', () => {
    if (dialog.open) return;
    session = null;
    clearReminder();
  });

  $('#food-ops-reload').addEventListener('click', () => {
    if (!session.busy && discard(session)) load(session);
  });
  $('#food-ops-prepare').addEventListener('click', async event => {
    const state = session, button = event.currentTarget;
    clearReminder();
    button.disabled = true;
    $('#food-ops-reminder-state').textContent = '현재 잔금을 확인하는 중입니다.';
    try {
      const result = await api(state,undefined,'/reminder');
      if (!active(state)) return;
      const message = $('#food-ops-message');
      message.value = result.text || '';
      $('#food-ops-reminder-result').hidden = !result.text;
      $('#food-ops-reminder-state').textContent = result.reason || '복사한 안내문을 카카오톡이나 문자에 붙여 넣어 전달해 주세요.';
    } catch (error) {
      if (!active(state)) return;
      if (admin.guard(error)) {
        dialog.close();
        return;
      }
      $('#food-ops-reminder-state').textContent = '잔금을 확인하지 못했습니다. 다시 시도해 주세요.';
    } finally {
      if (active(state)) button.disabled = false;
    }
  });
  $('#food-ops-copy').addEventListener('click', async () => {
    const message = $('#food-ops-message');
    const copied = await site.copy(message.value);
    if (!copied) {
      message.focus();
      message.select();
    }
    site.toast(copied ? '잔금 안내문을 복사했습니다.' : '표시된 잔금 안내문을 직접 복사해 주세요.');
  });

  document.addEventListener('click', event => {
    const trigger = event.target.closest('[data-food-operations-code]');
    if (!trigger || dialog.open) return;
    event.preventDefault();
    session = {code:trigger.dataset.foodOperationsCode, data:null, dirty:false, busy:false};
    form.hidden = true;
    $('#food-ops-booking').textContent = session.code;
    $('#food-ops-reminder').hidden = true;
    $('#food-ops-prepare').disabled = false;
    dialog.showModal();
    load(session);
  });
})();
