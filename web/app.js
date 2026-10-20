const $ = s => document.querySelector(s);
const h = (tag, props = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) { if (v) e.addEventListener(k.slice(2), v); }
    else if (v === true) e.setAttribute(k, '');
    else if (v != null && v !== false) e.setAttribute(k, v);
  }
  e.append(...kids.flat().filter(x => x != null && x !== false));
  return e;
};
const icon = (path, size = 16) => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', size); s.setAttribute('height', size); s.setAttribute('aria-hidden', 'true');
  s.innerHTML = `<path d="${path}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
  return s;
};
const CHECK = '\u2713';
const EXPAND = 'M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7';
const CROP = 'M6 2v14a2 2 0 0 0 2 2h14M2 6h14a2 2 0 0 1 2 2v14';
async function api(path, body) {
  const raw = body instanceof Blob;
  const r = await fetch(path, body === undefined ? {} : {method: 'POST', headers: {'Content-Type': raw ? 'application/octet-stream' : 'application/json', 'X-Overlayrr': '1'}, body: raw ? body : JSON.stringify(body)});
  if (r.status === 401) { location.reload(); throw new Error('Signed out'); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || r.statusText);
  return d;
}
let titles = [], state = {pending: {}}, cat = 'all', query = '', shown = 120, open = null, offset = 0, polling = false, toastTimer;
const CATS = [['all', 'All'], ['movies', 'Movies'], ['tv', 'TV'], ['collections', 'Collections'], ['changed', 'Not pushed']];
const PROVIDERS = {tmdb: 'TMDb', fanart: 'Fanart.tv', tvdb: 'TVDB', plex: 'Plex'};
const saved = {get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private window */ } }};
// The page's own words follow whether a push uploads to Plex (the server says so in /api/state)
const words = () => state.upload ? {verb: 'Push', pending: 'Not pushed', last: 'push', lastDone: 'pushed'} : {verb: 'Render', pending: 'Not rendered', last: 'render', lastDone: 'rendered'};
// A short message at the bottom; `action` is an optional [label, function] button. It stays while the pointer or focus is on it, and has a dismiss button.
function toast(text, err, action) {
  const t = $('#toast'), hold = () => clearTimeout(toastTimer);
  const start = () => { hold(); toastTimer = setTimeout(() => t.hidden = true, Math.max(err || action ? 10000 : 5000, text.length * 70)); };
  t.replaceChildren(h('span', {}, text), action ? h('button', {onclick: () => { t.hidden = true; action[1](); }}, action[0]) : '',
    h('button', {class: 'tx', 'aria-label': 'Dismiss', title: 'Dismiss', onclick: () => { t.hidden = true; }}, '✕'));
  t.className = err ? 'err' : ''; t.setAttribute('role', err ? 'alert' : 'status'); t.hidden = false;
  t.onmouseenter = t.onfocusin = hold; t.onmouseleave = t.onfocusout = start;
  start();
}
const fail = e => toast(e.message, true);
const named = (title, year) => title + (year && !String(title).includes(`(${year})`) ? ` (${year})` : '');
const source = x => [PROVIDERS[x.provider] || x.provider, x.language && x.language.toUpperCase()].filter(Boolean).join(' · ');
// Re-rendering replaces the buttons, so put keyboard focus back on the one with the same data-k.
function keepFocus(work) {
  const a = document.activeElement, k = a && a.dataset && a.dataset.k;
  work();
  const e = k && document.querySelector(`[data-k="${CSS.escape(k)}"]`);
  if (e && e !== document.activeElement) e.focus({preventScroll: true});
}

const card = t => h('button', {class: 'card', 'data-id': t.id, onclick: () => openTitle(t.id)},
  t.thumb ? h('img', {src: t.thumb, loading: 'lazy', alt: ''}) : h('div', {class: 'blank'}, 'No poster yet'),
  state.pending[t.id] && h('span', {class: 'badge'}, words().pending),
  h('span', {class: 'name', title: named(t.title, t.year)}, named(t.title, t.year)));
// The list grows as you scroll: when the marker under the grid nears the screen, the next batch is added.
let current = [];
const ender = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) loadMore(); }, {rootMargin: '800px'});
function watchEnd() {
  ender.unobserve($('#more'));
  $('#more').hidden = current.length <= shown;
  if (shown < current.length) ender.observe($('#more'));  // Observing again re-checks, so a tall screen keeps filling
}
function loadMore() {
  const from = shown;
  shown += 120;
  $('#grid').append(...current.slice(from, shown).map(card));
  watchEnd();
}
// The text in the hint banner follows the same words as the buttons
function syncWords() {
  const w = words();
  for (const e of document.querySelectorAll('#hint [data-w]')) {
    const k = e.dataset.w;
    e.textContent = k === 'pending' ? w.pending : k === 'verb' ? w.verb : k === 'last' ? w.last : state.upload ? ' and sends them to Plex' : '';
  }
}
function draw() {
  const w = words(), n = Object.keys(state.pending).length, q = query.toLowerCase();
  const inCat = (id, t) => id === 'all' || (id === 'changed' ? state.pending[t.id] : t.cat === id), hit = t => t.title.toLowerCase().includes(q);
  const count = id => titles.reduce((c, t) => c + (inCat(id, t) && hit(t) ? 1 : 0), 0);  // What each chip would show for what's typed in the search
  keepFocus(() => $('#chips').replaceChildren(...CATS.map(([id, name]) => h('button', {class: cat === id ? 'on' : '', 'aria-pressed': String(cat === id), 'data-k': 'cat-' + id,
    onclick: () => { cat = id; shown = 120; draw(); }}, id === 'changed' ? w.pending : name, h('small', {}, count(id))))));
  const list = titles.filter(t => inCat(cat, t) && hit(t));
  if (cat === 'collections') list.sort((a, b) => !!b.first - !!a.first);  // New Episodes and Newly Released lead
  current = list;
  $('#grid').replaceChildren(...list.slice(0, shown).map(card));
  watchEnd();
  $('#empty').hidden = list.length > 0;
  $('#clearq').hidden = !(query && list.length === 0);
  $('#emptytext').textContent = !titles.length ? 'No titles yet. Run the script once (python overlayrr.py config.yaml) so each Plex title gets a folder under assets/; they appear here.'
    : query && list.length === 0 ? `No titles match “${query}”.`
    : cat === 'collections' && !titles.some(t => t.cat === 'collections')
    ? 'No collections yet. Set plex.include_collections: true in config.yaml and run the script once; each collection then gets a folder under assets/collections.'
    : cat === 'changed' ? `Nothing is waiting to be ${w.lastDone}.` : 'No titles found.';
  syncWords();
  document.title = n ? `(${n}) Overlayrr` : 'Overlayrr';
  $('#push').textContent = state.running ? 'Working…' : n ? `${w.verb} ${n} change${n > 1 ? 's' : ''}` : `Nothing to ${w.last}`;
  $('#push').title = state.upload ? 'Make the changed posters and send them to Plex' : 'Make the changed posters in their folders (Plex upload is off)';
  $('#push').disabled = !n || state.running;
  $('#up').textContent = state.upload ? 'Plex upload on' : 'Plex upload off';
  $('#up').title = state.upload ? 'Pushing makes the posters and sends them to Plex.'
    : 'Pushing only makes the posters in their folders. Set plex.upload: true in the config to send them to Plex.';
  $('#up').className = 'pill' + (state.upload ? ' live' : '');
  $('#logbtn').classList.toggle('busy', !!state.running);
  $('#logbtn').title = state.running ? 'A push is running: open the console to watch it' : 'Open the console: the output of every push this session';
}
async function refresh() {
  [titles, state] = await Promise.all([api('/api/titles'), api('/api/state')]);
  draw(); syncCollectionActions(); syncEventsActions();
}

// The title window. Everything that could be the poster (or logo) is one gallery: the current file, the files saved
// in the title's folder, and what the providers offer online. Clicking one uses it; the old one is kept
// beside it, and Discard changes goes back to what the last push used.
let view = null, lb = null, lbFrom = null;
const hasKey = d => d.key && /^\d+$/.test(d.key);
const section = () => view.d.sections[view.scope];
const chip = f => [f.size, f.kb > 1023 ? (f.kb / 1024).toFixed(1) + ' MB' : f.kb ? f.kb + ' KB' : null].filter(Boolean).join(' · ');
const seasonName = label => label.replace(/^Season 0*(?=\d)/, 'Season ');
const layer = () => { $('#drawer').inert = !!(lb || crop || !$('#addbox').hidden); };

const enc = encodeURIComponent, blobs = new Map();
const previewUrl = (s, extra = '', w = 520) => `/api/preview?id=${enc(s.id)}${extra}&w=${w}&v=${s.pv}`;
async function blobFor(url) {
  if (blobs.has(url)) return blobs.get(url);
  const r = await fetch(url);
  if (r.status === 401) { location.reload(); throw new Error('Signed out'); }
  if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || r.statusText); }
  const u = URL.createObjectURL(await r.blob());
  blobs.set(url, u);
  if (blobs.size > 24) { const [k, v] = blobs.entries().next().value; URL.revokeObjectURL(v); blobs.delete(k); }
  return u;
}
function fill(el, url) {
  if (blobs.has(url)) return el.replaceChildren(h('img', {src: blobs.get(url), alt: 'Preview'}));  // No spinner flash on a redraw
  el.replaceChildren(h('div', {class: 'blank'}, h('span', {}, h('span', {class: 'spin'}), 'Rendering…')));
  blobFor(url).then(u => { if (el.isConnected) el.replaceChildren(h('img', {src: u, alt: 'Preview'})); })
    .catch(e => { if (el.isConnected) el.replaceChildren(h('div', {class: 'blank'}, e.message)); });
}
// Logos sit on a checkerboard; dark logos need a light one and the other way round.
// The default is a mid grey that shows white and black logos alike; the button steps neutral, light, dark.
const CHECKS = [['mid', 'Neutral background'], ['light', 'Light background'], ['dark', 'Dark background']];
const checker = () => document.body.dataset.check || 'mid';
const nextCheck = () => CHECKS[(CHECKS.findIndex(c => c[0] === checker()) + 1) % CHECKS.length];
function flipChecker() {
  document.body.dataset.check = nextCheck()[0];
  saved.set('overlayrr-check', document.body.dataset.check);
  if (lb) drawLb(); else renderDetail();
}
const checkerButton = k => h('button', {class: 'ghost', 'data-k': k, onclick: flipChecker, title: 'Switch the background behind logos'}, nextCheck()[1]);

// What the providers offer, listed on demand; the browser loads the thumbnails from them directly.
// Live: the files the last push used, worked out by the server from its render record (view.live, by folder).
// A pick is staged while the folder's file differs from the live one; with nothing staged there's nothing to preview.
function ensureLive(i = view.scope) {
  const id = view.d.sections[i].id, store = view.live;
  if (store[id]) return;
  store[id] = {loading: true};
  api(`/api/live?id=${enc(id)}`).then(r => store[id] = r).catch(() => store[id] = {known: false})
    .finally(() => { if (view && view.live === store) renderDetail(); });
}
function staged(kind, i = view.scope) {
  const s = view.d.sections[i], live = view.live[s.id];
  if (!live || !live.known) return !!state.pending[view.d.id];  // Can't tell: go by the Not pushed mark
  return kind in live && (s[kind] ? s[kind].hash : null) !== live[kind];
}
// Seasons use the series logo, so a new one changes them too
const stagedAny = () => staged('poster') || staged('logo', 0);
const liveHash = () => { const live = view.live[section().id]; return live && live.known ? live[view.tab] : undefined; };
function tagFor(c) {
  if (c.type !== 'file') return null;
  const used = c.cur && !(view.tab === 'logo' && view.d.no_logo);  // With "No logo" the logo file in the folder isn't used
  if (used && staged(view.tab)) return [CHECK + ' Selected', 'on'];
  if (used) return [liveHash() === c.f.hash ? 'Live' : 'In use', 'live'];
  if (liveHash() === c.f.hash) return ['Live', 'live'];
  return null;
}
const remoteKey = (kind = view.tab) => kind === 'logo' ? 'logo' : `${kind}|${view.scope}`;
const remoteOf = kind => view.remote[remoteKey(kind)];
const imgFallback = x => e => { const im = e.target; im.onerror = null; if (im.src !== x.view) im.src = x.view; };
function remoteRows() {
  const r = remoteOf();
  if (!r || !r.items) return [];
  return view.tab === 'poster' && view.textFilter !== 'all' ? r.items.filter(x => x.text !== null && x.text === (view.textFilter === 'text')) : r.items;
}
const backdrops = () => (remoteOf('backdrop') || {}).items || [];
function ensureRemote() {
  for (const kind of view.tab === 'poster' ? ['poster', 'backdrop'] : ['logo']) {
    const key = remoteKey(kind), store = view.remote;
    if (store[key]) continue;
    store[key] = {loading: true};
    api(`/api/remote?id=${enc(section().id)}&kind=${kind}`).then(r => store[key] = r).catch(e => store[key] = {error: e.message})
      .finally(() => { if (view && view.remote === store) renderDetail(); });
  }
}
// The gallery: the live picture first, then your own (uploads, crops, links) and the file in use when it isn't an
// online picture, then what's online in the providers' order. A file downloaded from an online picture is shown in that
// picture's place and nowhere else; other saved files stay in the background. A file shown once stays (view.pinned),
// so picking never moves a tile.
function candidates(source = view.source) {
  const backs = view.tab === 'poster' ? backdrops().map(x => ({type: 'backdrop', x})) : [];
  if (source === 'backdrops') return backs;
  const s = section(), k = view.tab, live = liveHash(), r = remoteOf(), rows = (r && r.items) || [], ready = !!(r && (r.items || r.error));
  const visible = new Set(remoteRows().map(x => x.plex || x.url));
  const pinned = view.pinned[s.id + '|' + k] || (view.pinned[s.id + '|' + k] = []);
  const files = [s[k] && {type: 'file', f: s[k], cur: true}, ...s[k + 's'].map(f => ({type: 'file', f}))].filter(Boolean);
  const inSlot = new Map(), front = [];
  let liveSlot = null;
  for (const c of files) {
    const row = c.f.source && rows.find(x => (x.plex || x.url) === c.f.source);
    if (c.f.hash === live) { front.push(row ? {...c, x: row} : c); liveSlot = row && c.f.source; }
    else if (row && visible.has(c.f.source)) inSlot.set(c.f.source, {...c, x: row});
    else if (c.cur || (ready && c.f.source && !row) || pinned.includes(c.f.hash)) front.push(c);  // Until the list is in, a source can't be placed
  }
  if (ready) for (const c of front) if (!pinned.includes(c.f.hash)) pinned.push(c.f.hash);
  const at = c => pinned.includes(c.f.hash) ? pinned.indexOf(c.f.hash) : pinned.length;
  front.sort((a, b) => (b.f.hash === live) - (a.f.hash === live) || at(a) - at(b));
  const online = remoteRows().filter(x => (x.plex || x.url) !== liveSlot).map(x => inSlot.get(x.plex || x.url) || {type: 'remote', x});
  const list = [...front, ...online];
  return source === 'posters' ? list : [...list, ...backs];
}
const keyOf = c => c.type === 'file' ? 'f:' + c.f.name : 'r:' + (c.x.url || c.x.plex);
function act(c, i) {
  if (c.cur) lightbox(i);
  else if (c.type === 'backdrop') openCrop(c.x);
  else if (c.type === 'file') choose(c.f);
  else chooseRemote(c.x);
}
function tileFor(c, i) {
  const k = view.tab, f = c.f, x = c.x, file = c.type === 'file';
  const action = c.cur ? 'View larger' : c.type === 'backdrop' ? 'Crop into a poster' : `Use this ${k}`;
  const [tag, tagClass] = tagFor(c) || [null, ''];
  const size = file ? (f.kb > 1023 ? (f.kb / 1024).toFixed(1) + ' MB' : f.kb + ' KB') : x.width ? (c.type === 'backdrop' && x.height ? `${x.width}×${x.height}` : x.width + 'px') : '';
  return h('figure', {class: `tile ${c.type === 'backdrop' ? 'backdrop' : k}${tagClass === 'on' ? ' cur' : tagClass === 'live' ? ' live' : ''}`},
    h('button', {class: 'pick', 'data-k': 'pick-' + keyOf(c), 'data-act': action, 'aria-pressed': c.type === 'backdrop' ? null : String(!!c.cur), onclick: () => act(c, i),
        'aria-label': `${action}: ${file ? `${tag ? tag.replace(CHECK + ' ', '') + ' ' : ''}file ${f.name}` : source(x)}`},
      h('img', {src: file ? f.thumb : x.thumb, loading: 'lazy', alt: '', referrerpolicy: file ? null : 'no-referrer', onerror: file ? null : imgFallback(x)}),
      tag && h('span', {class: 'tag ' + tagClass}, tag),
      view.busy === keyOf(c) && h('span', {class: 'wait'}, h('span', {class: 'spin'}))),
    h('button', {class: 'zoom', title: 'View larger', 'aria-label': 'View larger', onclick: () => lightbox(i)}, icon(EXPAND)),
    h('figcaption', {class: 'cap'}, h('span', {}, file ? (x ? source(x) : f.size || f.name) : source(x)),
      h('span', {}, [c.type === 'remote' && k === 'poster' && x.text === false && 'no text', size].filter(Boolean).join(' · '))));
}
function renderDetail() {
  const d = view.d, s = section(), kind = view.tab, ok = hasKey(d), changed = state.pending[d.id];
  const seg = (name, labels, active, pick) => h('div', {class: 'seg', role: 'group', 'aria-label': name}, labels.map(([id, text]) =>
    h('button', {class: id === active ? 'on' : '', 'aria-pressed': String(id === active), 'data-k': `${name}-${id}`, onclick: () => { pick(id); renderDetail(); }}, text)));
  // Left: what the last push made, and below it what the next one will make
  const preview = h('div', {class: 'shotimg'}), next = stagedAny();
  if (next) fill(preview, previewUrl(s));
  else preview.replaceChildren(h('div', {class: 'blank'}, 'Nothing new to preview. Click a poster or logo to see how it would look.'));
  const last = h('div', {class: 'shotimg'}, s.rendered ? h('img', {src: s.rendered.thumb, alt: 'Current poster'}) : h('div', {class: 'blank'}, 'Not pushed yet'));
  const kindName = d.tv ? 'TV show' : d.id.startsWith('collections/') ? 'Collection' : 'Movie';
  const w = words();
  const stateTag = !ok ? h('span', {class: 'state'}, 'Not linked to Plex') : changed ? h('span', {class: 'state warn'}, w.pending) : h('span', {class: 'state ok'}, 'Up to date');
  const verb = state.upload ? 'Push to Plex' : 'Render';
  const pushButton = h('button', {class: changed ? 'primary' : '', 'data-k': 'push', disabled: !ok || state.running, onclick: () => push([d.id]),
      title: !ok ? 'Run the script for this title once so it knows its Plex ID' : state.upload ? 'Make the poster and send it to Plex' : 'Make the poster (Plex upload is off)'},
    state.running ? 'Working\u2026' : changed || !ok ? verb : state.upload ? 'Push again' : 'Render again');
  const discardButton = changed && h('button', {'data-k': 'discard', disabled: !!view.busy || state.running, onclick: discard,
    title: `Go back to the files the last ${w.last} used and drop the ${w.pending} mark`}, 'Discard changes');
  // Series / seasons: buttons while they fit, a list beyond that
  const scopes = d.sections.map((x, i) => [i, x.label ? seasonName(x.label) : 'Series']);
  const pickScope = i => { view.scope = +i; if (view.scope > 0) view.tab = 'poster'; view.limit = 48; };
  const scopeControl = d.sections.length > 1 && (d.sections.length <= 4 ? seg('scope', scopes, view.scope, pickScope)
    : h('select', {'aria-label': 'Series or season', 'data-k': 'scope', onchange: e => { pickScope(e.target.value); renderDetail(); }},
        scopes.map(([i, t]) => h('option', {value: i, selected: i === view.scope}, t))));
  const tabs = h('div', {class: 'tabs', role: 'tablist'}, [['poster', 'Poster'], ['logo', 'Logo']].map(([k, t]) =>
    h('button', {role: 'tab', class: kind === k ? 'on' : '', 'aria-selected': String(kind === k), 'data-k': 'tab-' + k,
      disabled: k === 'logo' && view.scope > 0, title: k === 'logo' && view.scope > 0 ? 'Seasons use the series logo' : null,
      onclick: () => { view.tab = k; if (k === 'logo' && view.source === 'backdrops') view.source = 'all'; view.limit = 48; renderDetail(); }}, t)));
  const main = remoteOf(), backs = kind === 'poster' ? remoteOf('backdrop') : null;
  const nPosters = main && main.items ? candidates('posters').length : null, nBacks = backs && backs.items ? backs.items.length : null;
  const filters = kind === 'poster' && h('div', {class: 'chips', role: 'group', 'aria-label': 'Show'},
    [['all', 'All', nPosters == null || nBacks == null ? null : nPosters + nBacks], ['posters', 'Posters', nPosters], ['backdrops', 'Backdrops', nBacks]].map(([id, text, n]) =>
      h('button', {class: view.source === id ? 'on' : '', 'aria-pressed': String(view.source === id), 'data-k': 'src-' + id,
        onclick: () => { view.source = id; view.limit = 48; renderDetail(); }}, text, n != null && h('small', {}, n))));
  const textFilter = kind === 'poster' && view.source !== 'backdrops' && main && main.items
    && h('select', {'aria-label': 'Posters with or without text', 'data-k': 'textfilter', onchange: e => { view.textFilter = e.target.value; view.limit = 48; renderDetail(); }},
      [['all', 'With or without text'], ['textless', 'Without text'], ['text', 'With text']].map(([v, t]) => h('option', {value: v, selected: v === view.textFilter}, t)));
  // The gallery: Add first, then the files, then what's online (placeholders while it loads), then backdrops to crop.
  // More is added as you scroll.
  const r = view.source === 'backdrops' ? backs : main, list = candidates();
  const loading = r && r.loading, failed = r && r.error;
  const shown = list.slice(0, view.limit).map((c, i) => [c, i]);
  const flat = shown.filter(([c]) => c.type !== 'backdrop'), wide = shown.filter(([c]) => c.type === 'backdrop');
  const extras = [
    loading && Array.from({length: 6}, () => h('div', {class: 'skel'})),
    failed && h('div', {class: 'note'}, h('span', {class: 'warnText'}, `Couldn't search online: ${r.error}`),
      h('button', {'data-k': 'retry', onclick: () => { delete view.remote[remoteKey(view.source === 'backdrops' ? 'backdrop' : kind)]; renderDetail(); }}, 'Try again')),
    !loading && !failed && list.length === 0 && h('p', {class: 'note dim'},
      {posters: 'Nothing found online for this one.', backdrops: 'No backdrops found.', all: 'Nothing found online for this one.'}[view.source])];
  const busy = String(!!view.busy);
  const gallery = view.source === 'backdrops'
    ? h('div', {class: 'gallery backdrops', 'aria-busy': busy}, wide.map(t => tileFor(...t)), ...extras)
    : h('div', {class: `gallery ${kind}s`, 'aria-busy': busy},
        ...(() => {
          const tiles = flat.map(t => tileFor(...t)), first = flat.length && flat[0][0].f && flat[0][0].f.hash === liveHash() ? 1 : 0;
          // Series only (seasons use its logo): a poster made without any logo, until a logo is picked again
          const none = kind === 'logo' && h('button', {class: 'addtile' + (d.no_logo ? ' on' : ''), 'data-k': 'nologo', 'aria-pressed': String(!!d.no_logo),
            title: d.no_logo ? 'Click to use a logo again' : 'Make this title’s poster, seasons and episode cards without a logo', onclick: () => noLogo(!d.no_logo)},
            h('b', {}, '⊘'), h('span', {}, 'No logo'), h('small', {}, d.no_logo ? CHECK + ' Selected' : 'Poster without a logo'));
          // Posters only: a wide backdrop can be cropped into one, which was otherwise two clicks away on the Backdrops filter
          const fromBackdrop = kind === 'poster' && backs && (backs.loading || nBacks > 0) && h('button', {class: 'addtile', 'data-k': 'cropfrom',
            title: 'Pick a wide backdrop and crop a poster out of it', onclick: () => { view.source = 'backdrops'; view.limit = 48; renderDetail(); }},
            h('b', {}, icon(CROP, 28)), h('span', {}, 'Crop from a backdrop'), h('small', {}, backs.loading ? 'Looking…' : `${nBacks} to choose from`));
          tiles.splice(first, 0, h('button', {class: 'addtile', 'data-k': 'add', onclick: openAdd},
            h('b', {}, '+'), h('span', {}, 'Add your own'), h('small', {}, 'Upload, paste or drop')), fromBackdrop, none, view.busy === 'add' && h('div', {class: 'skel'}));
          return tiles;
        })(), ...extras);
  const tip = view.source === 'backdrops' ? 'Pick a wide image and crop a poster out of it.'
    : `Click a ${kind} to try it and compare Current with Preview. Paste or drop your own image anywhere on this window.${kind === 'logo' ? ' “No logo” makes the poster without one.' : ''} `
      + (state.upload ? 'Live is what Plex has now.' : 'Live is what the last render used.');
  const areas = [...$('#drawer').querySelectorAll('.dlg,.main')].map(e => e.scrollTop);
  keepFocus(() => $('#drawer').replaceChildren(h('div', {class: 'dlg'},
    h('aside', {class: 'side'},
      h('figure', {class: 'shot'}, h('figcaption', {}, 'Current', h('small', {}, state.upload ? 'Last pushed' : 'Last render')), last),
      h('figure', {class: 'shot' + (next ? ' next' : '')}, h('figcaption', {}, 'Preview', h('small', {}, next ? 'After the next push' : 'No changes')), preview)),
    h('div', {class: 'main'},
      h('div', {class: 'top'},
        h('div', {class: 'head'},
          h('div', {}, h('h2', {id: 'dtitle'}, named(d.title, d.year)),
            h('div', {class: 'dim'}, [kindName, ok && `Plex ID ${d.key}`].filter(Boolean).join(' \u00b7 '), stateTag)),
          h('div', {class: 'acts'}, discardButton, pushButton, h('button', {onclick: close, title: 'Close (Esc)', 'aria-label': 'Close', 'data-k': 'close'}, '\u2715'))),
        h('div', {class: 'tabbar'}, tabs, scopeControl),
        h('div', {class: 'tools'}, filters, h('div', {class: 'row'}, textFilter, kind === 'logo' && checkerButton('checker')))),
      h('div', {class: 'body'},
        h('p', {class: 'tip'}, tip),
        gallery,
        view.source === 'all' && wide.length > 0 && [h('h3', {class: 'sub'}, `Backdrops (${nBacks}) \u00b7 click one to crop a poster from it`),
          h('div', {class: 'gallery backdrops', 'aria-busy': busy}, wide.map(t => tileFor(...t)))],
        list.length > view.limit && h('div', {class: 'sentinel'}),
        r && r.notes && r.notes.length > 0 && h('small', {class: 'dim'}, 'Some sources didn\u2019t answer: ' + r.notes.join(' \u00b7 ')))))));
  $('#drawer').querySelectorAll('.dlg,.main').forEach((e, i) => e.scrollTop = areas[i] || 0);
  watchGallery();
  ensureRemote();
  ensureLive();
  if (view.scope) ensureLive(0);
}
// When the end of the gallery comes near, show the next batch (the list is already loaded, so this is instant)
let galleryEnd = null;
function watchGallery() {
  if (galleryEnd) galleryEnd.disconnect();
  const mark = $('#drawer .sentinel');
  if (!mark) return;
  const root = getComputedStyle($('#drawer .main')).overflowY === 'visible' ? $('#drawer .dlg') : $('#drawer .main');
  galleryEnd = new IntersectionObserver(entries => {
    if (view && entries.some(e => e.isIntersecting)) { galleryEnd.disconnect(); view.limit += 48; renderDetail(); }
  }, {root, rootMargin: '0px 0px 900px 0px'});
  galleryEnd.observe(mark);
}
async function openTitle(id, keep) {
  const fresh = !(keep && view && view.d.id === id);
  open = id; $('#veil').hidden = $('#drawer').hidden = false;
  $('header').inert = $('main').inert = true; document.body.classList.add('locked');
  if (fresh) { view = null; $('#drawer').replaceChildren(h('div', {class: 'loading'}, h('span', {class: 'spin'}), 'Opening…')); $('#drawer').focus(); }
  try {
    const d = await api('/api/title?id=' + encodeURIComponent(id));
    if (open !== id) return;
    // After a push (keep) what's live has changed, so it's asked again
    view = !fresh ? {...view, d, busy: null, live: {}} : {d, scope: 0, tab: 'poster', source: 'all', textFilter: 'all', remote: {}, live: {}, pinned: {}, limit: 48, busy: null};
    view.scope = Math.min(view.scope, d.sections.length - 1);
    renderDetail();
  } catch (e) { fail(e); close(); }
}
function close() {
  const had = view, id = open;
  closeLb(); closeCrop(); closeAdd();
  open = null; view = null; $('#veil').hidden = $('#drawer').hidden = true;
  $('header').inert = $('main').inert = false; document.body.classList.remove('locked');
  if (galleryEnd) galleryEnd.disconnect();
  for (const u of blobs.values()) URL.revokeObjectURL(u);
  blobs.clear();
  if (had) api('/api/preview/clear', {}).catch(() => 0);
  const back = id && document.querySelector(`.card[data-id="${CSS.escape(id)}"]`);
  if (back) back.focus({preventScroll: true});
}
async function reload() {
  view.d = await api('/api/title?id=' + encodeURIComponent(view.d.id));
  state = await api('/api/state');
  draw(); renderDetail();
}
// One change at a time: `busy` marks the tile that shows a spinner until the server is done.
async function mutate(work, done, busy) {
  if (!view || view.busy) return;
  const id = view.d.id;
  view.busy = busy || 'add'; renderDetail();
  try {
    const r = await work();
    if (view && view.d.id === id) { view.busy = null; await reload(); }
    toast((r && r.warning) || done, !!(r && r.warning));
  } catch (e) { if (view) { view.busy = null; renderDetail(); } fail(e); }
}
const target = () => ({id: section().id, kind: view.tab});
// Back to what the last push used
function discard() {
  const w = words();
  if (!confirm(`Discard the changes to ${named(view.d.title, view.d.year)}? Its poster and logo go back to what the last ${w.last} used. The files you replaced stay in the list.`)) return;
  mutate(() => api('/api/discard', {id: view.d.id}), `Changes discarded. Back to what was last ${w.lastDone}.`);
}
const updated = () => view.tab === 'logo' && view.d.tv ? 'Logo updated. Seasons and episodes follow when you push.' : `${view.tab === 'logo' ? 'Logo' : 'Poster'} updated.`;
function choose(f) {
  closeLb();
  const u = target();
  mutate(() => api('/api/select', {id: u.id, kind: u.kind, name: f.name}), updated(), 'f:' + f.name);
}
function noLogo(on) {
  mutate(() => api('/api/nologo', {id: view.d.id, on}),
    on ? 'No logo. The poster' + (view.d.tv ? ', seasons and episodes are' : ' is') + ' made without one when you push.' : 'Using the logo again.', 'nologo');
}
function chooseRemote(x) {
  closeLb();
  const u = target();
  mutate(() => api('/api/import', {id: u.id, kind: u.kind, url: x.url, plex: x.plex, use: true}), updated(), 'r:' + (x.url || x.plex));
}
function remove(f) {
  if (!confirm(`Delete ${f.name}? The file is removed from this title's folder.`)) return;
  closeLb();
  mutate(() => api('/api/remove', {id: section().id, kind: view.tab, name: f.name}), 'Deleted.', 'f:' + f.name);
}
// Your own images: one becomes the current one, several are just saved.
function upload(files) {
  files = files.filter(f => f.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|tiff?|bmp)$/i.test(f.name));
  if (!files.length) return toast('Choose an image file', true);
  const use = files.length === 1 ? 1 : 0, u = target();
  mutate(async () => {
    let r = {};
    for (const f of files) {
      try { const one = await api(`/api/upload?id=${enc(u.id)}&kind=${u.kind}&use=${use}`, f); r = {warning: one.warning || r.warning}; }
      catch (e) { throw new Error(`${f.name}: ${e.message}`); }
    }
    return r;
  }, use ? `Added. It's the selected ${u.kind} now.` : `Added ${files.length} images to the list. Click one to use it.`, 'add');
}
function fromLink(url) {
  const u = target();
  mutate(() => api('/api/import', {id: u.id, kind: u.kind, url, use: true}), `Added. It's the selected ${u.kind} now.`, 'add');
}
function openAdd() {
  const el = $('#addbox'), kind = view.tab;
  const file = h('input', {type: 'file', accept: 'image/*', multiple: true, hidden: true, onchange: e => { const f = [...e.target.files]; closeAdd(); upload(f); }});
  const link = h('input', {type: 'url', placeholder: 'https://…/image.png', 'aria-label': 'Image link', required: true});
  const drop = h('label', {class: 'drop', tabindex: 0,
      onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); } },
      ondragover: e => { e.preventDefault(); drop.classList.add('over'); }, ondragleave: () => drop.classList.remove('over')},
    h('b', {}, 'Choose images'), h('span', {}, 'or drop them here'), file);
  el.hidden = false; layer();
  el.onclick = e => { if (e.target === el) closeAdd(); };
  el.ondragover = e => e.preventDefault();
  el.ondrop = dropped;
  el.replaceChildren(h('div', {class: 'sheet'},
    h('div', {class: 'row spread'}, h('h3', {id: 'addtitle'}, `Add your own ${kind}`), h('button', {'aria-label': 'Close', onclick: closeAdd}, '✕')),
    drop,
    h('div', {class: 'or'}, 'or use a link'),
    h('form', {class: 'linkrow', onsubmit: e => { e.preventDefault(); const u = link.value; closeAdd(); fromLink(u); }}, link, h('button', {class: 'primary'}, 'Add')),
    h('small', {class: 'dim'}, `One image becomes the current ${kind}; several are added to the list to pick from. You can also paste an image (Ctrl+V) or drop one anywhere on this title. `
      + `JPEG, PNG, WebP, GIF, TIFF or BMP, up to 40 MB.${kind === 'logo' ? ' Logos need a transparent background.' : ''}`)));
  drop.focus();
}
function closeAdd() {
  if ($('#addbox').hidden) return;
  $('#addbox').hidden = true; $('#addbox').replaceChildren(); layer();
  const back = $('[data-k="add"]');
  if (back) back.focus({preventScroll: true});
}
function dropped(e) {
  e.preventDefault(); dz.classList.remove('dragging');
  if (!view) return;
  closeAdd();
  const link = (e.dataTransfer.getData('text/uri-list') || '').split('\n')[0].trim();
  if (e.dataTransfer.files.length) upload([...e.dataTransfer.files]); else if (/^https?:/.test(link)) fromLink(link); else toast('Drop an image file or an image link', true);
}

// Crop window: drag a poster-shaped frame over a backdrop; the server downloads it and keeps only that part.
let crop = null;
function openCrop(x) {
  const target = remoteOf('backdrop').target;
  crop = {x, target, a: target[0] / target[1], fx: 0, fy: 0, z: 1, W: 1, H: 1, center: true, drag: null};
  layer();
  drawCrop();
  $('#crop .primary').focus();
}
function closeCrop() { if (!crop) return; crop = null; $('#crop').hidden = true; $('#crop').replaceChildren(); layer(); }
function drawCrop() {
  const c = crop, el = $('#crop');
  const img = h('img', {src: c.x.view, alt: '', draggable: false, referrerpolicy: 'no-referrer'});
  const frame = h('div', {class: 'frame'}), stage = h('div', {class: 'stage'}, img, frame);
  const info = h('span', {class: 'dim'}, 'Loading…');
  const layout = () => {
    const iw = img.clientWidth, ih = img.clientHeight, R = img.naturalWidth / img.naturalHeight;
    c.W = Math.min(1, c.a / R) * c.z; c.H = Math.min(1, R / c.a) * c.z;  // Fractions of the picture, always the poster's shape
    if (c.center) { c.fx = (1 - c.W) / 2; c.fy = (1 - c.H) / 2; c.center = false; }
    c.fx = Math.min(Math.max(c.fx, 0), 1 - c.W); c.fy = Math.min(Math.max(c.fy, 0), 1 - c.H);
    Object.assign(frame.style, {left: c.fx * iw + 'px', top: c.fy * ih + 'px', width: c.W * iw + 'px', height: c.H * ih + 'px'});
    // The picture shown may be a smaller copy, so use the backdrop's real size when the provider gave it
    const px = Math.round(c.W * (c.x.width || img.naturalWidth)), py = Math.round(c.H * (c.x.height || img.naturalHeight)), up = c.target[0] / px;
    info.textContent = `${px} × ${py} px, scaled to ${c.target[0]} × ${c.target[1]}` + (up > 1.05 ? ` (${up.toFixed(1)}× enlarged${up > 2.5 ? ', may look soft' : ''})` : '');
    info.className = up > 2.5 ? 'warnText' : 'dim';
  };
  img.onload = layout;
  img.onerror = () => { info.textContent = 'This backdrop could not be loaded.'; info.className = 'warnText'; };
  stage.onpointerdown = e => {
    const b = img.getBoundingClientRect();
    if (e.target !== frame) { c.fx = (e.clientX - b.left) / b.width - c.W / 2; c.fy = (e.clientY - b.top) / b.height - c.H / 2; layout(); }
    stage.setPointerCapture(e.pointerId);
    c.drag = {x: e.clientX, y: e.clientY, fx: c.fx, fy: c.fy};
  };
  stage.onpointermove = e => {
    if (!c.drag) return;
    c.fx = c.drag.fx + (e.clientX - c.drag.x) / img.clientWidth; c.fy = c.drag.fy + (e.clientY - c.drag.y) / img.clientHeight;
    layout();
  };
  stage.onpointerup = stage.onpointercancel = () => { c.drag = null; };
  const zoom = h('input', {type: 'range', min: 25, max: 100, value: 25, 'aria-label': 'Zoom', oninput: e => {
    const cx = c.fx + c.W / 2, cy = c.fy + c.H / 2, w0 = c.W / c.z, h0 = c.H / c.z;
    c.z = (125 - e.target.value) / 100; c.fx = cx - w0 * c.z / 2; c.fy = cy - h0 * c.z / 2;
    layout();
  }});
  el.hidden = false;
  el.onclick = e => { if (e.target === el) closeCrop(); };
  el.replaceChildren(h('div', {class: 'cropbox'},
    h('h3', {}, 'Crop a poster from this backdrop'),
    h('small', {class: 'dim'}, 'Drag the frame, or click the picture to move it there. Zoom in to use a smaller part.'),
    stage,
    h('div', {class: 'row'}, h('label', {class: 'row'}, 'Zoom', zoom), info),
    h('div', {class: 'row'}, h('button', {onclick: closeCrop}, 'Cancel'), h('button', {class: 'primary', onclick: useCrop}, 'Use this crop'))));
}
function useCrop() {
  const c = crop, u = target(), body = {id: u.id, kind: 'poster', url: c.x.url, plex: c.x.plex, use: true, crop: {x: c.fx, y: c.fy, w: c.W, h: c.H}};
  closeCrop();
  mutate(() => api('/api/import', body), 'Cropped. It\u2019s the selected poster now.', 'r:' + (c.x.url || c.x.plex));
}

// The larger view steps through whatever the gallery shows.
function lightbox(i) {
  lbFrom = document.activeElement;
  lb = {i};
  layer();
  drawLb();
  if (!$('#lb').contains(document.activeElement)) $('#lb [data-k="lb-close"]').focus();
}
function drawLb() {
  const list = candidates(), c = list[lb.i];
  if (!c) return closeLb();
  const el = $('#lb'), k = view.tab, file = c.type === 'file', online = c.type === 'remote', f = c.f, x = c.x, many = list.length > 1, layout = lb.layout && (file || online);
  const label = file ? f.name : source(x);
  const img = h('img', {src: file ? (layout ? f.thumb : f.full) : x.view, alt: label, referrerpolicy: 'no-referrer'});
  if (layout) {  // The server draws the picture in the layout; an online one is fetched there for it (and not saved)
    img.style.opacity = .5;
    const still = () => { const now = lb && candidates()[lb.i]; return now && keyOf(now) === keyOf(c); };
    blobFor(previewUrl(section(), file ? `&${k}=${enc(f.name)}` : `&kind=${k}&${x.plex ? 'plex=' + enc(x.plex) : 'url=' + enc(x.url)}`, 640))
      .then(u => { if (still()) { img.src = u; img.style.opacity = 1; } })
      .catch(e => { fail(e); if (still()) { lb.layout = false; drawLb(); } });
  }
  const size = file ? chip(f) : x.width ? (x.height ? `${x.width}×${x.height}` : `${x.width}px wide`) : 'size unknown';
  el.hidden = false; el.className = layout ? '' : c.type === 'backdrop' ? 'backdrop' : k;
  keepFocus(() => el.replaceChildren(
    many && h('button', {class: 'nav prev', 'aria-label': 'Previous', title: 'Previous (←)', 'data-k': 'lb-prev', onclick: () => step(-1)}, '‹'),
    img,
    many && h('button', {class: 'nav next', 'aria-label': 'Next', title: 'Next (→)', 'data-k': 'lb-next', onclick: () => step(1)}, '›'),
    h('div', {class: 'cap'},
      many && h('span', {class: 'count'}, `${lb.i + 1} / ${list.length}`),
      h('span', {}, `${label} · ${size}`),
      c.cur ? h('span', {class: 'inuse'}, tagFor(c)[0])
        : h('button', {class: 'primary', 'data-k': 'lb-use', onclick: () => { if (c.type === 'backdrop') { closeLb(); openCrop(x); } else act(c, lb.i); }},
            c.type === 'backdrop' ? 'Crop into a poster' : `Use this ${k}`),
      file && !c.cur && h('button', {'data-k': 'lb-rm', onclick: () => remove(f)}, 'Delete'),
      (file || online) && h('button', {'data-k': 'lb-layout', title: 'See it in the finished poster', onclick: () => { lb.layout = !lb.layout; drawLb(); }}, lb.layout ? 'Show the image alone' : 'Preview in layout'),
      k === 'logo' && !layout && c.type !== 'backdrop' && checkerButton('lb-check'),
      h('button', {'data-k': 'lb-close', onclick: closeLb}, 'Close'))));
}
function step(d) { const n = candidates().length; lb.i = (lb.i + d + n) % n; lb.layout = false; drawLb(); }
function closeLb() {
  if (!lb) return;
  lb = null; $('#lb').hidden = true; layer();
  if (lbFrom && lbFrom.isConnected) lbFrom.focus({preventScroll: true});
}

// The Console collects every run since the server started, one after another; it only opens when its tab is clicked.
async function tick() {
  const j = await api(`/api/job?since=${offset}`);
  const pre = $('#log pre');
  if (j.count < offset) { pre.textContent = ''; offset = 0; return tick(); }  // The server was restarted: its console began again
  if (j.lines.length) {
    const follow = !pre.clientHeight || pre.scrollHeight - pre.scrollTop - pre.clientHeight < 60;  // Not while you're reading further up
    pre.append(j.lines.join('\n') + '\n');
    if (follow) pre.scrollTop = pre.scrollHeight;
  }
  offset = j.count;
  $('#jobname').textContent = j.label ? `Console · ${j.label} · ${j.running ? 'running' : j.code === 0 ? 'done' : 'finished with errors'}` : 'Console';
  state.running = j.running; syncCollectionActions(); syncEventsActions();
  return j;
}
async function poll() {
  if (polling) return;
  polling = true;
  let j;
  try { while ((j = await tick()).running) await new Promise(r => setTimeout(r, 1000)); }
  catch (e) { fail(e); }
  finally { polling = false; }
  await refresh();
  if (document.body.dataset.view === 'events' && !eventsDirty) await loadEvents();
  if (open) openTitle(open, true);
  if (j && j.code !== 0 && $('#log').hidden) $('#logbtn').classList.add('err');  // A dot on the tab, not a pop-up
  if (j) toast(j.code === 0 ? `${j.label}: done` : `${j.label}: finished with errors.`, j.code !== 0, j.code !== 0 && ['Open Console', () => showLog(true)]);
}
function showLog(on) {
  $('#log').hidden = !on; document.body.classList.toggle('logopen', on);
  $('#logbtn').setAttribute('aria-expanded', String(on));
  if (on) { $('#logbtn').classList.remove('err'); const pre = $('#log pre'); pre.scrollTop = pre.scrollHeight; }
}
async function run(path, body) {
  try {
    await api(path, body); state.running = true; syncEventsActions(); $('#logbtn').classList.remove('err'); draw(); if (view) renderDetail();
    toast('Started. Progress shows in the Console.', false, ['Open Console', () => showLog(true)]); poll();
  } catch (e) { fail(e); }
}
function push(ids) { run('/api/push', ids ? {ids} : {}); }

let discoveryOpen = false, collectionTab = 'setup', collectionFilter = '', collectionSearch = '', collectionDate = '', collectionSaving = false;
let collectionsData = null, collectionsDirty = false, collectionIndex = -1;
const collectionDrafts = new WeakMap();
const collectionDiscoverState = {mode: 'recommendations', provider: 'all', query: '', url: '', type: 'movie', limit: 50, universe: null, results: null, preview: null};
const collectionProviderNames = {tmdb: 'TMDb', imdb: 'IMDb', trakt: 'Trakt', letterboxd: 'Letterboxd', mdblist: 'MDBList', flixpatrol: 'FlixPatrol'};
const COLLECTION_ADD = 'M12 5v14M5 12h14';
const COLLECTION_SEARCH = 'M21 21l-5-5M19 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0';
const COLLECTION_STACK = 'M4 6h16M4 12h16M4 18h16';
const COLLECTION_COMPASS = 'M16 8l-3 5-5 3 3-5 5-3M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0';
const collectionBadge = (text, style = '') => h('span', {class: 'collection-badge ' + style}, text);
function collectionProvider(entry) {
  try { const host = new URL(entry.source?.url).hostname.replace(/^www\./, ''); return Object.keys(collectionProviderNames).find(key => host === ({tmdb: 'themoviedb.org', imdb: 'imdb.com', trakt: 'trakt.tv', letterboxd: 'letterboxd.com', mdblist: 'mdblist.com', flixpatrol: 'flixpatrol.com'})[key]); }
  catch (e) { return null; }
}
function collectionInput(label, input, hint) {
  return h('label', {class: 'collection-field'}, h('span', {}, label), input, hint && h('small', {class: 'dim'}, hint));
}
function collectionLibraries(id) {
  return h('datalist', {id}, [...new Set([...collectionsData.libraries, ...collectionsData.collections.map(e => e.library)])].map(name => h('option', {value: String(name)})));
}
function syncCollectionActions() {
  if (!collectionsData) return;
  const busy = !!state.running || collectionSaving;
  const save = $('#collection-save'), plan = $('#collection-plan'), apply = $('#collection-apply'), status = $('#collection-save-state');
  if (save) { save.disabled = busy || !collectionsDirty; save.textContent = collectionSaving ? 'Saving…' : 'Save changes'; }
  if (plan) plan.disabled = busy || collectionsDirty;
  if (apply) apply.disabled = busy || collectionsDirty || !collectionsData.upload;
  if (status) {
    status.textContent = collectionSaving ? 'Saving changes…' : state.running ? 'Job running · see Console' : collectionsDirty ? 'Unsaved changes' : 'All changes saved';
    status.className = 'collection-save-state ' + (collectionsDirty ? 'unsaved' : '');
  }
  $('#views [data-view=collections]')?.classList.toggle('dirty', collectionsDirty);
}
function collectionDirty() { collectionsDirty = true; syncCollectionActions(); }
function newCollection() {
  collectionsData.collections.push({name: 'New collection', library: String(collectionsData.libraries[0] || ''), type: 'movie', members: [], sync: 'append'});
  collectionIndex = collectionsData.collections.length - 1; collectionTab = 'setup'; discoveryOpen = false; collectionSearch = collectionFilter = '';
  collectionDirty(); drawCollections(); $('#collection-name')?.focus(); $('#collection-name')?.select();
}
async function loadCollections() {
  try {
    collectionsData = await api('/api/collections'); collectionsDirty = false;
    collectionIndex = collectionsData.collections.length ? Math.max(0, Math.min(collectionIndex, collectionsData.collections.length - 1)) : -1;
    drawCollections();
  } catch (e) { $('#collections').replaceChildren(h('div', {class: 'collection-empty'}, h('h2', {}, 'Collections could not load'), h('p', {class: 'dim'}, e.message), h('button', {onclick: loadCollections}, 'Try again'))); }
}
function collectionDiscovery() {
  const d = collectionDiscoverState;
  const panel = h('section', {class: 'collection-discovery', 'aria-label': 'Discover collections'});
  const results = h('div', {class: 'discovery-results'}), preview = h('div', {class: 'discovery-preview'});
  const status = h('p', {role: 'status', class: 'discovery-status', hidden: true});
  let busy = false;
  const provider = h('select', {'aria-label': 'Collection provider', onchange: () => {
    d.provider = provider.value; d.results = null; d.preview = null; preview.replaceChildren();
    helper.textContent = providerHelp(); if (d.mode === 'recommendations' || d.mode === 'browse' && !d.query) find();
  }}, h('option', {value: 'all', selected: d.provider === 'all'}, 'All providers'), Object.entries(collectionProviderNames).map(([key, name]) => h('option', {value: key, selected: d.provider === key}, name)));
  const query = h('input', {type: 'search', value: d.query, placeholder: d.mode === 'universes' ? 'Search universes' : 'Search collections', 'aria-label': 'Search collections', oninput: e => d.query = e.target.value});
  const url = h('input', {type: 'url', value: d.url, required: true, placeholder: 'https://…', 'aria-label': 'Public collection URL', oninput: e => { d.url = e.target.value; d.universe = null; d.preview = null; preview.replaceChildren(); }});
  const kind = h('select', {'aria-label': 'Media type', onchange: e => { d.type = e.target.value; d.preview = null; preview.replaceChildren(); if (d.mode === 'universes') find(); }}, h('option', {value: 'movie', selected: d.type === 'movie'}, 'Movies'), h('option', {value: 'tv', selected: d.type === 'tv'}, 'TV shows'));
  const limit = h('input', {type: 'number', value: d.limit, min: 1, max: 250, required: true, 'aria-label': 'Maximum imported titles', oninput: e => { d.limit = Number(e.target.value); d.preview = null; preview.replaceChildren(); }});
  function providerHelp() {
    if (d.mode === 'universes') return 'Choose a universe and preview its titles. Movies and TV shows go into separate Plex collections. Membership follows the source list.';
    if (d.mode === 'recommendations') return 'A few good places to start. Choose a collection to see its titles before importing.';
    return {all: 'Choose a provider to search its public collections.', tmdb: 'Search movie franchises. Requires your TMDb API key.', trakt: 'Search public lists, or leave search blank for popular lists. Requires a Trakt client ID.', mdblist: 'Search public lists, or leave search blank for popular lists. Requires an MDBList API key.', letterboxd: 'Browse this week’s popular lists. Search filters these results.', imdb: 'Browse recommended IMDb charts. For a specific list, use Import URL.', flixpatrol: 'Browse recommended platform charts. For a specific country or date, use Import URL.'}[d.provider];
  }
  const helper = h('p', {class: 'collection-help'}, providerHelp());
  const message = (text, error = false) => { status.hidden = !text; status.textContent = text; status.classList.toggle('error', error); };
  const execute = async (body, success) => {
    if (busy) return;
    busy = true; panel.setAttribute('aria-busy', 'true'); message('Loading collections…');
    const controls = [...panel.querySelectorAll('button,input,select')].map(e => [e, e.disabled]); controls.forEach(([e]) => e.disabled = true);
    try {
      const response = await api('/api/collections/discover', body);
      if (panel.isConnected) { message(''); success(response); }
    } catch (e) { if (panel.isConnected) message(e.message, true); }
    finally { busy = false; panel.setAttribute('aria-busy', 'false'); controls.forEach(([e, disabled]) => e.disabled = disabled); }
  };
  function showResults(response) {
    results.hidden = false; preview.replaceChildren();
    results.replaceChildren(...response.results.map(row => h('article', {class: 'discovery-card'},
      h('div', {class: 'discovery-card-meta'}, collectionBadge(collectionProviderNames[row.provider], row.provider), h('small', {class: 'dim'}, row.type === 'tv' ? 'TV shows' : 'Movies')),
      h('h3', {}, row.name), h('p', {class: 'dim'}, row.description || 'Public collection'),
      h('button', {onclick: () => {
        if (!row.url) { d.provider = row.provider; d.mode = 'browse'; d.query = ''; d.results = null; d.preview = null; drawCollections(); return; }
        d.url = row.url; d.type = row.type; d.universe = row.key || null; if (d.universe) d.limit = 250; url.value = row.url; kind.value = row.type; limit.value = d.limit; fetchPreview();
      }}, row.url ? 'Preview titles' : 'Browse lists'))));
    if (!response.results.length) results.append(h('div', {class: 'collection-empty'}, icon(COLLECTION_SEARCH, 28), h('h3', {}, 'No collections found'), h('p', {class: 'dim'}, 'Try another search, or import a list by URL.')));
  }
  function find() {
    if (d.mode === 'browse' && d.provider === 'all') { message('Choose a provider first.'); provider.focus(); return; }
    d.preview = null;
    execute({mode: d.mode, provider: d.provider, query: d.query, type: d.type}, response => { d.results = response; showResults(response); });
  }
  function showPreview(response) {
    results.hidden = true;
    const name = h('input', {value: response.name, required: true, 'aria-label': 'Collection name'});
    const library = h('input', {value: String(collectionsData.libraries[0] || ''), list: 'discovery-libraries', required: true, placeholder: 'Choose a Plex library', 'aria-label': 'Target Plex library'});
    const refresh = h('input', {type: 'checkbox', checked: true});
    const form = h('form', {class: 'discovery-import', onsubmit: e => {
      e.preventDefault(); const title = name.value.trim(), target = library.value.trim();
      if (!title || !target) { message('Enter a name and Plex library.', true); return; }
      const key = text => text.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/collection$/, '');
      if (collectionsData.collections.some(entry => entry.library === target && (key(entry.name) === key(title) || entry.source?.url === response.url))) {
        message('This name or source is already in that library. Edit the existing collection.', true); return;
      }
      collectionsData.collections.push({name: title, library: target, type: response.type, enabled: false, sync: 'append', members: response.items.map(row => row.member), source: {url: response.url, limit: response.limit, refresh: refresh.checked}, acquire: false, cleanup: 'keep'});
      collectionIndex = collectionsData.collections.length - 1; collectionTab = 'setup'; collectionSearch = collectionFilter = ''; discoveryOpen = false; d.preview = null;
      collectionDirty(); drawCollections(); toast('Collection added. Review its settings, enable it, then save.');
    }}, h('h3', {}, 'Add to your collections'), collectionInput('Collection name', name), collectionInput('Plex library', library), collectionLibraries('discovery-libraries'),
      h('label', {class: 'collection-toggle'}, refresh, h('span', {}, h('b', {}, 'Keep this list up to date'), h('small', {}, 'Refresh titles from the source on collection runs.'))),
      h('p', {class: 'collection-help'}, 'Starts disabled. Downloads and deletion stay off until you configure them.'), h('button', {class: 'primary', type: 'submit'}, 'Add collection'));
    preview.replaceChildren(h('button', {class: 'quiet discovery-back', onclick: () => { d.preview = null; preview.replaceChildren(); results.hidden = false; message(''); }}, '← Back to collections'),
      h('div', {class: 'discovery-preview-head'}, h('div', {}, collectionBadge(collectionProviderNames[response.provider], response.provider), h('h2', {}, response.name), h('p', {class: 'dim'}, `${response.items.length} ${response.type === 'movie' ? 'movies' : 'TV shows'} · first ${response.limit} titles requested`)), h('a', {href: response.url, target: '_blank', rel: 'noopener noreferrer'}, 'Open source ↗')),
      h('div', {class: 'discovery-preview-body'}, h('ol', {class: 'discovery-title-list'}, response.items.map(row => h('li', {}, h('span', {}, row.title), h('small', {class: 'dim'}, row.year || '')))), form));
  }
  function fetchPreview() {
    d.preview = null; preview.replaceChildren();
    execute({mode: 'preview', url: d.url, type: d.type, limit: d.limit, universe: d.universe}, response => { d.preview = response; showPreview(response); });
  }
  const modes = h('div', {class: 'collection-subnav', role: 'group', 'aria-label': 'Find collections'}, [['recommendations', 'Recommended'], ['universes', 'Universes'], ['browse', 'Search lists'], ['url', 'Import URL']].map(([mode, label]) => h('button', {class: d.mode === mode ? 'on' : '', 'aria-pressed': d.mode === mode, onclick: () => {
    d.mode = mode; d.results = d.preview = d.universe = null; d.query = ''; drawCollections();
  }}, label)));
  const searchForm = h('form', {class: 'discovery-search', onsubmit: e => { e.preventDefault(); find(); }}, d.mode === 'universes' ? kind : provider, h('div', {class: 'collection-searchbox'}, icon(COLLECTION_SEARCH), query), h('button', {type: 'submit'}, d.mode === 'browse' || d.mode === 'universes' ? 'Search' : 'Find recommendations'));
  const urlForm = d.mode === 'url' ? h('form', {class: 'discovery-url-form', onsubmit: e => { e.preventDefault(); fetchPreview(); }},
    collectionInput('Public list or collection URL', url), collectionInput('Media type', kind), collectionInput('Title limit', limit), h('button', {class: 'primary', type: 'submit'}, 'Preview titles')) : null;
  panel.append(h('div', {class: 'collection-section-heading'}, h('div', {}, h('h2', {}, 'Find your next collection'), h('p', {class: 'dim'}, 'Browse six sources or bring a list you already love.'))), modes,
    d.mode === 'url' ? urlForm : searchForm, d.mode === 'url' ? h('p', {class: 'collection-help'}, 'TMDb · IMDb · Trakt · Letterboxd · MDBList · FlixPatrol. Use a public HTTPS list URL.') : helper,
    status, preview, results,
    h('details', {class: 'collection-provider-help'}, h('summary', {}, 'Provider access & API keys'), h('p', {class: 'collection-help'}, 'TMDb needs TMDB_API_KEY, Trakt needs TRAKT_CLIENT_ID, and MDBList needs MDBLIST_API_KEY in your environment. Public IMDb, Letterboxd and FlixPatrol pages may block imports. Recommendations are editorial starting points.')));
  if (d.preview) showPreview(d.preview);
  else if (d.results) showResults(d.results);
  else if (d.mode === 'recommendations' || d.mode === 'universes' || d.mode === 'browse' && d.provider !== 'all') find();
  return panel;
}
function drawCollections() {
  const root = $('#collections'), data = collectionsData;
  if (!data) return;
  const entries = data.collections;
  const goManage = () => { discoveryOpen = false; drawCollections(); };
  const goDiscover = () => { discoveryOpen = true; drawCollections(); };
  const activeCount = entries.filter(e => e.enabled !== false).length;
  const header = h('div', {class: 'collections-heading'}, h('div', {}, h('p', {class: 'collection-eyebrow'}, 'YOUR LIBRARY, CURATED'), h('h1', {}, 'Collections'), h('p', {class: 'dim'}, `${entries.length} collections · ${activeCount} enabled · ${entries.filter(e => e.schedule).length} seasonal`)),
    h('div', {class: 'collection-header-actions'}, h('div', {class: 'seg', role: 'group', 'aria-label': 'Collections workspace'}, h('button', {class: !discoveryOpen ? 'on' : '', 'aria-pressed': !discoveryOpen, onclick: goManage}, icon(COLLECTION_STACK), 'Manage'), h('button', {class: discoveryOpen ? 'on' : '', 'aria-pressed': discoveryOpen, onclick: goDiscover}, icon(COLLECTION_COMPASS), 'Discover')), h('button', {onclick: newCollection}, icon(COLLECTION_ADD), 'New collection')));
  const list = h('div', {class: 'collection-list'});
  const search = h('input', {id: 'collection-find', type: 'search', value: collectionSearch, placeholder: 'Find a collection', 'aria-label': 'Find a saved collection', oninput: e => { collectionSearch = e.target.value; drawList(); }});
  const filter = h('select', {'aria-label': 'Filter collections', onchange: e => { collectionFilter = e.target.value; drawList(); }}, [['', 'All collections'], ['enabled', 'Enabled'], ['disabled', 'Disabled'], ['seasonal', 'Seasonal'], ['source', 'External sources']].map(([value, label]) => h('option', {value, selected: value === collectionFilter}, label)));
  function drawList() {
    const visible = entries.map((entry, index) => ({entry, index})).filter(({entry}) => `${entry.name} ${entry.library}`.toLowerCase().includes(collectionSearch.toLowerCase()) &&
      (!collectionFilter || collectionFilter === 'enabled' && entry.enabled !== false || collectionFilter === 'disabled' && entry.enabled === false || collectionFilter === 'seasonal' && entry.schedule || collectionFilter === 'source' && entry.source));
    list.replaceChildren(...visible.map(({entry, index}) => {
      const provider = collectionProvider(entry);
      return h('button', {class: 'collection-list-item' + (index === collectionIndex && !discoveryOpen ? ' on' : ''), 'aria-current': index === collectionIndex && !discoveryOpen ? 'true' : null, onclick: () => { collectionIndex = index; discoveryOpen = false; collectionTab = 'setup'; drawCollections(); }},
        h('span', {class: 'collection-list-title'}, h('b', {}, entry.name), h('span', {class: 'collection-status-dot' + (entry.enabled === false ? '' : ' enabled'), title: entry.enabled === false ? 'Disabled' : 'Enabled', 'aria-label': entry.enabled === false ? 'Disabled' : 'Enabled'})),
        h('small', {class: 'dim'}, `${entry.library} · ${entry.type === 'tv' ? 'TV' : 'Movies'}`), h('span', {class: 'collection-list-tags'}, entry.schedule && collectionBadge('Seasonal'), provider && collectionBadge(collectionProviderNames[provider]), !entry.schedule && !provider && collectionBadge('Custom')));
    }));
    if (!visible.length) list.append(h('p', {class: 'collection-list-empty dim'}, entries.length ? 'No matching collections.' : 'Your collections will appear here.'));
  }
  drawList();
  const sidebar = h('nav', {class: 'collection-sidebar', 'aria-label': 'Saved collections'}, h('div', {class: 'collection-sidebar-head'}, h('b', {}, 'Your collections'), h('span', {class: 'dim'}, String(entries.length))),
    h('div', {class: 'collection-searchbox'}, icon(COLLECTION_SEARCH), search), filter, list,
    h('div', {class: 'collection-sidebar-footer'}, h('button', {class: 'quiet', onclick: () => {
      const key = name => name.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/collection$/, '');
      const missing = data.defaults.filter(preset => !entries.some(entry => key(entry.name) === key(preset.name)));
      if (!missing.length) { toast('All seasonal defaults are already listed.'); return; }
      collectionIndex = entries.length; entries.push(...JSON.parse(JSON.stringify(missing))); discoveryOpen = false; collectionTab = 'setup'; collectionSearch = collectionFilter = '';
      collectionDirty(); drawCollections(); toast('Seasonal presets added, disabled. Choose the library and enable the ones you want.');
    }}, icon(COLLECTION_ADD), 'Add seasonal presets'), h('button', {class: 'quiet', onclick: () => { if (!collectionsDirty || confirm('Discard unsaved collection edits and reload?')) loadCollections(); }}, 'Reload saved collections')));
  const editor = h('section', {class: 'collection-editor', 'aria-label': 'Collection editor'});
  const entry = entries[collectionIndex];
  function field(label, value, change, options, props = {}, hint = '') {
    const input = options ? h('select', {...props, onchange: e => { change(e.target.value); collectionDirty(); }}, options.map(([v, text]) => h('option', {value: v, selected: v === String(value)}, text)))
      : h('input', {...props, value: value ?? '', oninput: e => { change(e.target.value); collectionDirty(); }});
    return collectionInput(label, input, hint);
  }
  function check(label, description, value, change) {
    return h('label', {class: 'collection-toggle'}, h('input', {type: 'checkbox', checked: value, onchange: e => { change(e.target.checked); collectionDirty(); }}), h('span', {}, h('b', {}, label), description && h('small', {}, description)));
  }
  if (entry) {
    const heading = h('h2', {id: 'collection-editor-name'}, entry.name);
    const provider = collectionProvider(entry);
    const enabled = h('input', {type: 'checkbox', checked: entry.enabled !== false, onchange: e => { entry.enabled = e.target.checked; collectionDirty(); drawList(); enabledLabel.textContent = e.target.checked ? 'Enabled' : 'Disabled'; }});
    const enabledLabel = h('span', {}, entry.enabled !== false ? 'Enabled' : 'Disabled');
    editor.append(h('div', {class: 'collection-editor-heading'}, h('div', {}, h('div', {class: 'collection-editor-badges'}, collectionBadge(entry.type === 'tv' ? 'TV shows' : 'Movies'), entry.schedule && collectionBadge('Seasonal'), provider && collectionBadge(collectionProviderNames[provider], provider)), heading), h('label', {class: 'collection-enabled'}, enabled, enabledLabel)),
      h('div', {class: 'collection-subnav', role: 'group', 'aria-label': 'Collection settings'}, [['setup', 'Setup'], ['members', 'Members'], ['automation', 'Automation']].map(([tab, label]) => h('button', {class: collectionTab === tab ? 'on' : '', 'aria-pressed': collectionTab === tab, onclick: () => { collectionTab = tab; drawCollections(); }}, label))),
      h('div', {class: 'collection-editor-body', id: 'collection-editor-body'}));
    const body = editor.querySelector('.collection-editor-body');
    if (collectionTab === 'setup') {
      body.append(h('div', {class: 'collection-section-heading'}, h('h3', {}, 'The basics'), h('p', {class: 'dim'}, 'Give it a name and choose where it belongs.')),
        field('Collection name', entry.name, value => { entry.name = value; heading.textContent = value || 'Untitled collection'; drawList(); }, null, {id: 'collection-name'}),
        h('div', {class: 'collection-fields'}, field('Plex library', entry.library, value => { entry.library = value; drawList(); }, null, {list: 'collection-libraries', placeholder: 'Choose a Plex library'}, 'Use the exact library name.'), field('Media type', entry.type, value => entry.type = value, [['movie', 'Movies'], ['tv', 'TV shows']])), collectionLibraries('collection-libraries'),
        field('Membership updates', entry.sync || 'append', value => entry.sync = value, [['append', 'Only add new members'], ['sync', 'Add and remove to match']], {}, 'Choose “Add and remove” to keep membership in sync with your picks or source.'),
        h('div', {class: 'collection-setup-summary'}, h('div', {}, h('b', {}, 'Members'), h('span', {class: 'dim'}, `${(entry.members || []).length} saved picks${entry.rules && Object.keys(entry.rules).length ? ' + Plex rules' : ''}`)), h('button', {onclick: () => { collectionTab = 'members'; drawCollections(); }}, 'Edit members →')),
        h('div', {class: 'collection-setup-summary'}, h('div', {}, h('b', {}, 'Automation'), h('span', {class: 'dim'}, entry.schedule ? `Seasonal · ${entry.schedule}` : 'All year', entry.acquire ? ' · Radarr acquisition on' : ' · Downloads off')), h('button', {onclick: () => { collectionTab = 'automation'; drawCollections(); }}, 'Configure →')),
        entry.enabled === false && h('p', {class: 'collection-callout'}, 'This collection is disabled. Enable it when you’re ready, then save and preview the plan.'),
        h('details', {class: 'collection-more'}, h('summary', {}, 'More actions'), h('p', {class: 'collection-help'}, 'Remove this definition from Overlayrr. Its Plex collection and media will remain.'), h('button', {class: 'collection-danger', onclick: () => {
          const index = collectionIndex;
          entries.splice(index, 1); collectionIndex = entries.length ? Math.min(index, entries.length - 1) : -1; collectionDirty(); drawCollections();
          toast('Definition removed. Save to keep this change.', false, ['Undo', () => { collectionsData.collections.splice(index, 0, entry); collectionIndex = index; collectionDirty(); drawCollections(); }]);
        }}, 'Remove definition')));
    } else if (collectionTab === 'members') {
      const rules = entry.rules || {};
      const setRule = (key, value) => { entry.rules = {...(entry.rules || {})}; if (value === '' || value == null || Array.isArray(value) && !value.length) delete entry.rules[key]; else entry.rules[key] = value; };
      const refreshed = () => !!entry.source && entry.source.refresh !== false;
      const memberText = collectionDrafts.get(entry) ?? (entry.members || []).map(m => m.tmdb_id ? `tmdb:${m.tmdb_id}` : m.rating_key ? `plex:${m.rating_key}` : m.imdb_id ? `imdb:${m.imdb_id}` : m.title + (m.year ? ` | ${m.year}` : '')).join('\n');
      const count = h('span', {class: 'dim'}, `${(entry.members || []).length} saved picks`);
      const members = h('textarea', {rows: 10, disabled: refreshed(), 'aria-label': 'Collection members', placeholder: 'tmdb:948\nAlien | 1979', oninput: e => {
        collectionDrafts.set(entry, e.target.value);
        entry.members = e.target.value.split('\n').map(s => s.trim()).filter(Boolean).map(line => {
          if (/^imdb:tt\d+$/i.test(line)) return {imdb_id: line.slice(5).toLowerCase()};
          let match = line.match(/^(tmdb|plex):(\d+)$/i);
          if (match) return match[1].toLowerCase() === 'tmdb' ? {tmdb_id: Number(match[2])} : {rating_key: match[2]};
          match = line.match(/^(.*?)\s*\|\s*(\d{4})$/);
          return match ? {title: match[1].trim(), year: Number(match[2])} : {title: line};
        }); count.textContent = `${entry.members.length} saved picks`; collectionDirty();
      }}, memberText);
      const snapshotHint = h('p', {class: 'collection-help'}, refreshed() ? 'Source refresh is on. Turn it off above to edit the saved snapshot.' : 'One title or ID per line. Titles must match Plex exactly.');
      if (entry.source) body.append(h('div', {class: 'collection-source-card'}, h('div', {class: 'collection-section-heading'}, h('h3', {}, 'External source'), h('a', {href: entry.source.url, target: '_blank', rel: 'noopener noreferrer'}, 'Open source ↗')),
        h('p', {class: 'collection-source-url'}, entry.source.url), check('Refresh from source', 'Use the latest list on each collection run.', entry.source.refresh !== false, value => { entry.source.refresh = value; members.disabled = value; snapshotHint.textContent = value ? 'Source refresh is on. Turn it off above to edit the saved snapshot.' : 'One title or ID per line. Titles must match Plex exactly.'; }),
        field('Maximum titles', entry.source.limit ?? 50, value => entry.source.limit = Number(value), null, {type: 'number', min: 1, max: 250})));
      body.append(h('div', {class: 'collection-section-heading'}, h('h3', {}, entry.source ? 'Saved member snapshot' : 'Your picks'), count), snapshotHint, members,
        h('details', {class: 'collection-provider-help'}, h('summary', {}, 'How to enter titles'), h('p', {class: 'collection-help'}, 'Use tmdb:948, imdb:tt0077651, plex:12345, or Halloween | 1978. The year is optional. Radarr acquisition uses TMDb movie IDs.')),
        h('details', {class: 'collection-rules', open: Object.keys(rules).length > 0}, h('summary', {}, 'Add automatic Plex rules'), h('p', {class: 'collection-help'}, 'Rule matches are added to your picks. All filled rules must match; any listed genre qualifies.'),
          h('div', {class: 'collection-fields'}, field('Genres', (rules.genres || []).join(', '), value => setRule('genres', value.split(',').map(s => s.trim()).filter(Boolean)), null, {placeholder: 'Horror, Thriller'}), field('Title contains', rules.title_contains, value => setRule('title_contains', value), null, {placeholder: 'Optional'}),
            field('Year from', rules.year_from, value => setRule('year_from', value === '' ? null : Number(value)), null, {type: 'number', min: 1, max: 9999}), field('Year through', rules.year_to, value => setRule('year_to', value === '' ? null : Number(value)), null, {type: 'number', min: 1, max: 9999}))));
    } else {
      const cleanupNote = h('p', {class: 'collection-callout', hidden: entry.cleanup !== 'remove-delete'}, 'Only movies Overlayrr added are eligible. Pre-existing movies and movies needed by another active collection are protected.');
      body.append(h('div', {class: 'collection-section-heading'}, h('h3', {}, 'Seasonal schedule'), h('p', {class: 'dim'}, 'Leave the window blank to run all year.')),
        field('Yearly window', entry.schedule, value => { if (value) entry.schedule = value; else delete entry.schedule; drawList(); }, null, {placeholder: '10/01-10/31'}, 'MM/DD-MM/DD · inclusive · uses your server’s local date'),
        h('div', {class: 'collection-source-card'}, h('div', {class: 'collection-section-heading'}, h('h3', {}, 'Movie downloads'), collectionBadge(data.radarr ? 'Radarr configured' : 'Radarr not configured', data.radarr ? 'enabled' : '')),
          entry.type === 'tv' ? h('p', {class: 'collection-help'}, 'TV collections match existing Plex shows. Radarr acquisition is available for movie collections.') : [
            check('Acquire missing movies', 'Add missing TMDb movie members to Radarr. They appear here after Plex scans them.', !!entry.acquire, value => entry.acquire = value),
            !data.radarr && h('details', {class: 'collection-provider-help'}, h('summary', {}, 'Configure Radarr'), h('p', {class: 'collection-help'}, 'Set radarr.url, api_key, root_folder and quality_profile_id in YAML. Store the key in RADARR_API_KEY.')),
            field('When the season ends', entry.cleanup || 'keep', value => { entry.cleanup = value; cleanupNote.hidden = value !== 'remove-delete'; }, [['keep', 'Keep acquired movies'], ['remove-delete', 'Remove acquired movies and delete files']], {}, 'Deletion requires a seasonal window and acquisition enabled.'),
            cleanupNote]),
        h('details', {class: 'collection-rules', open: Object.keys(entry.visibility || {}).length > 0}, h('summary', {}, 'Plex visibility'), h('p', {class: 'collection-help'}, 'Managed visibility is switched off outside the season. Your existing Plex settings stay in place when left unchanged.'),
          ...[['home', 'Your Home'], ['shared', 'Shared users’ Home'], ['recommended', 'Library Recommended']].map(([key, label]) => field(label, key in (entry.visibility || {}) ? String(entry.visibility[key]) : '', value => { entry.visibility = {...(entry.visibility || {})}; if (value === '') delete entry.visibility[key]; else entry.visibility[key] = value === 'true'; }, [['', 'Keep unchanged'], ['true', 'Show in season'], ['false', 'Hide']]))),
        h('p', {class: 'collection-help'}, 'Manage recurring collection checks in Events. Your poster scrub also updates collections when collection sync is enabled in your config.'));
    }
  } else editor.append(h('div', {class: 'collection-empty'}, icon(COLLECTION_STACK, 36), h('h2', {}, 'Make room for your favorites'), h('p', {class: 'dim'}, 'Create your own collection, discover a public list, or add the seasonal presets.'), h('div', {class: 'row'}, h('button', {class: 'primary', onclick: newCollection}, 'Create a collection'), h('button', {onclick: goDiscover}, 'Explore Discover'))));
  const save = h('button', {id: 'collection-save', class: 'primary', onclick: async () => {
    collectionSaving = true; syncCollectionActions(); root.inert = true;
    try { collectionsData = await api('/api/collections/save', {collections: entries, version: data.version}); collectionsDirty = false; drawCollections(); toast('Saved. Preview the plan to review Plex and Radarr changes.'); }
    catch (e) { fail(e); }
    finally { collectionSaving = false; root.inert = false; syncCollectionActions(); }
  }}, 'Save changes');
  const runCollection = async body => { await run('/api/collections/run', body); syncCollectionActions(); };
  const when = h('input', {type: 'date', value: collectionDate, 'aria-label': 'Simulated date for preview', oninput: e => { collectionDate = e.target.value; e.target.closest('details').querySelector('summary').textContent = collectionDate || 'Preview date'; }});
  const actionbar = h('div', {class: 'collection-actionbar'}, h('div', {class: 'collection-save-group'}, h('span', {id: 'collection-save-state', role: 'status'}, ''), save),
    h('div', {class: 'collection-run-group'}, h('details', {class: 'collection-date'}, h('summary', {}, collectionDate || 'Preview date'), h('label', {}, 'Simulate a date ', when), h('small', {class: 'dim'}, 'Apply always uses today.')),
      h('button', {id: 'collection-plan', title: 'Review proposed changes in the Console', onclick: () => runCollection({mode: 'plan', date: collectionDate, version: data.version})}, 'Preview plan'), h('button', {id: 'collection-apply', title: data.upload ? 'Apply saved definitions to Plex and Radarr' : 'Enable plex.upload in your config to apply changes', onclick: () => {
        if (entries.some(e => e.enabled !== false && e.cleanup === 'remove-delete') && !confirm('Apply collections now? Out-of-season movies added by Overlayrr may be removed from Radarr and their files deleted. Review the Console plan first.')) return;
        runCollection({mode: 'apply', version: data.version});
      }}, 'Apply now'), h('button', {class: 'quiet', onclick: () => showLog(true)}, 'Console ↗')));
  root.replaceChildren(header, h('div', {class: 'collection-layout'}, sidebar, discoveryOpen ? collectionDiscovery() : editor),
    !data.upload && h('p', {class: 'collection-upload-note'}, 'Plex upload is off. You can save and preview; enable plex.upload in your config to apply.'), actionbar);
  syncCollectionActions();
}

let eventsData = null, eventsDirty = false, eventsSaving = false;
async function loadEvents() {
  try { eventsData = await api('/api/events'); eventsDirty = false; drawEvents(); }
  catch (e) { $('#events').replaceChildren(h('p', {class: 'dim'}, 'Could not load events.'), h('button', {onclick: loadEvents}, 'Try again')); fail(e); }
}
function syncEventsActions() {
  const save = $('#events-save');
  if (save) { save.disabled = eventsSaving || !eventsDirty || !eventsData.available; save.textContent = eventsSaving ? 'Saving…' : 'Save schedules'; }
  const status = $('#events-save-state');
  if (status) status.textContent = eventsSaving ? 'Saving schedules…' : eventsDirty ? 'Unsaved schedule changes' : 'Schedules saved';
  $('#views [data-view=events]').classList.toggle('dirty', eventsDirty);
  document.querySelectorAll('[data-event-run]').forEach(button => { button.disabled = state.running || eventsSaving || (!eventsData.upload && button.dataset.eventRun !== 'scrub' && !button.dataset.plan); });
}
function eventChangesDelete(entries = eventsData.events) {
  return eventsData.collections.some(c => c.enabled && c.cleanup === 'remove-delete') && entries.some(e => e.enabled && (e.id !== 'scrub' || eventsData.sync_collections));
}
async function saveEvents() {
  if (eventChangesDelete() && !confirm('Save these schedules? Scheduled collection updates can remove out-of-season movies acquired by Overlayrr and delete their files, following your collection settings.')) return;
  eventsSaving = true; syncEventsActions();
  try {
    eventsData = await api('/api/events/save', {version: eventsData.version, events: eventsData.events.map(({id, enabled, frequency, time, weekday}) => ({id, enabled, frequency, time, weekday}))});
    eventsDirty = false; drawEvents(); toast('Schedules saved. Your server will run them automatically.');
  } catch (e) { fail(e); }
  finally { eventsSaving = false; syncEventsActions(); }
}
function runEvent(id, plan = false) {
  if (!plan && eventChangesDelete([{id, enabled: true}]) && !confirm('Run this event now? Out-of-season movies acquired by Overlayrr may be removed and their files deleted. Preview the plan first.')) return;
  run('/api/events/run', {id, plan});
}
function drawEvents() {
  if (!eventsData) return;
  const data = eventsData, changed = () => { eventsDirty = true; syncEventsActions(); };
  const label = (text, input) => h('label', {class: 'event-field'}, h('span', {}, text), input);
  const covered = data.events.some(e => e.enabled && (e.id !== 'scrub' || data.sync_collections));
  const descriptions = {
    scrub: 'Refreshes posters and episode status when they change.' + (data.sync_collections ? ' Your config also includes all collection updates in this job.' : ' Collection updates are off for full poster runs.'),
    seasonal: 'Refreshes custom and seasonal collections, seasonal visibility, source lists, Radarr acquisition and configured cleanup.',
    collections: 'Updates franchise, streaming, recent, custom and seasonal collections, including configured Radarr acquisition and cleanup.'
  };
  const cards = data.events.map(entry => {
    const id = entry.id, enabled = h('input', {type: 'checkbox', checked: entry.enabled, disabled: !data.available, 'data-k': 'event-' + id,
      onchange: e => { entry.enabled = e.target.checked; changed(); keepFocus(drawEvents); }});
    const frequencies = [['daily', 'Daily'], ['hourly', 'Every hour'], ['weekly', 'Weekly'], ...(entry.frequency === 'custom' ? [['custom', 'Existing custom schedule']] : [])];
    const frequency = h('select', {disabled: !data.available, 'aria-label': entry.name + ' frequency', onchange: e => { entry.frequency = e.target.value; changed(); drawEvents(); }},
      frequencies.map(([value, name]) => h('option', {value, selected: entry.frequency === value}, name)));
    const clock = h('input', {type: 'time', value: entry.time, disabled: !data.available, 'aria-label': entry.name + ' time', onchange: e => { entry.time = e.target.value; changed(); }});
    const minute = h('input', {type: 'number', min: 0, max: 59, value: Number(entry.time.slice(3)), disabled: !data.available, 'aria-label': entry.name + ' minute', onchange: e => {
      const value = Number(e.target.value); if (!Number.isInteger(value) || value < 0 || value > 59) return;
      entry.time = '00:' + String(value).padStart(2, '0'); changed();
    }});
    const weekday = h('select', {disabled: !data.available, 'aria-label': entry.name + ' weekday', onchange: e => { entry.weekday = e.target.value; changed(); }},
      ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((name, n) => h('option', {value: String(n), selected: String(n) === entry.weekday}, name)));
    const controls = h('div', {class: 'event-schedule'}, label('Frequency', frequency),
      entry.frequency === 'custom' ? h('p', {class: 'dim'}, 'Existing schedule: ', h('code', {}, entry.schedule)) : label(entry.frequency === 'hourly' ? 'Minute past the hour' : 'Time', entry.frequency === 'hourly' ? minute : clock),
      entry.frequency === 'weekly' && label('Day', weekday));
    return h('article', {class: 'event-card'}, h('div', {class: 'event-card-heading'}, h('h2', {}, entry.name), h('label', {class: 'event-enabled'}, enabled, entry.enabled ? 'Scheduled' : 'Paused')),
      h('p', {class: 'dim'}, descriptions[id]), controls, h('small', {class: 'dim'}, 'Schedule time zone: ' + entry.timezone),
      h('div', {class: 'event-result'}, h('small', {class: 'dim'}, 'Latest log summary'), h('p', {}, entry.last_result || 'No saved summary yet. Jobs started here appear in Console.'), h('small', {class: 'dim'}, 'Scheduled runs log to ' + entry.log)),
      h('div', {class: 'row'}, id !== 'scrub' && h('button', {'data-event-run': id, 'data-plan': '1', onclick: () => runEvent(id, true)}, 'Preview plan'),
        h('button', {'data-event-run': id, onclick: () => runEvent(id)}, 'Run now')));
  });
  const rows = data.collections.map(c => h('tr', {}, h('td', {}, h('b', {}, c.name), h('small', {class: 'dim'}, c.library)), h('td', {}, c.schedule),
    h('td', {}, !c.enabled ? 'Disabled' : c.active ? 'In season' : 'Out of season'), h('td', {}, c.acquire ? data.radarr ? 'Radarr enabled' : 'Needs Radarr setup' : 'Off'),
    h('td', {}, c.cleanup === 'remove-delete' ? 'Remove owned movies and files' : 'Keep movies')));
  $('#events').replaceChildren(h('div', {class: 'collections-heading'}, h('div', {}, h('p', {class: 'collection-eyebrow'}, 'YOUR SERVER, ON SCHEDULE'), h('h1', {}, 'Events'),
    h('p', {class: 'dim'}, 'Manage the scheduled jobs for ' + data.user + '. Server clock: ' + data.server_time)), h('button', {onclick: () => { if (!eventsDirty || confirm('Discard unsaved schedule edits and reload?')) loadEvents(); }}, 'Reload schedules')),
    !data.available && h('p', {class: 'event-notice', role: 'status'}, data.error),
    h('p', {class: 'event-notice'}, covered ? 'Collection checks are included in your scheduled jobs. Each run uses the saved collection settings below.' : 'No collection update job was found in this server user’s schedules. Enable a collection event or include collection sync in the poster scrub.'),
    h('div', {class: 'event-grid'}, cards),
    h('section', {class: 'event-collections'}, h('div', {class: 'collection-section-heading'}, h('h2', {}, 'Collection activity'), h('button', {onclick: () => setView('collections')}, 'Manage collections →')),
      h('p', {class: 'dim'}, 'Seasonal windows use the server’s date. Out-of-season collections are retained with managed visibility turned off. Downloads and removal follow each collection’s saved settings.'),
      rows.length ? h('div', {class: 'event-table-wrap'}, h('table', {}, h('thead', {}, h('tr', {}, ['Collection', 'Window', 'Today', 'Downloads', 'After season'].map(name => h('th', {}, name)))), h('tbody', {}, rows))) : h('p', {class: 'dim'}, 'No custom collections configured.')),
    h('div', {class: 'collection-actionbar'}, h('span', {id: 'events-save-state', role: 'status', class: 'dim'}, ''), h('button', {id: 'events-save', class: 'primary', onclick: saveEvents}, 'Save schedules')));
  syncEventsActions();
}

function setView(name) {
  document.body.dataset.view = name;
  $('#browse').hidden = name !== 'titles'; $('#tpl').hidden = name !== 'template'; $('#collections').hidden = name !== 'collections'; $('#events').hidden = name !== 'events';
  document.querySelectorAll('#views button').forEach(b => { b.classList.toggle('on', b.dataset.view === name); b.setAttribute('aria-selected', String(b.dataset.view === name)); });
  history.replaceState(null, '', name !== 'titles' ? '#' + name : location.pathname + location.search);
  if (name === 'collections') { if (collectionsData) drawCollections(); else loadCollections(); }
  if (name === 'events') { if (eventsData && eventsDirty) drawEvents(); else loadEvents(); }
  if (name !== 'template') return;
  if (tpl) tplPreview(); else tplLoad();
}
document.querySelectorAll('#views button').forEach(b => b.onclick = () => setView(b.dataset.view));
new ResizeObserver(() => document.documentElement.style.setProperty('--head', $('header').offsetHeight + 'px')).observe($('header'));
addEventListener('beforeunload', e => { if (tplUnsaved() || collectionsDirty || eventsDirty) e.preventDefault(); });

let queryTimer;  // Typing waits a moment, so each keystroke doesn't rebuild the grid
$('#q').oninput = e => { clearTimeout(queryTimer); queryTimer = setTimeout(() => { query = e.target.value; shown = 120; draw(); }, 120); };
$('#clearq').onclick = () => { $('#q').value = ''; query = ''; shown = 120; draw(); $('#q').focus(); };
$('#push').onclick = () => push();
$('#logbtn').onclick = () => showLog($('#log').hidden);
$('#logx').onclick = () => showLog(false);
$('#veil').onclick = close;
$('#out').onclick = async () => { await api('/logout', {}).catch(() => 0); location.reload(); };
$('#lb').onclick = e => { if (e.target === $('#lb')) closeLb(); };
$('#hint').hidden = saved.get('overlayrr-hint') === 'seen';
$('#hintx').onclick = () => { $('#hint').hidden = true; saved.set('overlayrr-hint', 'seen'); };
if (saved.get('overlayrr-check')) document.body.dataset.check = saved.get('overlayrr-check');
const dz = $('#drawer');
dz.addEventListener('dragover', e => { if (view) { e.preventDefault(); dz.classList.add('dragging'); } });
dz.addEventListener('dragleave', e => { if (!dz.contains(e.relatedTarget)) dz.classList.remove('dragging'); });
dz.addEventListener('drop', dropped);
// Paste an image (or an image link) while a title is open to add it
document.addEventListener('paste', e => {
  if (!view || crop || lb) return;
  const files = [...e.clipboardData.files], text = e.clipboardData.getData('text').trim();
  if (files.length) { e.preventDefault(); closeAdd(); upload(files); }
  else if (/^https?:\/\/\S+$/.test(text) && !/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) { e.preventDefault(); fromLink(text); }
});
document.onkeydown = e => {
  if (e.key === 'Escape') { if (crop) closeCrop(); else if (lb) closeLb(); else if (!$('#addbox').hidden) closeAdd(); else if (open) close(); else if (!$('#log').hidden) showLog(false); }
  else if (lb && e.key === 'ArrowLeft') step(-1);
  else if (lb && e.key === 'ArrowRight') step(1);
  else if (e.key === '/' && !open && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {  // The search box of whichever view is showing
    const box = document.body.dataset.view === 'template' ? $('#tplfind') : document.body.dataset.view === 'collections' ? $('#collection-find') : $('#q');
    if (box) { e.preventDefault(); box.focus(); }
  }
};
const ready = refresh();
setView(['#template', '#collections', '#events'].includes(location.hash) ? location.hash.slice(1) : 'titles');
ready.then(tick).then(j => { if (j.running) poll(); }).catch(fail);
