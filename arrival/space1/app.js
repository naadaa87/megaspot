const toast = document.querySelector('#toast');
let toastTimer;
function notify(message) { toast.textContent = message; toast.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 2600); }
document.querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(button.dataset.copy); notify(`${button.dataset.copyLabel}를 복사했습니다.`); }
  catch { const text = document.createElement('textarea'); text.value = button.dataset.copy; text.style.position = 'fixed'; text.style.opacity = '0'; document.body.append(text); text.select(); const success = document.execCommand('copy'); text.remove(); notify(success ? `${button.dataset.copyLabel}를 복사했습니다.` : '복사가 지원되지 않습니다. 표시된 내용을 길게 눌러 복사해 주세요.'); }
}));
const photoDialog = document.querySelector('#photo-dialog');
const fullPhoto = document.querySelector('#photo-full');
let lastPhotoButton;
document.querySelectorAll('[data-zoom]').forEach(button => button.addEventListener('click', () => {
  lastPhotoButton = button; fullPhoto.src = button.dataset.zoom; fullPhoto.alt = button.dataset.caption; document.querySelector('#photo-caption').textContent = button.dataset.caption; photoDialog.showModal(); document.body.style.overflow = 'hidden';
}));
document.querySelector('#photo-close').addEventListener('click', () => photoDialog.close());
photoDialog.addEventListener('click', event => { if (event.target === photoDialog) { const rect = photoDialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) photoDialog.close(); } });
photoDialog.addEventListener('close', () => { document.body.style.overflow = ''; lastPhotoButton?.focus({preventScroll:true}); });
const switchToggle = document.querySelector('#switch-toggle');
switchToggle.addEventListener('click', () => {
  const showingOriginal = switchToggle.getAttribute('aria-pressed') !== 'true';
  switchToggle.setAttribute('aria-pressed', String(showingOriginal)); switchToggle.textContent = showingOriginal ? '화살표 표시 사진 보기' : '표시 없는 원본 보기';
  const src = showingOriginal ? 'assets/switch-original.png' : 'assets/switch-guide.svg';
  document.querySelector('#switch-image').src = src; document.querySelector('#switch-photo').dataset.zoom = src;
  document.querySelector('#switch-image').alt = showingOriginal ? '표시 없는 실제 조명 스위치 원본 사진' : '조명 스위치에 점등 방향과 조작 제외 구역을 표시한 안내 사진';
  document.querySelector('#switch-photo').dataset.caption = showingOriginal ? '실제 조명 스위치 · 표시 없는 원본 사진' : '조명 점등 방향 · 가운데 검은색 3구는 왼쪽, X 표시 4구는 조작 제외';
});
const checks = [...document.querySelectorAll('#check-items input')];
try { const stored = JSON.parse(sessionStorage.getItem('megaspot-checkout-v1') || '[]'); checks.forEach((input, i) => input.checked = stored[i] === true); } catch {}
function updateChecks() { const count = checks.filter(input => input.checked).length; document.querySelector('#check-count').textContent = `${count} / ${checks.length} 완료`; document.querySelector('#check-progress').style.width = `${count / checks.length * 100}%`; document.querySelector('#check-done').hidden = count !== checks.length; try { sessionStorage.setItem('megaspot-checkout-v1', JSON.stringify(checks.map(input => input.checked))); } catch {} }
checks.forEach(input => input.addEventListener('change', updateChecks));
document.querySelector('#check-reset').addEventListener('click', () => { checks.forEach(input => input.checked = false); updateChecks(); notify('퇴실 체크리스트를 초기화했습니다.'); }); updateChecks();
const navLinks = [...document.querySelectorAll('.sidebar nav a')];
function openEquipmentGuide(hash) {
  if (!hash || !hash.startsWith('#')) return;
  const target = document.getElementById(hash.slice(1));
  if (target?.matches('details.equipment-guide')) target.open = true;
}
document.querySelectorAll('a[href^="#"]').forEach(link => link.addEventListener('click', () => openEquipmentGuide(link.hash)));
window.addEventListener('hashchange', () => openEquipmentGuide(location.hash));
openEquipmentGuide(location.hash);
if ('IntersectionObserver' in window) { const observer = new IntersectionObserver(entries => { entries.forEach(entry => { if (entry.isIntersecting) navLinks.forEach(link => { const active = link.hash === `#${entry.target.id}`; link.classList.toggle('active', active); if (active) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current'); }); }); }, { rootMargin: '-5% 0px -65% 0px', threshold: 0 }); document.querySelectorAll('.section').forEach(section => observer.observe(section)); }
