// 카드뉴스 제작기(웹)에서 내보낸 JSON을 받아, 피그마 템플릿(표지 3-0 / 속지 3-1 / 마무리 3-7)을
// 복제하고 글·사진을 채운다. 결과는 템플릿 섹션 아래 새 섹션에 놓인다.

const FRAME_GAP = 120;
const SECTION_PAD = 100;

function progress(text) {
  figma.ui.postMessage({ type: 'progress', text });
}

async function findTemplates(names) {
  const isTemplate = n => n.type === 'SECTION' && n.name === names.section;
  // 현재 페이지의 맨 위 단계부터 본다 (페이지 전체를 뒤지면 레이어가 많을 때 오래 걸린다)
  const pages = [figma.currentPage, ...figma.root.children.filter(p => p !== figma.currentPage)];
  for (const page of pages) {
    await page.loadAsync();
    const section = page.children.find(isTemplate) || page.findOne(isTemplate);
    if (!section) continue;
    const pick = name => section.findChild(n => n.type === 'FRAME' && n.name === name);
    const t = { page, section, cover: pick(names.cover), inner: pick(names.inner), closing: pick(names.closing) };
    if (t.cover && t.inner) return t;
  }
  throw new Error(`"${names.section}" 섹션에서 ${names.cover} / ${names.inner} 프레임을 찾지 못했어요.`);
}

// 템플릿 글꼴(Pretendard 등)이 이 컴퓨터에 없으면 Noto Sans KR로 바꿔 끼운다.
const missingFonts = new Set();
let fallbackStyles = null;

async function fallbackFont(style) {
  if (!fallbackStyles) {
    fallbackStyles = (await figma.listAvailableFontsAsync())
      .filter(f => f.fontName.family === 'Noto Sans KR').map(f => f.fontName.style);
  }
  const want = [style, style.replace(/\s/g, ''), /bold|black/i.test(style) ? 'Bold' : 'Medium', 'Regular'];
  const found = want.find(w => fallbackStyles.includes(w));
  return found ? { family: 'Noto Sans KR', style: found } : null;
}

async function loadFonts(node) {
  const len = node.characters.length;
  const segments = len ? node.getStyledTextSegments(['fontName']) : [{ start: 0, end: 0, fontName: node.fontName }];
  for (const seg of segments) {
    try {
      await figma.loadFontAsync(seg.fontName);
    } catch (e) {
      const fb = await fallbackFont(seg.fontName.style);
      if (!fb) throw e;
      await figma.loadFontAsync(fb);
      if (len) node.setRangeFontName(seg.start, seg.end, fb); else node.fontName = fb;
      missingFonts.add(`${seg.fontName.family} ${seg.fontName.style}`);
    }
  }
}

async function setText(node, text) {
  await loadFonts(node);
  node.characters = text;
}

function imageFill(bytes) {
  return { type: 'IMAGE', imageHash: figma.createImage(bytes).hash, scaleMode: 'FILL' };
}

const EMPTY_FILL = { type: 'SOLID', color: { r: 0.81, g: 0.78, b: 0.75 } };

// "- "로 시작하는 줄 = 글머리표 문단. 이어지는 줄은 같은 문단 안의 줄바꿈(U+2028)으로 붙인다.
function toParagraphs(body) {
  const paras = [];
  let open = null;
  for (const raw of body.split('\n')) {
    if (!raw.trim()) { paras.push({ text: '', bullet: false }); open = null; continue; }
    const m = raw.match(/^\s*[-•·*]\s+(.*)$/);
    if (m) { open = { text: m[1].trim(), bullet: true }; paras.push(open); }
    else if (open) open.text += ' ' + raw.trim();
    else paras.push({ text: raw.trim(), bullet: false });
  }
  return paras;
}

async function setBody(node, body, size) {
  const paras = toParagraphs(body);
  await setText(node, paras.map(p => p.text).join('\n') || ' ');
  let at = 0;
  for (const p of paras) {
    const end = at + p.text.length;
    if (end > at) {
      node.setRangeListOptions(at, end, { type: p.bullet ? 'UNORDERED' : 'NONE' });
      node.setRangeIndentation(at, end, p.bullet ? 1 : 0);
    }
    at = end + 1;
  }
  if (size) {
    node.fontSize = size;
    node.lineHeight = { unit: 'PIXELS', value: Math.round(size * 1.667) };
  }
}

const directText = frame => frame.children.find(n => n.type === 'TEXT');
const tagFrame = (frame, maxY) => frame.children.find(n => n.type === 'FRAME' && n.y < maxY && n.findOne(k => k.type === 'TEXT'));
const maskGroup = frame => frame.children.find(n => n.type === 'GROUP' && n.children[0] && n.children[0].isMask);

async function setTag(frame, text) {
  if (!frame) return;
  if (!text.trim()) { frame.visible = false; return; }
  await setText(frame.findOne(n => n.type === 'TEXT'), text.trim());
}

async function fillCover(frame, s) {
  await setTag(tagFrame(frame, 200), s.tag);

  const title = directText(frame);
  await setText(title, s.title.trim());
  if (s.titleSize) {
    title.fontSize = s.titleSize;
    title.lineHeight = { unit: 'PIXELS', value: Math.round(s.titleSize * 1.19) };
  }

  const hash = frame.children.find(n => n.type === 'FRAME' && n.y > 900 && n.findOne(k => k.type === 'TEXT'));
  await setTag(hash, s.hashtags);

  const group = maskGroup(frame);
  if (group && s.photo) {
    const mask = group.children[0];
    const img = group.findOne(n => n !== mask && 'fills' in n && Array.isArray(n.fills) && n.fills.some(f => f.type === 'IMAGE'));
    if (img) {
      img.relativeTransform = mask.relativeTransform;
      img.resize(mask.width, mask.height);
      img.fills = [imageFill(s.photo)];
    }
  }
}

async function fillInner(frame, s) {
  await setTag(tagFrame(frame, 300), s.title);
  const body = directText(frame);
  await setBody(body, s.body, s.bodySize);

  const group = maskGroup(frame);
  if (!group) return;

  if (s.layout === 'text') {
    group.remove();
    body.textAutoResize = 'HEIGHT';
    body.resize(735, body.height);
    body.x = 173;
    body.y = 638 + Math.max(0, (460 - body.height) / 2);
    return;
  }

  const mask = group.children[0];
  for (const c of group.children.slice(1)) c.remove();
  const count = s.layout === 'photo2' ? 2 : 1;
  const gap = 15;
  const w = count === 2 ? (mask.width - gap) / 2 : mask.width;
  for (let i = 0; i < count; i++) {
    const rect = figma.createRectangle();
    group.appendChild(rect);
    rect.name = `사진 ${i + 1}`;
    rect.x = mask.x + i * (w + gap);
    rect.y = mask.y;
    rect.resize(w, mask.height);
    rect.fills = [s.photos[i] ? imageFill(s.photos[i]) : EMPTY_FILL];
  }
}

async function build(data) {
  progress('템플릿 찾는 중…');
  const tpl = await findTemplates(data.template);
  if (tpl.page !== figma.currentPage) await figma.setCurrentPageAsync(tpl.page);

  const section = figma.createSection();
  tpl.page.appendChild(section);
  section.name = `카드뉴스 자동생성 ${data.createdAt || ''}`.trim();
  section.x = tpl.section.x;
  section.y = tpl.section.y + tpl.section.height + 400;

  const frames = [];
  for (const [i, s] of data.slides.entries()) {
    const source = s.kind === 'cover' ? tpl.cover : s.kind === 'closing' ? tpl.closing : tpl.inner;
    if (!source) continue;
    progress(`${i + 1} / ${data.slides.length}장 만드는 중…`);
    const frame = source.clone();
    section.appendChild(frame);
    frame.name = s.name || `${String(i + 1).padStart(2, '0')}`;
    frame.x = SECTION_PAD + frames.length * (frame.width + FRAME_GAP);
    frame.y = SECTION_PAD;
    if (s.kind === 'cover') await fillCover(frame, s);
    else if (s.kind === 'inner') await fillInner(frame, s);
    frames.push(frame);
  }

  const last = frames[frames.length - 1];
  section.resizeWithoutConstraints(last.x + last.width + SECTION_PAD, last.y + last.height + SECTION_PAD);
  figma.viewport.scrollAndZoomIntoView([section]);
  return { section, count: frames.length };
}

figma.showUI(__html__, { width: 360, height: 340 });

figma.ui.onmessage = async msg => {
  if (msg.type !== 'build') return;
  progress('받았어요. 준비 중…');
  try {
    const { count } = await build(msg.data);
    const fontNote = missingFonts.size ? ` (없는 글꼴 ${[...missingFonts].join(', ')} → Noto Sans KR로 대체)` : '';
    figma.notify(`카드뉴스 ${count}장을 만들었어요.${fontNote}`, { timeout: fontNote ? 8000 : 3000 });
    figma.ui.postMessage({ type: 'done', count, fontNote });
  } catch (e) {
    console.error(e);
    const message = (e && e.message) || String(e);
    figma.notify(message, { error: true });
    figma.ui.postMessage({ type: 'error', message });
  }
};
