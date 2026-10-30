// 카드뉴스 제작기 — 피그마 "학생정책발굴단 카드뉴스" 템플릿(1080×1350)을 캔버스로 다시 그린다.
// 좌표·색·글꼴 크기는 피그마 노드 값(표지 3-0, 속지 3-1, 마무리 3-7)을 그대로 옮긴 것.

const W = 1080, H = 1350;
const FONT = 'Pretendard, "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
const QUOTE = new Path2D('M0 136L30.2065 73.913L1.00689 70.9565V0H90.1162V62.9317L32.2203 136H0Z');
const STORE_KEY = 'cardnews.v4'; // v4: 내장 예시를 없애면서 예전 저장값(예시 글)은 쓰지 않는다
const MIN_PAGES = 1, MAX_PAGES = 10;

const rad = d => d * Math.PI / 180;
const font = (weight, size) => `${weight} ${size}px ${FONT}`;

const LAYOUTS = {
  photo1: { label: '사진 1장', slots: [[173, 638, 735, 460]] },
  photo2: { label: '사진 2장', slots: [[173, 638, 360, 460], [548, 638, 360, 460]] },
  text:   { label: '글만', slots: [] },
};
const COVER_SLOT = [355, 629, 687, 395]; // 4° 회전된 마스크 영역
const FOOTER_Y = 1240; // 로고가 들어간 하단 띠 (assets.js의 footer*)

function defaultPage() {
  return { layout: 'photo1', title: '', body: '', photos: [null, null] };
}

// 처음 열었을 때와 '새로 만들기'의 빈 상태 (꼬리표는 템플릿 고정 문구라 남긴다)
function blankState() {
  return {
    cover: { tag: '교육혁신사업단', title: '', hashtags: '', photo: null },
    pages: Array.from({ length: 4 }, defaultPage),
    closing: true,
  };
}

let state = blankState();
const IMG = {};
const library = []; // 이번 세션에 올린 모든 사진 (AI가 번호로 골라 배치)

// ---------- 저장 (글만, 사진은 용량 때문에 제외) ----------

function save() {
  const { photo, ...cover } = state.cover;
  const data = {
    cover,
    pages: state.pages.map(p => ({ layout: p.layout, title: p.title, body: p.body })),
    closing: state.closing,
  };
  try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch (e) { /* 저장 불가 환경 */ }
}

// 저장된 글이 있으면 불러오고 true를 돌려준다 (처음 방문이면 false)
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    state.cover = { ...state.cover, ...d.cover, photo: null };
    state.pages = d.pages.map(p => ({ ...defaultPage(), ...p, photos: [null, null] }));
    state.closing = d.closing !== false;
    return true;
  } catch (e) {
    return false; // 손상된 저장값은 무시
  }
}

// ---------- 그리기 도구 ----------

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function withShadow(ctx, color, blur, offY, fn) {
  ctx.save();
  ctx.shadowColor = color; ctx.shadowBlur = blur; ctx.shadowOffsetY = offY;
  fn();
  ctx.restore();
}

// 단어 단위로 줄바꿈, 한 단어가 너무 길면 글자 단위로 자른다.
function wrap(ctx, text, maxW) {
  const lines = [];
  let cur = '';
  for (const word of text.split(' ')) {
    const next = cur ? cur + ' ' + word : word;
    if (ctx.measureText(next).width <= maxW) { cur = next; continue; }
    if (cur) lines.push(cur);
    cur = '';
    if (ctx.measureText(word).width <= maxW) { cur = word; continue; }
    for (const ch of word) {
      if (ctx.measureText(cur + ch).width > maxW) { lines.push(cur); cur = ch; } else cur += ch;
    }
  }
  lines.push(cur);
  return lines;
}

// "- " 또는 "• "로 시작하는 줄은 글머리표. 그 다음 줄은 빈 줄이 나올 때까지 들여쓰기 유지.
function layoutBody(ctx, text, size, maxW) {
  const lh = Math.round(size * 1.667);
  const indent = Math.round(size * 1.5);
  const lines = [];
  let inBullet = false;
  for (const raw of text.split('\n')) {
    if (!raw.trim()) { lines.push({ gap: true }); inBullet = false; continue; }
    const m = raw.match(/^\s*[-•·*]\s+(.*)$/);
    if (m) {
      inBullet = true;
      wrap(ctx, m[1].trim(), maxW - indent).forEach((t, i) => lines.push({ indent, text: t, bullet: i === 0 }));
    } else {
      const ind = inBullet ? indent : 0;
      wrap(ctx, raw.trim(), maxW - ind).forEach(t => lines.push({ indent: ind, text: t }));
    }
  }
  const height = lines.reduce((h, l) => h + (l.gap ? lh / 2 : lh), 0);
  return { lines, lh, height };
}

// 영역을 넘치면 글자 크기를 min까지 줄인다. 결과에 실제 크기와 넘침 여부를 돌려준다.
function drawBody(ctx, text, x, y, maxW, maxH, { size, min, weight = 500, color = '#000', center = false }) {
  let s = size, L;
  for (; s >= min; s--) {
    ctx.font = font(weight, s);
    L = layoutBody(ctx, text, s, maxW);
    if (L.height <= maxH) break;
  }
  if (s < min) s = min;
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  let cy = center ? y + Math.max(0, (maxH - L.height) / 2) : y;
  for (const l of L.lines) {
    if (l.gap) { cy += L.lh / 2; continue; }
    const mid = cy + L.lh / 2;
    if (l.bullet) {
      ctx.beginPath();
      ctx.arc(x + l.indent * 0.5, mid, s * 0.15, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillText(l.text, x + l.indent, mid);
    cy += L.lh;
  }
  return { size: s, shrunk: s < size, overflow: L.height > maxH };
}

// 흰색 → 회색으로 끝나는 형광펜 느낌의 제목 박스 (피그마 Frame 5 / 2147239363)
function drawTag(ctx, text, x, y, h, size, weight, color, maxW) {
  let s = size;
  ctx.font = font(weight, s);
  while (ctx.measureText(text).width > maxW - 20 && s > 20) ctx.font = font(weight, --s);
  const w = ctx.measureText(text).width + 20;
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.72, '#ffffff'); g.addColorStop(1, '#706d67');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + 10, y + h / 2 + 1);
}

function coverFit(photo, w, h) {
  const scale = Math.max(w / photo.img.width, h / photo.img.height) * photo.zoom;
  return { dw: photo.img.width * scale, dh: photo.img.height * scale };
}

function drawPhoto(ctx, photo, x, y, w, h) {
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  if (photo) {
    const { dw, dh } = coverFit(photo, w, h);
    ctx.drawImage(photo.img, x + (w - dw) * photo.px, y + (h - dh) * photo.py, dw, dh);
  } else {
    ctx.fillStyle = '#cfc8be';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#8a8277';
    ctx.font = font(600, 30);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('사진을 넣어주세요', x + w / 2, y + h / 2);
  }
  ctx.restore();
}

function drawQuote(ctx, x, y, w, h, color) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(rad(4)); ctx.scale(w / 90.1162, h / 136);
  ctx.fillStyle = color;
  ctx.fill(QUOTE);
  ctx.restore();
}

// ---------- 장별 렌더링 ----------

function drawCover(ctx, c) {
  ctx.drawImage(IMG.bgCover, 0, 0, W, H);

  if (c.tag.trim()) drawTag(ctx, c.tag.trim(), 115, 107, 63, 48, 600, '#585858', 850);

  // 제목: 80px / 행간 95, 3줄을 넘으면 크기를 줄인다
  let size = 80, lines;
  for (; size >= 48; size -= 2) {
    ctx.font = font(700, size);
    lines = c.title.split('\n').flatMap(t => wrap(ctx, t.trim(), 850));
    if (lines.length * size * 1.19 <= 340) break;
  }
  const lh = size * 1.19;
  withShadow(ctx, 'rgba(95,95,95,.5)', 4, 4, () => {
    ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle';
    lines.forEach((t, i) => ctx.fillText(t, 115, 177 + lh * i + lh / 2));
  });

  // 사진 카드
  withShadow(ctx, 'rgba(0,0,0,.25)', 4, 4, () => { ctx.fillStyle = '#6c6c6c'; ctx.fillRect(280, 581, 1053, 621); });
  ctx.save();
  ctx.translate(310, 546); ctx.rotate(rad(4));
  withShadow(ctx, 'rgba(0,0,0,.25)', 4, 4, () => { ctx.fillStyle = '#e7e7e7'; ctx.fillRect(0, 0, 1053, 621); });
  ctx.restore();
  ctx.save();
  ctx.translate(COVER_SLOT[0], COVER_SLOT[1]); ctx.rotate(rad(4));
  drawPhoto(ctx, c.photo, 0, 0, COVER_SLOT[2], COVER_SLOT[3]);
  ctx.restore();

  drawQuote(ctx, 790, 507, 90, 136, 'rgba(92,91,87,.75)');
  drawQuote(ctx, 895, 514, 90, 136, 'rgba(92,91,87,.75)');

  if (c.hashtags.trim()) {
    ctx.save();
    ctx.translate(329, 1056); ctx.rotate(rad(4));
    let s = 44;
    ctx.font = font(700, s);
    while (ctx.measureText(c.hashtags.trim()).width > 640 && s > 24) ctx.font = font(700, --s);
    const w = ctx.measureText(c.hashtags.trim()).width + 20;
    ctx.fillStyle = '#aba298'; ctx.fillRect(0, 0, w, 64);
    ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle';
    ctx.fillText(c.hashtags.trim(), 10, 33);
    ctx.restore();
  }

  ctx.drawImage(IMG.footerCover, 0, FOOTER_Y);
  return { titleSize: size };
}

function drawInner(ctx, p) {
  ctx.drawImage(IMG.bgInner, 0, 0, W, H);
  if (p.title.trim()) drawTag(ctx, p.title.trim(), 116, 159, 68, 40, 700, '#000', 850);

  // 사진 카드 (뒤 카드 5° 회전 + 앞 카드)
  ctx.save();
  ctx.translate(139, 538); ctx.rotate(rad(5));
  ctx.fillStyle = '#aba197'; ctx.fillRect(0, 0, 839, 592);
  ctx.restore();
  withShadow(ctx, 'rgba(0,0,0,.25)', 4, 4, () => { ctx.fillStyle = '#e7e7e7'; ctx.fillRect(121, 571, 838, 593); });

  let info;
  if (p.layout === 'text') {
    info = drawBody(ctx, p.body, 173, 638, 735, 460, { size: 32, min: 20, center: true });
  } else {
    info = drawBody(ctx, p.body, 115, 257, 851, 250, { size: 24, min: 18 });
    LAYOUTS[p.layout].slots.forEach((r, i) => drawPhoto(ctx, p.photos[i], ...r));
  }

  drawQuote(ctx, 783, 516, 67, 102, '#aba197');
  drawQuote(ctx, 862, 521, 67, 102, '#aba197');

  ctx.drawImage(IMG.footerInner, 0, FOOTER_Y);
  return info;
}

function drawClosing(ctx) {
  ctx.drawImage(IMG.closing, 0, 0, W, H);
  return {};
}

// ---------- 화면 ----------

const slidesEl = document.getElementById('slides');

function slideList() {
  const list = [{ kind: 'cover' }];
  state.pages.forEach((p, i) => list.push({ kind: 'inner', page: p, index: i }));
  if (state.closing) list.push({ kind: 'closing' });
  return list;
}

function render(slide, canvas) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  ctx.textAlign = 'left';
  if (slide.kind === 'cover') return drawCover(ctx, state.cover);
  if (slide.kind === 'inner') return drawInner(ctx, slide.page);
  return drawClosing(ctx);
}

function slideName(slide, n) {
  const num = String(n).padStart(2, '0');
  if (slide.kind === 'cover') return `${num}_표지`;
  if (slide.kind === 'closing') return `${num}_마무리`;
  return `${num}_속지${slide.index + 1}`;
}

function photoFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const photo = { img: await loadImage(reader.result), zoom: 1, px: 0.5, py: 0.5 };
        library.push(photo);
        updateAiPhotos();
        resolve(photo);
      } catch (e) { reject(e); }
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// 캔버스 위 사진 영역(대략적인 직사각형)과 그 사진을 읽고 쓰는 방법
function photoSlots(slide) {
  if (slide.kind === 'cover') {
    return [{ rect: COVER_SLOT, get: () => state.cover.photo, set: v => { state.cover.photo = v; } }];
  }
  if (slide.kind === 'inner') {
    return LAYOUTS[slide.page.layout].slots.map((rect, i) => ({
      rect, get: () => slide.page.photos[i], set: v => { slide.page.photos[i] = v; },
    }));
  }
  return [];
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k === 'class') node.className = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) if (c != null) node.append(c);
  return node;
}

function textField(label, value, onInput, { multiline = false, hint, placeholder = '' } = {}) {
  const input = multiline ? el('textarea', { placeholder }) : el('input', { type: 'text', placeholder });
  input.value = value;
  input.addEventListener('input', () => onInput(input.value));
  return el('label', { class: 'field' }, el('span', {}, label), input, hint ? el('span', { class: 'hint' }, hint) : null);
}

function pickFile() {
  return new Promise(resolve => {
    const input = document.getElementById('slotInput');
    input.value = '';
    input.onchange = () => resolve(input.files[0] || null);
    input.click();
  });
}

function slotEditor(slot, label, refresh) {
  const photo = slot.get();
  const thumb = el('div', { class: 'thumb' + (photo ? '' : ' empty') }, photo ? '' : '클릭 또는 끌어놓기');
  if (photo) thumb.style.backgroundImage = `url(${photo.img.src})`;

  const setFile = async file => {
    if (!file || !file.type.startsWith('image/')) return;
    slot.set(await photoFromFile(file));
    refresh(true);
  };
  thumb.addEventListener('click', async () => setFile(await pickFile()));
  thumb.addEventListener('dragover', e => { e.preventDefault(); thumb.classList.add('over'); });
  thumb.addEventListener('dragleave', () => thumb.classList.remove('over'));
  thumb.addEventListener('drop', e => { e.preventDefault(); thumb.classList.remove('over'); setFile(e.dataTransfer.files[0]); });

  const box = el('div', { class: 'slot' }, el('span', { class: 'hint' }, label), thumb);
  if (photo) {
    const zoom = el('input', { type: 'range', min: '1', max: '3', step: '0.01', 'aria-label': '확대' });
    zoom.value = photo.zoom;
    zoom.addEventListener('input', () => { photo.zoom = +zoom.value; refresh(false); });
    box.append(
      el('div', { class: 'row' }, el('span', { class: 'hint' }, '확대'), zoom),
      el('div', { class: 'row' },
        el('button', { class: 'small', onclick: () => { photo.zoom = 1; photo.px = photo.py = 0.5; refresh(true); } }, '가운데로'),
        el('button', { class: 'small', onclick: () => { slot.set(null); refresh(true); } }, '빼기')),
    );
  }
  return box;
}

// 미리보기 캔버스에서 사진을 끌어 위치 조정
function enablePan(canvas, slide, redraw) {
  let drag = null;
  const toCanvas = e => {
    const r = canvas.getBoundingClientRect();
    return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height];
  };
  canvas.addEventListener('pointerdown', e => {
    const [x, y] = toCanvas(e);
    const slot = photoSlots(slide).find(s => {
      const [sx, sy, sw, sh] = s.rect;
      return s.get() && x >= sx - 20 && x <= sx + sw + 20 && y >= sy && y <= sy + sh + 40;
    });
    if (!slot) return;
    drag = { slot, x, y };
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = 'grabbing';
  });
  canvas.addEventListener('pointermove', e => {
    if (!drag) return;
    const [x, y] = toCanvas(e);
    const photo = drag.slot.get();
    const [, , w, h] = drag.slot.rect;
    const { dw, dh } = coverFit(photo, w, h);
    if (dw > w) photo.px = Math.min(1, Math.max(0, photo.px - (x - drag.x) / (dw - w)));
    if (dh > h) photo.py = Math.min(1, Math.max(0, photo.py - (y - drag.y) / (dh - h)));
    drag.x = x; drag.y = y;
    redraw();
  });
  const end = () => { drag = null; canvas.style.cursor = ''; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
}

function buildSlide(slide, n, total) {
  const canvas = el('canvas', { width: W, height: H });
  const warn = el('div', { class: 'warn' });
  const redraw = () => {
    const info = render(slide, canvas) || {};
    warn.textContent = info.overflow ? '글이 너무 길어 영역을 넘칩니다. 내용을 줄여 주세요.'
      : info.shrunk ? `글이 길어 글자 크기를 ${info.size}px로 줄였어요.` : '';
  };

  const slots = photoSlots(slide);
  if (slots.length) { canvas.classList.add('pannable'); enablePan(canvas, slide, redraw); }

  const preview = el('div', { class: 'preview' }, canvas,
    slots.length ? el('div', { class: 'tip' }, '미리보기에서 사진을 끌면 위치가 바뀝니다') : null, warn);

  const download = el('button', { class: 'small', onclick: () => downloadOne(canvas, slideName(slide, n)) }, 'PNG 저장');
  const head = el('div', { class: 'slide-head' },
    el('span', { class: 'num' }, String(n).padStart(2, '0')),
    el('span', { class: 'kind' }, slide.kind === 'cover' ? '표지' : slide.kind === 'closing' ? '마무리' : `속지 ${slide.index + 1}`),
    el('span', { class: 'spacer' }));

  if (slide.kind === 'inner') {
    const i = slide.index;
    head.append(
      el('button', { class: 'small', title: '위로', onclick: () => movePage(i, -1), ...(i === 0 ? { disabled: '' } : {}) }, '↑'),
      el('button', { class: 'small', title: '아래로', onclick: () => movePage(i, 1), ...(i === state.pages.length - 1 ? { disabled: '' } : {}) }, '↓'),
      el('button', { class: 'small', onclick: () => removePage(i), ...(state.pages.length <= MIN_PAGES ? { disabled: '' } : {}) }, '삭제'));
  }
  head.append(download);

  const form = el('div', { class: 'form' });
  const wrapEl = el('section', { class: 'box slide' }, head, preview, form);

  // rebuild=true면 폼(사진 칸 개수 등)까지 다시 만든다
  const refresh = rebuild => {
    redraw();
    save();
    if (rebuild) wrapEl.replaceWith(buildSlide(slide, n, total));
  };

  if (slide.kind === 'cover') {
    const c = state.cover;
    form.append(
      textField('윗 꼬리표', c.tag, v => { c.tag = v; refresh(false); }, { placeholder: '예) 교육혁신사업단' }),
      textField('제목', c.title, v => { c.title = v; refresh(false); }, {
        multiline: true, hint: 'Enter로 줄을 나눌 수 있어요', placeholder: '예)\n2026\n행사 이름',
      }),
      textField('해시태그', c.hashtags, v => { c.hashtags = v; refresh(false); }, { placeholder: '예) #교육혁신 #학생참여 #행사소개' }),
      el('div', { class: 'field' }, el('span', {}, '사진'), el('div', { class: 'slots' }, slotEditor(slots[0], '표지 사진', refresh))),
    );
  } else if (slide.kind === 'inner') {
    const p = slide.page;
    const seg = el('div', { class: 'seg' }, ...Object.entries(LAYOUTS).map(([key, l]) =>
      el('button', { class: p.layout === key ? 'on' : '', onclick: () => { p.layout = key; refresh(true); } }, l.label)));
    form.append(
      el('div', { class: 'field' }, el('span', {}, '구성'), seg),
      textField('소제목', p.title, v => { p.title = v; refresh(false); }, { placeholder: '예) 행사를 소개합니다' }),
      textField('본문', p.body, v => { p.body = v; refresh(false); }, {
        multiline: true, hint: '"- "로 시작하는 줄은 글머리표(•)가 됩니다. 빈 줄로 문단을 나눠요.',
        placeholder: '예)\n- 행사를 한두 문장으로 소개합니다.\n- 일시: 2026년 ○월 ○일 / 장소: ○○관',
      }),
    );
    if (slots.length) {
      form.append(el('div', { class: 'field' }, el('span', {}, '사진'),
        el('div', { class: 'slots' }, ...slots.map((s, k) => slotEditor(s, `사진 ${k + 1}`, refresh)))));
    }
  } else {
    form.append(el('p', { class: 'closing-note' }, '피그마의 마무리 장(3-7)을 그대로 사용합니다. 왼쪽에서 넣거나 뺄 수 있어요.'));
  }

  redraw();
  return wrapEl;
}

function renderAll() {
  const list = slideList();
  slidesEl.replaceChildren(...list.map((s, i) => buildSlide(s, i + 1, list.length)));
  document.getElementById('pagesCount').textContent = state.pages.length;
  document.getElementById('pagesMinus').disabled = state.pages.length <= MIN_PAGES;
  document.getElementById('pagesPlus').disabled = state.pages.length >= MAX_PAGES;
  document.getElementById('closingToggle').checked = state.closing;
  document.getElementById('summary').textContent =
    `표지 1 + 속지 ${state.pages.length}${state.closing ? ' + 마무리 1' : ''} = 총 ${list.length}장`;
}

function movePage(i, d) {
  const [p] = state.pages.splice(i, 1);
  state.pages.splice(i + d, 0, p);
  save(); renderAll();
}

function removePage(i) {
  if (state.pages.length <= MIN_PAGES) return;
  state.pages.splice(i, 1);
  save(); renderAll();
}

// ---------- 내보내기 ----------

function canvasBlob(canvas) {
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

function saveBlob(blob, name) {
  const a = el('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function downloadOne(canvas, name) {
  saveBlob(await canvasBlob(canvas), name + '.png');
}

async function downloadZip() {
  const btn = document.getElementById('zipBtn');
  btn.disabled = true;
  btn.textContent = '만드는 중…';
  try {
    const list = slideList();
    const canvas = el('canvas', { width: W, height: H });
    if (!window.JSZip) {
      for (const [i, s] of list.entries()) { render(s, canvas); await downloadOne(canvas, slideName(s, i + 1)); }
      return;
    }
    const zip = new JSZip();
    for (const [i, s] of list.entries()) {
      render(s, canvas);
      zip.file(slideName(s, i + 1) + '.png', await canvasBlob(canvas));
    }
    saveBlob(await zip.generateAsync({ type: 'blob' }), '카드뉴스.zip');
  } finally {
    btn.disabled = false;
    btn.textContent = '전체 PNG 받기 (ZIP)';
  }
}

// ---------- 피그마로 보내기 ----------
// 플러그인(figma-plugin/)이 읽는 JSON. 사진은 칸 크기에 맞춰 잘라(2배 해상도) 넣는다.

const FIGMA_TEMPLATE = { section: '학생정책발굴단 카드뉴스', cover: '3-0', inner: '3-1', closing: '3-7' };

function cropPhoto(photo, w, h) {
  if (!photo) return null;
  const c = el('canvas', { width: w * 2, height: h * 2 });
  const ctx = c.getContext('2d');
  ctx.scale(2, 2);
  drawPhoto(ctx, photo, 0, 0, w, h);
  return c.toDataURL('image/jpeg', 0.9);
}

function figmaData() {
  const canvas = el('canvas', { width: W, height: H });
  const slides = slideList().map((s, i) => {
    const info = render(s, canvas) || {};
    const name = slideName(s, i + 1);
    if (s.kind === 'cover') {
      const c = state.cover;
      return { kind: 'cover', name, tag: c.tag, title: c.title, titleSize: info.titleSize, hashtags: c.hashtags,
        photo: cropPhoto(c.photo, COVER_SLOT[2], COVER_SLOT[3]) };
    }
    if (s.kind === 'inner') {
      const p = s.page;
      return { kind: 'inner', name, title: p.title, body: p.body, bodySize: info.size, layout: p.layout,
        photos: LAYOUTS[p.layout].slots.map(([, , w, h], k) => cropPhoto(p.photos[k], w, h)) };
    }
    return { kind: 'closing', name };
  });
  return { version: 1, createdAt: new Date().toLocaleString('ko-KR'), template: FIGMA_TEMPLATE, slides };
}

function downloadForFigma(json) {
  saveBlob(new Blob([json], { type: 'application/json' }), '카드뉴스_피그마용.json');
}

// 로컬 서버(server.py)로 열었으면 서버에 올려 두고, 켜져 있는 피그마 플러그인이 바로 가져간다.
// 파일로 열었거나 서버가 꺼져 있으면 json 파일로 내려받는다.
async function sendToFigma() {
  const btn = document.getElementById('figmaBtn');
  const status = document.getElementById('figmaStatus');
  btn.disabled = true;
  status.className = 'hint';
  status.textContent = '보내는 중…';
  const json = JSON.stringify(figmaData());
  try {
    if (!location.protocol.startsWith('http')) throw new Error('no server');
    const res = await fetch('/api/job', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: json });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    status.textContent = '피그마로 보냈어요. 피그마에서 "카드뉴스 가져오기" 플러그인이 켜져 있으면 바로 만들어집니다.';
  } catch (e) {
    downloadForFigma(json);
    status.className = 'hint warn';
    status.textContent = '자동 연결이 안 돼서 json 파일로 받았어요. "카드뉴스 제작기 실행"으로 열면 피그마로 바로 보낼 수 있어요.';
  } finally {
    btn.disabled = false;
  }
}

// ---------- AI 자동 작성 (Claude API, 사용자 키) ----------

const KEY_STORE = 'cardnews.apiKey';
const INFO_STORE = 'cardnews.info';
const MODEL = 'claude-opus-5-5';
const SDK_URL = 'https://esm.sh/@anthropic-ai/sdk@1.3.0';

const AI_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['cover', 'pages'],
  properties: {
    cover: {
      type: 'object',
      additionalProperties: false,
      required: ['tag', 'title', 'hashtags', 'photo'],
      properties: {
        tag: { type: 'string' },
        title: { type: 'string' },
        hashtags: { type: 'string' },
        photo: { type: 'integer' },
      },
    },
    pages: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'body', 'layout', 'photos'],
        properties: {
          title: { type: 'string' },
          body: { type: 'string' },
          layout: { type: 'string', enum: ['photo1', 'photo2', 'text'] },
          photos: { type: 'array', items: { type: 'integer' } },
        },
      },
    },
  },
};

const AI_SYSTEM = `당신은 대학 교육혁신사업단 인스타그램 카드뉴스의 에디터입니다. 사용자가 준 정보와 사진으로 카드뉴스 한 세트(표지 1장 + 속지 여러 장)의 문구와 구성을 정합니다. 마무리 장은 고정이라 쓰지 않습니다.

1080×1350 템플릿에 들어가는 분량에 맞춰 주세요.
- cover.tag: 표지 맨 위 꼬리표. 10자 이내. 특별한 지시가 없으면 "교육혁신사업단".
- cover.title: 표지 제목 2줄. 한 줄에 10자 안팎, 줄바꿈은 \\n. 예: "2026\\n학생정책발굴단"
- cover.hashtags: 해시태그 3개를 공백으로 구분. 예: "#학생 #정책 #첫걸음"
- pages[].title: 속지 소제목. 20자 이내.
- pages[].body: photo1/photo2 구성은 3~6줄(한 줄 약 35자), text 구성은 4~8줄. "- "로 시작하는 줄은 글머리표가 되고, 그 다음 줄은 같은 항목의 이어지는 줄이 됩니다. 문장은 "~합니다/~했습니다" 체로 씁니다.
- pages[].layout: photo1(사진 1장), photo2(사진 2장 나란히), text(사진 없이 카드 안에 글만).
- 모든 장에 사진이 있을 필요는 없습니다. 내용에 맞는 사진이 있을 때만 넣고, 없으면 text 구성으로 씁니다.
- 사진은 번호(0부터)로 지정하고, 같은 사진을 두 번 쓰지 않습니다. 표지에는 전체를 대표하는 사진을 고릅니다. 사진을 쓰지 않으면 cover.photo는 -1, photos는 빈 배열입니다. layout의 사진 수와 photos 개수를 맞추세요.
- 사진은 정보원이기도 합니다. 포스터, 안내문, 슬라이드, 문서 캡처 등에 있는 글자와 내용(행사명, 일시, 장소, 프로그램 등)을 읽어 문구에 반영합니다. 이런 자료 사진은 카드에 넣지 않는 것이 보통이고, 활동 현장 사진을 우선 배치합니다.
- 적힌 정보나 사진에서 확인되지 않는 날짜, 숫자, 이름, 인용은 지어내지 않습니다. 정보가 부족하면 있는 내용 안에서 일반적으로 풀어 씁니다.
- 흐름은 소개 → 진행 내용 → 의미·다음 계획 순서를 기본으로 합니다.`;

function updateAiPhotos() {
  const span = document.getElementById('aiPhotos');
  if (span) span.textContent = library.length ? `사진 ${library.length}장을 AI가 함께 봅니다` : '사진 없이 적은 정보만으로 작성합니다';
  const lib = document.getElementById('aiLib');
  if (!lib) return;
  lib.replaceChildren(...library.map((photo, i) => el('figure', {},
    el('img', { src: photo.img.src, alt: `사진 ${i}` }),
    el('span', { class: 'no' }, String(i)),
    el('button', { title: 'AI 목록에서 빼기', onclick: () => { library.splice(i, 1); updateAiPhotos(); } }, '×'))));
}

// AI 칸에 올린 사진은 바로 배치하지 않고 목록에만 담는다 (배치는 AI가 정한다)
async function addToLibrary(files) {
  for (const file of [...files].filter(f => f.type.startsWith('image/'))) await photoFromFile(file);
}

// 포스터·안내문의 글자를 읽을 수 있도록 긴 변 1280px로 보낸다
function thumbBase64(photo, max = 1280) {
  const scale = Math.min(1, max / Math.max(photo.img.width, photo.img.height));
  const c = el('canvas', { width: Math.round(photo.img.width * scale), height: Math.round(photo.img.height * scale) });
  c.getContext('2d').drawImage(photo.img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.8).split(',')[1];
}

function setAiStatus(text, isError = false) {
  const s = document.getElementById('aiStatus');
  s.textContent = text;
  s.className = isError ? 'hint error' : 'hint';
}

async function runAi() {
  const apiKey = document.getElementById('apiKey').value.trim();
  const info = document.getElementById('aiInfo').value.trim();
  if (!apiKey) { document.getElementById('keyBox').open = true; setAiStatus('Claude API 키를 넣어 주세요.', true); return; }
  if (!info && !library.length) { setAiStatus('정보를 적거나 사진을 넣어 주세요.', true); return; }

  const btn = document.getElementById('aiBtn');
  btn.disabled = true;
  setAiStatus('작성 중… (사진이 많으면 30초~1분 걸려요)');
  try {
    const { default: Anthropic } = await import(SDK_URL);
    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

    const auto = document.getElementById('aiAutoCount').checked;
    const countLine = auto
      ? `속지 장 수: 내용에 맞게 ${MIN_PAGES}~${MAX_PAGES}장 사이에서 정해 주세요 (보통 4~6장).`
      : `속지 장 수: 정확히 ${state.pages.length}장.`;
    const content = [];
    library.forEach((photo, i) => {
      content.push({ type: 'text', text: `사진 ${i}` });
      content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: thumbBase64(photo) } });
    });
    content.push({ type: 'text', text: `정보:\n${info || '(따로 적은 정보 없음. 사진에서 읽어 주세요.)'}\n\n${countLine}\n사진 수: ${library.length}장` });

    let res;
    try {
      res = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'medium', format: { type: 'json_schema', schema: AI_SCHEMA } },
        system: AI_SYSTEM,
        messages: [{ role: 'user', content }],
      });
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) throw new Error('API 키가 올바르지 않아요.');
      if (e instanceof Anthropic.PermissionDeniedError) throw new Error('이 API 키로는 이 모델을 쓸 수 없어요.');
      if (e instanceof Anthropic.RateLimitError) throw new Error('요청이 많아요. 잠시 후 다시 눌러 주세요.');
      if (e instanceof Anthropic.APIConnectionError) throw new Error('Anthropic 서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.');
      if (e instanceof Anthropic.APIError) throw new Error(`API 오류 (${e.status ?? '-'}): ${e.message}`);
      throw e;
    }

    if (res.stop_reason === 'refusal') throw new Error('AI가 이 요청을 처리하지 않았어요. 정보를 바꿔 다시 시도해 주세요.');
    if (res.stop_reason === 'max_tokens') throw new Error('응답이 너무 길어 잘렸어요. 장 수를 줄여 다시 시도해 주세요.');
    const text = res.content.filter(b => b.type === 'text').map(b => b.text).join('');
    applyAi(JSON.parse(text), auto);
    try { localStorage.setItem(KEY_STORE, apiKey); } catch (e) { /* 저장 불가 환경 */ }
    setAiStatus('완료! 아래에서 확인하고 필요하면 고쳐 주세요.');
  } catch (e) {
    setAiStatus(e.message || String(e), true);
  } finally {
    btn.disabled = false;
  }
}

function applyAi(result, auto) {
  const pick = i => (Number.isInteger(i) && i >= 0 && i < library.length ? library[i] : null);
  const c = result.cover;
  state.cover = { ...state.cover, tag: c.tag, title: c.title, hashtags: c.hashtags, photo: pick(c.photo) || state.cover.photo };

  // 실제로 쓸 수 있는 사진 수에 맞춰 구성을 고른다 (사진 없는 장은 '글만')
  let pages = result.pages.slice(0, MAX_PAGES).map(p => {
    const photos = p.photos.map(pick).filter(Boolean).slice(0, 2);
    const wanted = p.layout === 'photo2' ? 2 : p.layout === 'photo1' ? 1 : 0;
    const n = Math.min(wanted, photos.length);
    return {
      layout: n === 2 ? 'photo2' : n === 1 ? 'photo1' : 'text',
      title: p.title,
      body: p.body,
      photos: [photos[0] || null, photos[1] || null],
    };
  });
  if (!auto) {
    const n = state.pages.length;
    pages = pages.slice(0, n);
    while (pages.length < n) pages.push(defaultPage(pages.length));
  }
  if (!pages.length) pages = [defaultPage(0)];
  state.pages = pages;
  save();
  renderAll();
}

// ---------- 사진 일괄 배치 ----------

async function bulkAdd(files) {
  const images = [...files].filter(f => f.type.startsWith('image/'));
  const empty = slideList().flatMap(s => photoSlots(s)).filter(s => !s.get());
  for (const [i, file] of images.entries()) {
    if (!empty[i]) break;
    empty[i].set(await photoFromFile(file));
  }
  if (images.length > empty.length) alert(`빈 사진 칸이 ${empty.length}개라 ${images.length - empty.length}장은 넣지 못했어요.`);
  renderAll();
}

// ---------- 시작 ----------

async function init() {
  const a = window.CN_ASSETS;
  [IMG.bgCover, IMG.bgInner, IMG.footerCover, IMG.footerInner, IMG.closing] = await Promise.all(
    [a.bgCover, a.bgInner, a.footerCover, a.footerInner, a.closing].map(loadImage));
  try {
    await Promise.all(['500 24px', '600 48px', '700 80px'].map(f => document.fonts.load(`${f} Pretendard`)));
  } catch (e) { /* 오프라인이면 시스템 글꼴로 대체 */ }

  const hasSaved = load();

  document.getElementById('pagesMinus').onclick = () => { if (state.pages.length > MIN_PAGES) { state.pages.pop(); save(); renderAll(); } };
  document.getElementById('pagesPlus').onclick = () => {
    if (state.pages.length < MAX_PAGES) { state.pages.push(defaultPage()); save(); renderAll(); }
  };
  document.getElementById('closingToggle').onchange = e => { state.closing = e.target.checked; save(); renderAll(); };
  document.getElementById('zipBtn').onclick = downloadZip;
  document.getElementById('figmaBtn').onclick = sendToFigma;
  document.getElementById('aiBtn').onclick = runAi;

  const keyInput = document.getElementById('apiKey');
  const infoInput = document.getElementById('aiInfo');
  try {
    keyInput.value = localStorage.getItem(KEY_STORE) || '';
    infoInput.value = localStorage.getItem(INFO_STORE) || '';
  } catch (e) { /* 저장 불가 환경 */ }
  infoInput.addEventListener('input', () => { try { localStorage.setItem(INFO_STORE, infoInput.value); } catch (e) { /* 무시 */ } });
  const aiDrop = document.getElementById('aiDrop');
  const aiInput = document.getElementById('aiInput');
  aiDrop.onclick = () => aiInput.click();
  aiInput.onchange = async () => { await addToLibrary(aiInput.files); aiInput.value = ''; };
  aiDrop.addEventListener('dragover', e => { e.preventDefault(); aiDrop.classList.add('over'); });
  aiDrop.addEventListener('dragleave', () => aiDrop.classList.remove('over'));
  aiDrop.addEventListener('drop', e => { e.preventDefault(); aiDrop.classList.remove('over'); addToLibrary(e.dataTransfer.files); });
  updateAiPhotos();
  document.getElementById('newBtn').onclick = () => {
    if (!confirm('지금 내용과 사진을 모두 지우고 새로 만들까요?')) return;
    library.length = 0;
    state = blankState();
    infoInput.value = '';
    try { localStorage.setItem(INFO_STORE, ''); } catch (e) { /* 저장 불가 환경 */ }
    save(); updateAiPhotos(); renderAll();
  };
  if (!hasSaved) {
    // 처음 열면 빈 상태: 예전 버전이 남긴 정보 칸 내용도 비운다
    infoInput.value = '';
    try { localStorage.setItem(INFO_STORE, ''); } catch (e) { /* 저장 불가 환경 */ }
  }

  const drop = document.getElementById('bulkDrop');
  const input = document.getElementById('bulkInput');
  drop.onclick = () => input.click();
  input.onchange = () => { bulkAdd(input.files); input.value = ''; };
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); bulkAdd(e.dataTransfer.files); });

  renderAll();
}

init();
