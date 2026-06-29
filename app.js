const $ = s => { try { return document.querySelector(s); } catch { return null; } };
const $$ = s => { try { return [...document.querySelectorAll(s)]; } catch { return []; } };
const fmt = n => (n||0).toLocaleString('uz-UZ');
const esc = s => String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const Store = {
  KEY: 'kryzen_bookfinder_v1',
  data: null,
  def() { return { theme: 'dark', favorites: [], recent: [], searchHistory: [], stats: { searches: 0, booksViewed: 0, downloads: 0 } }; },
  load() { try { this.data = { ...this.def(), ...JSON.parse(localStorage.getItem(this.KEY) || '{}') }; } catch { this.data = this.def(); } return this.data; },
  save() { try { localStorage.setItem(this.KEY, JSON.stringify(this.data)); } catch {} }
};

const API = {
  cache: new Map(),
  async openlibrary(query, opts = {}) {
    const { page = 1, limit = 20, sort = '' } = opts;
    let url;
    if (query.kind === 'random') url = 'https://openlibrary.org/search.json?q=*&sort=random&limit=' + limit + '&page=' + page;
    else if (query.q) url = 'https://openlibrary.org/search.json?q=' + encodeURIComponent(query.q) + '&limit=' + limit + '&page=' + page + (sort ? '&sort=' + sort : '');
    else return [];
    const res = await fetch(url);
    if (!res.ok) throw new Error('OL fail');
    const data = await res.json();
    return (data.docs || []).map(b => ({
      id: b.key || ('ol-' + (b.cover_i || Math.random())),
      title: b.title || 'Nomsiz',
      author: (b.author_name || [])[0] || 'Noma'lum',
      year: b.first_publish_year || null,
      cover: b.cover_i ? 'https://covers.openlibrary.org/b/id/' + b.cover_i + '-M.jpg' : null,
      isbn: (b.isbn || [])[0] || null,
      publisher: (b.publisher || [])[0] || null,
      language: (b.language || [])[0] || null,
      pages: b.number_of_pages_median || null,
      rating: b.ratings_average || null,
      subject: (b.subject || []).slice(0, 5),
      free: !!(b.ia && b.ia.length),
      source: 'openlibrary'
    }));
  },
  async gutendex(query, opts = {}) {
    let url = 'https://gutendex.com/books/?page=' + (opts.page || 1);
    if (query.q) url += '&search=' + encodeURIComponent(query.q);
    const res = await fetch(url);
    if (!res.ok) throw new Error('GX fail');
    const data = await res.json();
    return (data.results || []).map(b => ({
      id: 'gut-' + b.id,
      title: b.title || 'Untitled',
      author: (b.authors || [])[0]?.name || 'Unknown',
      cover: (b.formats && (b.formats['image/jpeg'] || b.formats['image/png'])) || null,
      free: true,
      formats: Object.entries(b.formats || {}).filter(([k]) => /epub|pdf|txt|html/.test(k) && !/image/.test(k)).map(([k, v]) => ({ type: k.split('/')[1], url: v })),
      source: 'gutendex'
    }));
  },
  async googlebooks(query, opts = {}) {
    const limit = opts.limit || 20;
    const url = 'https://www.googleapis.com/books/v1/volumes?q=' + encodeURIComponent(query.q || '*') + '&maxResults=' + limit + '&startIndex=' + ((opts.page - 1 || 0) * limit);
    const res = await fetch(url);
    if (!res.ok) throw new Error('GB fail');
    const data = await res.json();
    return (data.items || []).map(b => {
      const v = b.volumeInfo || {};
      return {
        id: 'gb-' + b.id,
        title: v.title || 'Untitled',
        author: (v.authors || [])[0] || 'Unknown',
        year: v.publishedDate ? +v.publishedDate.slice(0, 4) : null,
        cover: (v.imageLinks && (v.imageLinks.thumbnail || v.imageLinks.smallThumbnail)) || null,
        description: v.description || '',
        previewLink: v.previewLink || null,
        infoLink: v.infoLink || null,
        free: v.accessInfo?.publicDomain || v.accessInfo?.embeddable,
        subject: v.categories || [],
        source: 'googlebooks'
      };
    });
  },
  async search(q, opts = {}) {
    const key = JSON.stringify({ q, ...opts });
    if (this.cache.has(key)) return this.cache.get(key);
    for (const fn of [() => this.openlibrary(q, opts), () => this.gutendex(q, opts), () => this.googlebooks({ q: typeof q === 'string' ? q : 'popular' }, opts)]) {
      try {
        const r = await fn();
        if (r && r.length) { this.cache.set(key, r); return r; }
      } catch {}
    }
    return [];
  }
};

const Search = {
  current: { q: '', page: 1, results: [] },
  async go(query) {
    const q = query || ($('#searchInput')?.value || '').trim();
    if (!q) { Toast.show('Qidiruv so\'zini kiriting', 'warn'); return; }
    this.current = { q, page: 1, results: [] };
    Store.data.stats.searches++;
    if (!(Store.data.searchHistory || []).includes(q)) { Store.data.searchHistory = [q, ...(Store.data.searchHistory || [])].slice(0, 10); }
    Store.save();
    App.go('search'); this._load();
  },
  async _load() {
    const m = $('#main');
    UI.showSkeleton(m, 8);
    try {
      const r = await API.search({ q: this.current.q }, { page: this.current.page, limit: 20 });
      this.current.results = this.current.results.concat(r);
      this._render();
    } catch (e) { Toast.show('⚠️ Xatolik', 'err'); m.innerHTML = '<div style="padding:40px;text-align:center;color:var(--mut)">Yuklanmadi. Qayta urinib ko\'ring.</div>'; }
  },
  _render() {
    const m = $('#main');
    const r = this.current.results;
    m.innerHTML = '<h2 class="section-title">🔍 "' + esc(this.current.q) + '" <em>' + fmt(r.length) + ' natija</em></h2>' +
      (r.length ? UI._grid(r) : UI.emptyState('Hech narsa topilmadi')) +
      (r.length >= 20 ? '<button class="action-btn" style="width:100%;margin-top:20px;justify-content:center" onclick="Search.loadMore()">📚 Yana yuklash</button>' : '');
  },
  loadMore() { this.current.page++; this._load(); },
  async random() {
    const m = $('#main');
    UI.showSkeleton(m, 6);
    try { const r = await API.openlibrary({ kind: 'random' }, { limit: 12, sort: 'random' }); this.current.results = r; this._render(); }
    catch { m.innerHTML = '<p style="padding:40px;text-align:center;color:var(--mut)">Xatolik</p>'; }
  },
  toggleVoice() {
    const R = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!R) { Toast.show('🎤 Qo\'llab-quvvatlanmaydi', 'warn'); return; }
    try {
      const rec = new R(); rec.lang = 'uz-UZ';
      rec.onstart = () => $('.mic-btn')?.classList.add('listening');
      rec.onend = () => $('.mic-btn')?.classList.remove('listening');
      rec.onresult = e => { const t = e.results[0][0].transcript; const inp = $('#searchInput'); if (inp) inp.value = t; this.go(t); };
      rec.onerror = () => Toast.show('🎤 Xatolik', 'err');
      rec.start();
    } catch (e) { Toast.show('🎤 Xatolik: ' + e.message, 'err'); }
  }
};

const UI = {
  showSkeleton(c, n) {
    if (!c) return;
    let h = '<div class="book-grid">';
    for (let i = 0; i < n; i++) h += '<div><div class="skeleton skel-card"></div><div class="skeleton skel-text"></div></div>';
    c.innerHTML = h + '</div>';
  },
  emptyState(m) { return '<div style="text-align:center;padding:40px 20px;color:var(--mut)"><div style="font-size:60px;margin-bottom:10px;opacity:.5">📭</div><p>' + esc(m) + '</p></div>'; },
  bookCard(b) {
    const safe = JSON.stringify(b).replace(/'/g, "\\u0027");
    return '<div class="book-card fade-in" onclick="App.showDetail(\'' + safe + '\')"><div class="book-cover ' + (b.cover ? '' : 'no-cover') + '">' + (b.cover ? '<img src="' + esc(b.cover) + '" loading="lazy" alt="' + esc(b.title) + '" onerror="this.parentElement.classList.add(\'no-cover\');this.remove()">' : '📖') + (b.free ? '<span class="book-badge free">Bepul</span>' : '') + '</div><div class="book-info"><div class="book-title">' + esc(b.title) + '</div><div class="book-author">' + esc(b.author) + '</div><div class="book-meta"><span>' + (b.year || '—') + '</span>' + (b.language ? '<span>' + esc(String(b.language).toUpperCase()) + '</span>' : '') + '</div></div></div>';
  },
  _grid(books) { return '<div class="book-grid">' + books.map(b => this.bookCard(b)).join('') + '</div>'; },
  toggleTheme() { const t = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'; document.documentElement.dataset.theme = t; Store.data.theme = t; Store.save(); }
};

const CATEGORIES = [
  { id: 'fiction', name: 'Badiiy', icon: '📖' }, { id: 'science', name: 'Fan', icon: '🔬' },
  { id: 'history', name: 'Tarix', icon: '📜' }, { id: 'philosophy', name: 'Falsafa', icon: '🤔' },
  { id: 'poetry', name: 'She\'riyat', icon: '🌹' }, { id: 'biography', name: 'Biografiya', icon: '👤' },
  { id: 'fantasy', name: 'Fantaziya', icon: '🐉' }, { id: 'mystery', name: 'Detektiv', icon: '🔍' },
  { id: 'romance', name: 'Romantika', icon: '💝' }, { id: 'scifi', name: 'Sci-Fi', icon: '🚀' },
  { id: 'business', name: 'Biznes', icon: '💼' }, { id: 'psychology', name: 'Psixologiya', icon: '🧠' },
  { id: 'children', name: 'Bolalar', icon: '🧸' }, { id: 'cooking', name: 'Oshxona', icon: '🍳' },
  { id: 'art', name: 'San\'at', icon: '🎨' }, { id: 'tech', name: 'Texnologiya', icon: '💻' }
];

const App = {
  init() {
    try {
      Store.load();
      if (Store.data.theme === 'light') document.documentElement.dataset.theme = 'light';
      this.startBg();
      this.renderHome();
      // PWA removed: online-only mode
      // GUARANTEED: hide loading after 800ms no matter what
      setTimeout(() => { const l = $('#loading'); if (l) l.classList.add('hide'); }, 800);
      // Also: error fallback for any failed init step
      window.addEventListener('error', e => { const l = $('#loading'); if (l) l.classList.add('hide'); console.error('Global error:', e.message); });
    } catch (e) {
      console.error('Init failed:', e);
      const l = document.getElementById('loading');
      if (l) l.innerHTML = '<div style="text-align:center"><div style="font-size:60px">⚠️</div><p>Xatolik: ' + esc(e.message) + '</p><button class="action-btn primary" onclick="location.reload()">Qayta</button></div>';
    }
  },
  go(page) {
    try { window.scrollTo(0, 0); } catch {}
    const map = {
      home: () => this.renderHome(),
      search: () => {},
      trending: () => Search.go('trending books 2026'),
      popular: () => Search.go('popular classic'),
      new: () => Search.go('new books 2026'),
      authors: () => this.renderAuthors(),
      favorites: () => this.renderFavorites(),
      categories: () => this.renderCategories(),
      contact: () => this.renderContact(),
      about: () => this.renderAbout(),
      privacy: () => this.renderLegal('privacy'),
      terms: () => this.renderLegal('terms'),
      admin: () => this.renderAdmin()
    };
    try { (map[page] || map.home)(); } catch (e) { console.error('go error:', e); }
  },
  renderHome() {
    const m = $('#main'); if (!m) return;
    let catsHtml = '';
    try {
      catsHtml = CATEGORIES.slice(0, 8).map(c => '<div class="cat-card" data-cat="' + esc(c.id) + '"><div class="cat-icon">' + c.icon + '</div><div class="cat-name">' + esc(c.name) + '</div></div>').join('');
    } catch (e) { catsHtml = '<p style="color:var(--mut)">Kategoriyalar yuklanmadi</p>'; }
    m.innerHTML = '<h2 class="section-title">🔥 Trend kitoblar</h2><div id="homeTrend"></div><h2 class="section-title">📚 Mashhur janrlar</h2><div class="cat-grid" style="margin-bottom:30px" id="homeCats">' + catsHtml + '</div><h2 class="section-title">⭐ Top baholangan</h2><div id="homeTop"></div>';
    this._loadTrending('homeTrend');
    this._loadTrending('homeTop', 'classic best');
    // Delegated click for categories
    const cats = $('#homeCats');
    if (cats) cats.addEventListener('click', e => { const card = e.target.closest('.cat-card'); if (card) this.searchCategory(card.dataset.cat); });
  },
  async _loadTrending(id, q) {
    q = q || 'best books';
    const cont = $('#' + id); if (!cont) return;
    UI.showSkeleton(cont, 6);
    try { const r = await API.search({ q }, { limit: 8 }); cont.innerHTML = r.length ? UI._grid(r) : UI.emptyState('Hozircha mavjud emas'); }
    catch { cont.innerHTML = UI.emptyState('Yuklanmadi'); }
  },
  searchCategory(catId) {
    try { const c = CATEGORIES.find(x => x.id === catId); if (c) Search.go(c.name); } catch {}
  },
  renderAuthors() {
    const m = $('#main'); if (!m) return;
    const authors = ['Dostoevsky','Tolstoy','Shakespeare','Pushkin','Asimov','Goethe','Hemingway','Twain'];
    m.innerHTML = '<h2 class="section-title">✍️ Mashhur mualliflar</h2><div class="cat-grid">' + authors.map((a, i) => '<div class="cat-card" data-author="' + esc(a) + '"><div class="cat-icon">' + ['🇷🇺','✍️','🎭','🌹','🚀','🎩','🎣','🎯'][i] + '</div><div class="cat-name">' + esc(a) + '</div></div>').join('') + '</div>';
    m.addEventListener('click', e => { const c = e.target.closest('.cat-card'); if (c && c.dataset.author) Search.go(c.dataset.author); }, { once: false });
  },
  renderFavorites() {
    const favs = Store.data.favorites || [];
    $('#main').innerHTML = favs.length ? '<h2 class="section-title">❤️ Sevimlilar (' + favs.length + ')</h2>' + UI._grid(favs) : UI.emptyState('Sevimlilar yo\'q. Kitob yonidagi 🤍 ni bosing');
  },
  renderCategories() {
    const m = $('#main'); if (!m) return;
    m.innerHTML = '<h2 class="section-title">📂 Kategoriyalar</h2><div class="cat-grid">' + CATEGORIES.map(c => '<div class="cat-card" data-cat="' + esc(c.id) + '"><div class="cat-icon">' + c.icon + '</div><div class="cat-name">' + esc(c.name) + '</div></div>').join('') + '</div>';
    m.addEventListener('click', e => { const c = e.target.closest('.cat-card'); if (c && c.dataset.cat) this.searchCategory(c.dataset.cat); });
  },
  renderContact() {
    $('#main').innerHTML = '<h2 class="section-title">📬 Biz bilan bog\'lanish</h2><form class="contact-form" id="contactForm"><input class="form-input" name="name" placeholder="Ism *" required><input class="form-input" type="email" name="email" placeholder="Email *" required><input class="form-input" name="subject" placeholder="Mavzu *" required><textarea class="form-textarea" name="message" placeholder="Xabaringiz... *" required></textarea><button type="submit" class="submit-btn">📤 Yuborish</button></form><div style="text-align:center;margin-top:30px;padding:20px;background:var(--glass);border-radius:14px"><p style="margin-bottom:14px;color:var(--mut)">Yoki to\'g\'ridan-to\'g\'ri:</p><div class="socials" style="justify-content:center"><a href="https://t.me/KRYZENVIP" target="_blank" class="social tg">📨</a><a href="https://instagram.com/KRYZENVIP" target="_blank" class="social ig">📷</a><a href="https://github.com/KRYZENSYS" target="_blank" class="social gh">💻</a><a href="mailto:f91186645@gmail.com" class="social em">✉️</a></div></div>';
    const f = $('#contactForm');
    if (f) f.addEventListener('submit', e => { e.preventDefault(); const d = Object.fromEntries(new FormData(f)); const m = JSON.parse(localStorage.getItem('kryzen_messages') || '[]'); m.push({ ...d, date: Date.now() }); localStorage.setItem('kryzen_messages', JSON.stringify(m)); Toast.show('✅ Yuborildi!', 'ok'); f.reset(); });
  },
  renderAbout() { $('#main').innerHTML = '<div style="max-width:700px;margin:0 auto;text-align:center;padding:40px 20px"><div style="font-size:80px;margin-bottom:20px">📚🔍</div><h2 style="font-size:32px;margin-bottom:14px" class="glow">KRYZEN BookFinder</h2><p style="color:var(--mut);font-size:16px;line-height:1.7">Premium AI kitob qidiruv platformasi. Open Library, Gutendex va Google Books API. 100% bepul va ochiq manba.</p></div>'; },
  renderLegal(t) { const x = t === 'privacy' ? 'Foydalanuvchi ma\'lumotlari faqat localStorage da saqlanadi. API larga faqat qidiruv so\'zlari yuboriladi.' : 'Open Library, Gutendex, Google Books API. Barcha kitoblar mualliflarga tegishli.'; $('#main').innerHTML = '<h2 class="section-title">' + (t === 'privacy' ? '🔒 Maxfiylik' : '📜 Shartlar') + '</h2><p style="line-height:1.8;padding:20px;background:var(--glass);border-radius:14px">' + x + '</p>'; },
  renderAdmin() {
    const s = Store.data.stats || {};
    $('#main').innerHTML = '<h2 class="section-title">⚙️ Admin</h2><div class="admin-card"><h3>📊 Statistika</h3><div class="stat-grid"><div class="stat-item"><div class="stat-value">' + fmt(s.searches || 0) + '</div><div class="stat-label">Qidiruvlar</div></div><div class="stat-item"><div class="stat-value">' + fmt(s.booksViewed || 0) + '</div><div class="stat-label">Ko\'rilgan</div></div><div class="stat-item"><div class="stat-value">' + fmt((Store.data.favorites || []).length) + '</div><div class="stat-label">Sevimlilar</div></div></div></div><div class="admin-card"><h3>🛠 Sozlamalar</h3><button class="action-btn" id="clearCacheBtn">🗑 Cache tozalash</button></div>';
    const b = $('#clearCacheBtn');
    if (b) b.addEventListener('click', () => { API.cache.clear(); Toast.show('Cache tozalandi', 'ok'); });
  },
  showDetail(book) {
    try {
      Store.data.recent = [book, ...(Store.data.recent || []).filter(b => b.id !== book.id)].slice(0, 20);
      Store.data.stats.booksViewed++; Store.save();
      const isFav = (Store.data.favorites || []).some(b => b.id === book.id);
      const formats = book.formats && book.formats.length ? book.formats : [];
      const html = '<button class="modal-close" onclick="Modal.close()">✕</button><div class="detail"><div class="detail-cover">' + (book.cover ? '<img src="' + esc(book.cover) + '" alt="' + esc(book.title) + '" onerror="this.parentElement.textContent=\'📖\'">' : '📖') + '</div><div class="detail-content"><h2>' + esc(book.title) + '</h2><div class="detail-author">✍️ ' + esc(book.author || '—') + (book.year ? ' · ' + book.year : '') + '</div><div class="detail-meta"><div class="meta-item"><div class="meta-label">Nashriyot</div><div class="meta-value">' + esc(book.publisher || '—') + '</div></div><div class="meta-item"><div class="meta-label">Til</div><div class="meta-value">' + esc((book.language || '—').toString().toUpperCase()) + '</div></div><div class="meta-item"><div class="meta-label">Sahifalar</div><div class="meta-value">' + esc(book.pages || '—') + '</div></div><div class="meta-item"><div class="meta-label">ISBN</div><div class="meta-value">' + esc(book.isbn || '—') + '</div></div><div class="meta-item"><div class="meta-label">Reyting</div><div class="meta-value">' + (book.rating ? '⭐ ' + book.rating.toFixed(1) : '—') + '</div></div><div class="meta-item"><div class="meta-label">Manba</div><div class="meta-value">' + esc(book.source || 'Open Library') + '</div></div></div>' + (book.description ? '<div class="detail-desc">' + esc(book.description).slice(0, 500) + (book.description.length > 500 ? '...' : '') + '</div>' : '') + (book.subject && book.subject.length ? '<div style="margin-bottom:14px"><strong style="color:var(--neon)">Janrlar:</strong> ' + book.subject.slice(0, 5).map(s => '<span class="filter-chip" style="margin-right:6px">' + esc(s) + '</span>').join('') + '</div>' : '') + '<div class="detail-actions">' + (formats.length ? '<button class="action-btn primary" onclick="App.read()">📖 O\'qish</button>' : '') + '<button class="action-btn" onclick="App.share(\'' + esc(book.title).replace(/'/g, "") + '\')">📤 Ulashish</button><button class="action-btn" onclick="App.copyLink()">📋 Nusxalash</button><button class="action-btn" id="favBtn" style="color:' + (isFav ? 'var(--err)' : 'inherit') + '">' + (isFav ? '❤️' : '🤍') + '</button><button class="action-btn" onclick="App.qr()">📱 QR</button></div>' + (formats.length ? '<h3 style="margin:24px 0 12px;font-size:16px">📥 Yuklab olish</h3><div class="dl-formats">' + formats.slice(0, 6).map(f => '<div class="dl-fmt" data-url="' + esc(typeof f === 'string' ? f : f.url || '') + '"><div class="ftype">' + esc((typeof f === 'string' ? 'FILE' : (f.type || 'FILE')).toString().toUpperCase()) + '</div><div class="fsize">Yuklab olish</div></div>').join('') + '</div>' : book.previewLink ? '<h3 style="margin:24px 0 12px;font-size:16px">📥 Yuklab olish</h3><div style="padding:14px;background:var(--glass);border-radius:10px"><button class="action-btn primary" onclick="window.open(\'' + esc(book.previewLink) + '\',\'_blank\')">👁 Preview</button><button class="action-btn" onclick="window.open(\'' + esc(book.infoLink || '#') + '\',\'_blank\')">ℹ️ Batafsil</button></div>' : '<p style="margin-top:14px;padding:14px;background:var(--glass);border-radius:10px;color:var(--mut);font-size:13px">Ushbu kitobni yuklab olish mumkin emas.</p>') + '<div id="readerArea" style="margin-top:20px"></div></div></div>';
      Modal.open(html);
      // Fav button
      const favBtn = $('#favBtn');
      if (favBtn) favBtn.addEventListener('click', () => this.toggleFav(book));
      // Download buttons (delegated)
      const dlContainer = document.querySelector('.dl-formats');
      if (dlContainer) dlContainer.addEventListener('click', e => { const f = e.target.closest('.dl-fmt'); if (f) App.dl(f.dataset.url); });
    } catch (e) { console.error('showDetail error:', e); Toast.show('Xatolik', 'err'); }
  },
  share(t) { try { if (navigator.share) navigator.share({ title: t, url: location.href }); else { navigator.clipboard.writeText(location.href); Toast.show('📋 Nusxalandi', 'ok'); } } catch {} },
  copyLink() { try { navigator.clipboard.writeText(location.href); Toast.show('📋 Nusxalandi', 'ok'); } catch {} },
  toggleFav(book) { try { const favs = Store.data.favorites || []; const i = favs.findIndex(b => b.id === book.id); if (i > -1) { favs.splice(i, 1); Toast.show('Olib tashlandi'); } else { favs.push(book); Toast.show('❤️ Qo\'shildi', 'ok'); } Store.data.favorites = favs; Store.save(); Modal.close(); setTimeout(() => this.showDetail(book), 100); } catch {} },
  qr() { try { const url = location.href; Modal.open('<button class="modal-close" onclick="Modal.close()">✕</button><div style="padding:30px;text-align:center"><h3 style="margin-bottom:16px">📱 QR Code</h3><div class="qr-container" style="display:inline-block"><img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(url) + '" alt="QR" onerror="this.parentElement.innerHTML=\'<p>QR xato</p>\'"></div></div>'); } catch (e) { Toast.show('QR xato', 'err'); } },
  read() { const r = $('#readerArea'); if (r) r.innerHTML = '<div style="background:var(--glass);padding:20px;border-radius:12px;border:1px solid var(--neon);margin-top:14px"><h4 style="margin-bottom:10px">📖 O\'qish rejimi</h4><div style="background:#000;padding:16px;border-radius:8px;line-height:1.8;color:#ccc">To\'liq matn API orqali yuklanadi. Demo versiya.</div></div>'; Toast.show('📖 O\'qish boshlandi', 'ok'); },
  dl(url) { if (!url || url === 'undefined') return Toast.show('Yuklab olish mumkin emas', 'err'); Store.data.stats.downloads = (Store.data.stats.downloads || 0) + 1; Store.save(); Toast.show('📥 Yuklanmoqda...', 'ok'); setTimeout(() => window.open(url, '_blank'), 500); },
  startBg() {
    try {
      const c = $('#bgCanvas'); if (!c) return;
      const ctx = c.getContext('2d'); if (!ctx) return;
      let w, h, ps = [];
      const resize = () => { w = c.width = innerWidth; h = c.height = innerHeight; };
      const mk = () => ({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - 0.5) * 0.2, vy: (Math.random() - 0.5) * 0.2, s: Math.random() * 1.5 + 0.5, c: ['#00D4FF', '#8B5CF6', '#06b6d4'][Math.floor(Math.random() * 3)] });
      for (let i = 0; i < 40; i++) ps.push(mk());
      resize(); window.addEventListener('resize', resize);
      const draw = () => { try { ctx.clearRect(0, 0, w, h); ps.forEach(p => { p.x += p.vx; p.y += p.vy; if (p.x < 0 || p.x > w) p.vx *= -1; if (p.y < 0 || p.y > h) p.vy *= -1; ctx.fillStyle = p.c; ctx.globalAlpha = 0.4; ctx.shadowBlur = 8; ctx.shadowColor = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, Math.PI * 2); ctx.fill(); }); ctx.globalAlpha = 1; ctx.shadowBlur = 0; requestAnimationFrame(draw); } catch {} };
      draw();
    } catch (e) { console.error('bg error:', e); }
  }
};

const Modal = {
  open(h) { try { $('#modalContent').innerHTML = h; $('#modal').style.display = 'flex'; document.body.style.overflow = 'hidden'; } catch (e) { console.error(e); } },
  close() { try { $('#modal').style.display = 'none'; document.body.style.overflow = ''; } catch {} }
};
const _closeModalOnBackdrop = e => { if (e.target.id === 'modal') Modal.close(); };
const _closeModalOnEsc = e => { if (e.key === 'Escape') Modal.close(); };
document.addEventListener('DOMContentLoaded', () => {
  const m = $('#modal'); if (m) m.addEventListener('click', _closeModalOnBackdrop);
  document.addEventListener('keydown', _closeModalOnEsc);
});

const Toast = { show(m, t) { try { const z = $('#toastZone'); if (!z) return; const x = document.createElement('div'); x.className = 'toast ' + (t || ''); x.textContent = m; z.appendChild(x); setTimeout(() => { try { x.remove(); } catch {} }, 2800); } catch {} } };

/* /* PWA removed: online-only mode */

// Search on Enter
document.addEventListener('DOMContentLoaded', () => {
  const inp = $('#searchInput');
  if (inp) inp.addEventListener('keydown', e => { if (e.key === 'Enter') Search.go(); });
  App.init();
});
