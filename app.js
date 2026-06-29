const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const fmt = n => (n||0).toLocaleString('uz-UZ');
const esc = s => String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const Store = {
  KEY: 'kryzen_bookfinder_v1',
  data: null,
  def() { return { theme: 'dark', favorites: [], history: [], recent: [], reading: {}, searchHistory: [], settings: {}, stats: { searches: 0, booksViewed: 0, downloads: 0 }, created: Date.now() }; },
  load() { try { this.data = { ...this.def(), ...JSON.parse(localStorage.getItem(this.KEY) || '{}') }; } catch { this.data = this.def(); } return this.data; },
  save() { try { localStorage.setItem(this.KEY, JSON.stringify(this.data)); } catch {} },
  toggle(k, v) { this.data[k] = v; this.save(); }
};

const API = {
  cache: new Map(),
  async openlibrary(query, opts = {}) {
    const { page = 1, limit = 20, sort = '' } = opts;
    let url;
    if (query.kind === 'random') url = `https://openlibrary.org/search.json?q=*&sort=random&limit=${limit}&page=${page}`;
    else if (query.q) url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query.q)}&limit=${limit}&page=${page}${sort ? '&sort=' + sort : ''}`;
    else return [];
    const res = await fetch(url);
    if (!res.ok) throw new Error('OL fail');
    const data = await res.json();
    return (data.docs || []).map(b => ({
      id: b.key || 'ol-' + (b.cover_i || Math.random()),
      title: b.title || 'Nomsiz',
      author: (b.author_name || [])[0] || 'Noma'lum',
      authors: b.author_name || [],
      year: b.first_publish_year || null,
      cover: b.cover_i ? `https://covers.openlibrary.org/b/id/${b.cover_i}-M.jpg` : null,
      isbn: (b.isbn || [])[0] || null,
      publisher: (b.publisher || [])[0] || null,
      language: (b.language || [])[0] || null,
      pages: b.number_of_pages_median || null,
      rating: b.ratings_average || null,
      subject: (b.subject || []).slice(0, 5),
      free: !!(b.ia || b.public_scan_b),
      formats: b.ia ? b.ia.slice(0, 5) : [],
      source: 'openlibrary', key: b.key
    }));
  },
  async gutendex(query, opts = {}) {
    const { page = 1 } = opts;
    let url = `https://gutendex.com/books/?page=${page}`;
    if (query.q) url += `&search=${encodeURIComponent(query.q)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('GX fail');
    const data = await res.json();
    return (data.results || []).map(b => ({
      id: 'gut-' + b.id,
      title: b.title || 'Untitled',
      author: (b.authors || [])[0]?.name || 'Unknown',
      authors: (b.authors || []).map(a => a.name),
      year: null,
      cover: (b.formats && (b.formats['image/jpeg'] || b.formats['image/png'])) || null,
      isbn: b.identifiers?.isbn_13?.[0] || null,
      free: true,
      formats: Object.entries(b.formats || {}).filter(([k, v]) => /epub|pdf|txt|html/.test(k) && !/image/.test(k)).map(([k, v]) => ({ type: k.split('/')[1], url: v })),
      downloadCount: b.download_count || 0,
      source: 'gutendex'
    }));
  },
  async googlebooks(query, opts = {}) {
    const { page = 1, limit = 20 } = opts;
    let url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query.q || '*')}&maxResults=${limit}&startIndex=${(page - 1) * limit}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('GB fail');
    const data = await res.json();
    return (data.items || []).map(b => {
      const v = b.volumeInfo || {};
      return {
        id: 'gb-' + b.id,
        title: v.title || 'Untitled',
        author: (v.authors || [])[0] || 'Unknown',
        authors: v.authors || [],
        year: v.publishedDate ? +v.publishedDate.slice(0, 4) : null,
        cover: v.imageLinks?.thumbnail || v.imageLinks?.smallThumbnail || null,
        isbn: v.industryIdentifiers?.find(i => i.type === 'ISBN_13')?.identifier || null,
        publisher: v.publisher || null,
        pages: v.pageCount || null,
        language: v.language || null,
        description: v.description || '',
        rating: v.averageRating || null,
        subject: v.categories || [],
        previewLink: v.previewLink || null,
        infoLink: v.infoLink || null,
        free: v.accessInfo?.publicDomain || v.accessInfo?.embeddable,
        source: 'googlebooks'
      };
    });
  },
  async search(q, opts = {}) {
    const key = JSON.stringify({ q, ...opts });
    if (this.cache.has(key)) return this.cache.get(key);
    const errs = [];
    try { const r = await this._retry(() => this.openlibrary(q, opts)); if (r.length) { this.cache.set(key, r); return r; } }
    catch (e) { errs.push('OL:' + e.message); }
    try { const r = await this._retry(() => this.gutendex(q, opts)); if (r.length) { this.cache.set(key, r); return r; } }
    catch (e) { errs.push('GX:' + e.message); }
    try { const r = await this._retry(() => this.googlebooks({ q: typeof q === 'string' ? q : 'popular' }, opts)); this.cache.set(key, r); return r; }
    catch (e) { throw new Error('API ishlamadi'); }
  },
  async _retry(fn, times = 2) { let e; for (let i = 0; i <= times; i++) { try { return await fn(); } catch (err) { e = err; if (i < times) await new Promise(r => setTimeout(r, 400 * (i + 1))); } } throw e; }
};

const Search = {
  current: { q: '', page: 1, results: [], filters: {}, sort: '' },
  async go(query) {
    const q = query || $('#searchInput').value.trim();
    if (!q) { Toast.show('Qidiruv so'zini kiriting', 'warn'); return; }
    this.current = { q, page: 1, results: [], filters: {}, sort: '' };
    if (!(Store.data.searchHistory || []).includes(q)) { Store.data.searchHistory = [q, ...(Store.data.searchHistory || [])].slice(0, 10); Store.save(); }
    Store.data.stats.searches++; Store.save();
    App.go('search'); this._load();
  },
  async _load() {
    UI.showSkeleton($('#main'), 8);
    try {
      const r = await API.search({ q: this.current.q }, { page: this.current.page, limit: 20, sort: this.current.sort });
      this.current.results = this.current.results.concat(r);
      this._render();
    } catch (e) { Toast.show('⚠️ Qidiruv muvaffaqiyatsiz', 'err'); UI.errorState($('#main'), 'API ishlamayapti', 'Boshqa urinib ko'ring'); }
  },
  _render() {
    const m = $('#main');
    let h = `<h2 class="section-title">🔍 "${esc(this.current.q)}" <em>${fmt(this.current.results.length)} natija</em></h2>`;
    h += `<div class="filters"><select class="filter-select" onchange="Search.sort=this.value;Search.current.page=1;Search.current.results=[];Search._load()"><option value="">Saralash</option><option value="new">Eng yangi</option><option value="old">Eng eski</option></select><label class="filter-chip"><input type="checkbox" onchange="Search._filterToggle('free',this.checked)"> 📥 Faqat bepul</label></div>`;
    h += this.current.results.length ? UI._grid(this.current.results) : UI.emptyState('Hech narsa topilmadi');
    h += this.current.results.length >= 20 ? `<button class="action-btn" style="width:100%;margin-top:20px;justify-content:center" onclick="Search.loadMore()">📚 Yana yuklash</button>` : '';
    m.innerHTML = h;
  },
  _filterToggle(type, val) {
    if (val) this.current.results = this.current.results.filter(b => b.free);
    else Search.go(this.current.q);
    this._render();
  },
  loadMore() { this.current.page++; this._load(); },
  async random() {
    UI.showSkeleton($('#main'), 6);
    try { const r = await API.openlibrary({ kind: 'random' }, { limit: 12, sort: 'random' }); this.current.results = r; this._render(); }
    catch { Toast.show('⚠️ Xatolik', 'err'); }
  },
  toggleVoice() {
    const R = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!R) { Toast.show('🎤 Qo'llab-quvvatlanmaydi', 'warn'); return; }
    const rec = new R(); rec.lang = 'uz-UZ';
    rec.onstart = () => $('.mic-btn')?.classList.add('listening');
    rec.onend = () => $('.mic-btn')?.classList.remove('listening');
    rec.onresult = e => { $('#searchInput').value = e.results[0][0].transcript; this.go(e.results[0][0].transcript); };
    rec.start();
  }
};

const UI = {
  showSkeleton(c, n = 6) {
    let h = '<div class="book-grid">';
    for (let i = 0; i < n; i++) h += '<div><div class="skeleton skel-card"></div><div class="skeleton skel-text"></div><div class="skeleton skel-text" style="width:60%"></div></div>';
    h += '</div>'; c.innerHTML = h;
  },
  errorState(c, t, m) { c.innerHTML = `<div style="text-align:center;padding:60px 20px"><div style="font-size:80px;margin-bottom:20px">😵</div><h2 style="font-size:22px;margin-bottom:10px">${esc(t)}</h2><p style="color:var(--mut);margin-bottom:20px">${esc(m)}</p><button class="action-btn primary" onclick="location.reload()">🔄 Qayta</button></div>`; },
  emptyState(m) { return `<div style="text-align:center;padding:40px 20px;color:var(--mut)"><div style="font-size:60px;margin-bottom:10px;opacity:.5">📭</div><p>${esc(m)}</p></div>`; },
  bookCard(b) { return `<div class="book-card fade-in" onclick='App.showDetail(${JSON.stringify(b).replace(/'/g, "\u0027")})'><div class="book-cover ${b.cover ? '' : 'no-cover'}">${b.cover ? `<img src="${esc(b.cover)}" loading="lazy" alt="${esc(b.title)}">` : '📖'}${b.free ? '<span class="book-badge free">Bepul</span>' : ''}</div><div class="book-info"><div class="book-title">${esc(b.title)}</div><div class="book-author">${esc(b.author)}</div><div class="book-meta"><span>${b.year || '—'}</span>${b.language ? `<span>${b.language.toUpperCase()}</span>` : ''}${b.pages ? `<span>${b.pages}p</span>` : ''}</div></div></div>`; },
  _grid(books) { return `<div class="book-grid">${books.map(b => this.bookCard(b)).join('')}</div>`; },
  toggleTheme() { const t = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'; document.documentElement.dataset.theme = t; Store.toggle('theme', t); }
};

const App = {
  init() {
    Store.load();
    if (Store.data.theme === 'light') document.documentElement.dataset.theme = 'light';
    this.startBg(); this.renderHome(); PWA.init();
    setTimeout(() => $('#loading')?.classList.add('hide'), 1500);
  },
  go(page) {
    window.scrollTo(0, 0);
    if (page === 'home') this.renderHome();
    else if (page === 'search') {/* handled */}
    else if (page === 'trending') Search.go('trending books 2026');
    else if (page === 'popular') Search.go('popular classic literature');
    else if (page === 'new') Search.go('new books 2026');
    else if (page === 'authors') this.renderAuthors();
    else if (page === 'favorites') this.renderFavorites();
    else if (page === 'categories') this.renderCategories();
    else if (page === 'contact') this.renderContact();
    else if (page === 'about') this.renderAbout();
    else if (page === 'privacy') this.renderLegal('privacy');
    else if (page === 'terms') this.renderLegal('terms');
    else if (page === 'admin') this.renderAdmin();
  },
  renderHome() {
    $('#main').innerHTML = `<h2 class="section-title">🔥 Trend kitoblar</h2><div id="homeTrend"></div><h2 class="section-title">📚 Mashhur janrlar</h2><div class="cat-grid" style="margin-bottom:30px">${CATEGORIES.slice(0, 8).map(c => `<div class="cat-card" onclick="App.searchCategory('${c.id}')"><div class="cat-icon">${c.icon}</div><div class="cat-name">${c.name}</div></div>`).join('')}</div><h2 class="section-title">⭐ Top baholangan</h2><div id="homeTop"></div>`;
    this._loadTrending('homeTrend'); this._loadTrending('homeTop', 'classic');
  },
  async _loadTrending(id, q = 'best') {
    const cont = $('#' + id); if (!cont) return;
    UI.showSkeleton(cont, 6);
    try { const r = await API.search({ q }, { limit: 8 }); cont.innerHTML = UI._grid(r); } catch { cont.innerHTML = UI.emptyState('Yuklanmadi'); }
  },
  searchCategory(catId) { const c = CATEGORIES.find(x => x.id === catId); if (c) Search.go(c.name); },
  renderAuthors() { $('#main').innerHTML = `<h2 class="section-title">✍️ Mashhur mualliflar</h2><div class="cat-grid">${AUTHORS.map(a => `<div class="cat-card" onclick="Search.go('${a.name}')"><div class="cat-icon">${a.icon}</div><div class="cat-name">${a.name}</div></div>`).join('')}</div>`; },
  renderFavorites() { const favs = Store.data.favorites || []; $('#main').innerHTML = favs.length ? `<h2 class="section-title">❤️ Sevimlilar (${favs.length})</h2>${UI._grid(favs)}` : UI.emptyState('Sevimlilar yo'q. Kitob yonidagi ❤️ ni bosing'); },
  renderCategories() { $('#main').innerHTML = `<h2 class="section-title">📂 Kategoriyalar</h2><div class="cat-grid">${CATEGORIES.map(c => `<div class="cat-card" onclick="App.searchCategory('${c.id}')"><div class="cat-icon">${c.icon}</div><div class="cat-name">${c.name}</div></div>`).join('')}</div>`; },
  renderContact() {
    $('#main').innerHTML = `<h2 class="section-title">📬 Biz bilan bog'lanish</h2><form class="contact-form" onsubmit="App.submitContact(event)"><input class="form-input" type="text" name="name" placeholder="Ism *" required><input class="form-input" type="email" name="email" placeholder="Email *" required><input class="form-input" type="text" name="subject" placeholder="Mavzu *" required><textarea class="form-textarea" name="message" placeholder="Xabaringiz... *" required></textarea><button type="submit" class="submit-btn">📤 Yuborish</button></form><div style="text-align:center;margin-top:30px;padding:20px;background:var(--glass);border-radius:14px"><p style="margin-bottom:14px;color:var(--mut)">Yoki to'g'ridan-to'g'ri:</p><div class="socials" style="justify-content:center"><a href="https://t.me/KRYZENVIP" target="_blank" class="social tg">📨</a><a href="https://instagram.com/KRYZENVIP" target="_blank" class="social ig">📷</a><a href="https://github.com/KRYZENSYS" target="_blank" class="social gh">💻</a><a href="mailto:f91186645@gmail.com" class="social em">✉️</a></div></div>`;
  },
  submitContact(e) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    const msgs = JSON.parse(localStorage.getItem('kryzen_messages') || '[]');
    msgs.push({ ...data, date: Date.now() });
    localStorage.setItem('kryzen_messages', JSON.stringify(msgs));
    Toast.show('✅ Yuborildi!', 'ok'); e.target.reset();
    // fetch('/api/contact', {method:'POST', body: JSON.stringify(data)})
  },
  renderAbout() { $('#main').innerHTML = `<div style="max-width:700px;margin:0 auto;text-align:center;padding:40px 20px"><div style="font-size:80px;margin-bottom:20px">📚🔍</div><h2 style="font-size:32px;margin-bottom:14px" class="glow">KRYZEN BookFinder</h2><p style="color:var(--mut);font-size:16px;line-height:1.7">Premium AI kitob qidiruv platformasi. Open Library, Gutendex va Google Books API. 100% bepul va ochiq manba.</p></div>`; },
  renderLegal(t) { const x = t === 'privacy' ? 'Foydalanuvchi ma'lumotlari faqat localStorage da saqlanadi. API larga faqat qidiruv so'zlari yuboriladi.' : 'Open Library, Gutendex, Google Books API. Barcha kitoblar mualliflarga tegishli.'; $('#main').innerHTML = `<h2 class="section-title">${t === 'privacy' ? '🔒 Maxfiylik' : '📜 Shartlar'}</h2><p style="line-height:1.8;padding:20px;background:var(--glass);border-radius:14px">${x}</p>`; },
  renderAdmin() {
    const s = Store.data.stats || {};
    $('#main').innerHTML = `<h2 class="section-title">⚙️ Admin</h2><div class="admin-card"><h3>📊 Statistika</h3><div class="stat-grid"><div class="stat-item"><div class="stat-value">${fmt(s.searches || 0)}</div><div class="stat-label">Qidiruvlar</div></div><div class="stat-item"><div class="stat-value">${fmt(s.booksViewed || 0)}</div><div class="stat-label">Ko'rilgan</div></div><div class="stat-item"><div class="stat-value">${fmt((Store.data.favorites || []).length)}</div><div class="stat-label">Sevimlilar</div></div></div></div><div class="admin-card"><h3>🛠 Sozlamalar</h3><button class="action-btn" onclick="API.cache.clear();Toast.show('Cache tozalandi','ok')">🗑 Cache tozalash</button></div>`;
  },
  showDetail(book) {
    Store.data.recent = [book, ...(Store.data.recent || []).filter(b => b.id !== book.id)].slice(0, 20);
    Store.data.stats.booksViewed++; Store.save();
    const isFav = (Store.data.favorites || []).some(b => b.id === book.id);
    const formats = (book.formats && book.formats.length) ? book.formats : (book.source === 'gutendex' ? book.formats : []);
    const html = `<button class="modal-close" onclick="Modal.close()">✕</button><div class="detail"><div class="detail-cover">${book.cover ? `<img src="${esc(book.cover)}" alt="${esc(book.title)}">` : '📖'}</div><div class="detail-content"><h2>${esc(book.title)}</h2><div class="detail-author">✍️ ${esc(book.author)}${book.year ? ' · ' + book.year : ''}</div><div class="detail-meta"><div class="meta-item"><div class="meta-label">Nashriyot</div><div class="meta-value">${esc(book.publisher || '—')}</div></div><div class="meta-item"><div class="meta-label">Til</div><div class="meta-value">${esc(book.language?.toUpperCase() || '—')}</div></div><div class="meta-item"><div class="meta-label">Sahifalar</div><div class="meta-value">${esc(book.pages || '—')}</div></div><div class="meta-item"><div class="meta-label">ISBN</div><div class="meta-value">${esc(book.isbn || '—')}</div></div><div class="meta-item"><div class="meta-label">Reyting</div><div class="meta-value">${book.rating ? '⭐ ' + book.rating.toFixed(1) : '—'}</div></div><div class="meta-item"><div class="meta-label">Manba</div><div class="meta-value">${esc(book.source || 'Open Library')}</div></div></div>${book.description ? `<div class="detail-desc">${esc(book.description).slice(0, 500)}${book.description.length > 500 ? '...' : ''}</div>` : ''}${book.subject && book.subject.length ? `<div style="margin-bottom:14px"><strong style="color:var(--neon)">Janrlar:</strong> ${book.subject.slice(0, 5).map(s => `<span class="filter-chip" style="margin-right:6px">${esc(s)}</span>`).join('')}</div>` : ''}<div class="detail-actions">${formats && formats.length ? `<button class="action-btn primary" onclick="App.read()">📖 O'qish</button>` : ''}<button class="action-btn" onclick="App.share('${esc(book.title)}')">📤 Ulashish</button><button class="action-btn" onclick="App.copyLink()">📋 Nusxalash</button><button class="action-btn" onclick="App.toggleFav(${JSON.stringify(book).replace(/"/g, '&quot;')})" style="color:${isFav ? 'var(--err)' : 'inherit'}">${isFav ? '❤️' : '🤍'}</button><button class="action-btn" onclick="App.qr()">📱 QR</button></div>${formats && formats.length ? `<h3 style="margin:24px 0 12px;font-size:16px">📥 Yuklab olish</h3><div class="dl-formats">${formats.slice(0, 6).map(f => `<div class="dl-fmt" onclick="App.dl('${esc(typeof f === 'string' ? f : f.url)}','${esc(typeof f === 'string' ? 'FILE' : f.type)}')"><div class="ftype">${esc(typeof f === 'string' ? 'FILE' : f.type.toUpperCase())}</div><div class="fsize">Yuklab olish</div></div>`).join('')}</div>` : book.previewLink ? `<h3 style="margin:24px 0 12px;font-size:16px">📥 Yuklab olish</h3><div style="padding:14px;background:var(--glass);border-radius:10px"><button class="action-btn primary" onclick="window.open('${book.previewLink}','_blank')">👁 Preview</button><button class="action-btn" onclick="window.open('${book.infoLink}','_blank')">ℹ️ Batafsil</button></div>` : `<p style="margin-top:14px;padding:14px;background:var(--glass);border-radius:10px;color:var(--mut);font-size:13px">Ushbu kitobni yuklab olish mumkin emas. Faqat onlayn o'qish mavjud.</p>`}<div id="readerArea" style="margin-top:20px"></div></div></div>`;
    Modal.open(html);
  },
  share(t) { if (navigator.share) navigator.share({ title: t, url: location.href }); else { navigator.clipboard.writeText(location.href); Toast.show('📋 Nusxalandi', 'ok'); } },
  copyLink() { navigator.clipboard.writeText(location.href); Toast.show('📋 Nusxalandi', 'ok'); },
  toggleFav(book) { const favs = Store.data.favorites || []; const i = favs.findIndex(b => b.id === book.id); if (i > -1) { favs.splice(i, 1); Toast.show('Olib tashlandi'); } else { favs.push(book); Toast.show('❤️ Qo'shildi', 'ok'); } Store.data.favorites = favs; Store.save(); Modal.close(); setTimeout(() => this.showDetail(book), 100); },
  qr() { const url = location.href; const api = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`; Modal.open(`<button class="modal-close" onclick="Modal.close()">✕</button><div style="padding:30px;text-align:center"><h3 style="margin-bottom:16px">📱 QR Code</h3><div class="qr-container" style="display:inline-block"><img src="${api}" alt="QR"></div></div>`); },
  read() { $('#readerArea').innerHTML = `<div style="background:var(--glass);padding:20px;border-radius:12px;border:1px solid var(--neon);margin-top:14px"><h4 style="margin-bottom:10px">📖 O'qish rejimi</h4><div style="background:#000;padding:16px;border-radius:8px;line-height:1.8;color:#ccc">To'liq matn API orqali yuklanadi. Demo versiya.</div></div>`; Toast.show('📖 O'qish boshlandi', 'ok'); },
  dl(url) { if (!url) return Toast.show('Yuklab olish mumkin emas', 'err'); Store.data.stats.downloads = (Store.data.stats.downloads || 0) + 1; Store.save(); Toast.show('📥 Yuklanmoqda...', 'ok'); setTimeout(() => window.open(url, '_blank'), 500); },
  startBg() {
    const c = $('#bgCanvas'), ctx = c.getContext('2d'); let w, h, ps = [];
    const resize = () => { w = c.width = innerWidth; h = c.height = innerHeight; };
    const mk = () => ({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3, s: Math.random() * 2 + 1, c: ['#00D4FF', '#8B5CF6', '#06b6d4'][Math.floor(Math.random() * 3)] });
    for (let i = 0; i < 60; i++) ps.push(mk()); resize(); window.addEventListener('resize', resize);
    const draw = () => { ctx.clearRect(0, 0, w, h); ps.forEach(p => { p.x += p.vx; p.y += p.vy; if (p.x < 0 || p.x > w) p.vx *= -1; if (p.y < 0 || p.y > h) p.vy *= -1; ctx.fillStyle = p.c; ctx.globalAlpha = 0.5; ctx.shadowBlur = 10; ctx.shadowColor = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, Math.PI * 2); ctx.fill(); }); ctx.globalAlpha = 1; ctx.shadowBlur = 0; requestAnimationFrame(draw); };
    draw();
  }
};

const CATEGORIES = [
  { id: 'fiction', name: 'Badiiy', icon: '📖' }, { id: 'science', name: 'Fan', icon: '🔬' },
  { id: 'history', name: 'Tarix', icon: '📜' }, { id: 'philosophy', name: 'Falsafa', icon: '🤔' },
  { id: 'poetry', name: 'She'riyat', icon: '🌹' }, { id: 'biography', name: 'Biografiya', icon: '👤' },
  { id: 'fantasy', name: 'Fantaziya', icon: '🐉' }, { id: 'mystery', name: 'Detektiv', icon: '🔍' },
  { id: 'romance', name: 'Romantika', icon: '💝' }, { id: 'scifi', name: 'Sci-Fi', icon: '🚀' },
  { id: 'business', name: 'Biznes', icon: '💼' }, { id: 'psychology', name: 'Psixologiya', icon: '🧠' },
  { id: 'children', name: 'Bolalar', icon: '🧸' }, { id: 'cooking', name: 'Oshxona', icon: '🍳' },
  { id: 'art', name: 'San'at', icon: '🎨' }, { id: 'tech', name: 'Texnologiya', icon: '💻' }
];
const AUTHORS = [
  { name: 'Dostoevsky', icon: '🇷🇺' }, { name: 'Tolstoy', icon: '✍️' }, { name: 'Shakespeare', icon: '🎭' },
  { name: 'Pushkin', icon: '🌹' }, { name: 'Asimov', icon: '🚀' }, { name: 'Goethe', icon: '🎩' },
  { name: 'Hemingway', icon: '🎣' }, { name: 'Twain', icon: '🎯' }
];

const Modal = {
  open(h) { $('#modalContent').innerHTML = h; $('#modal').style.display = 'flex'; document.body.style.overflow = 'hidden'; },
  close() { $('#modal').style.display = 'none'; document.body.style.overflow = ''; }
};
$('#modal')?.addEventListener('click', e => { if (e.target.id === 'modal') Modal.close(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') Modal.close(); });

const Toast = { show(m, t = '') { const z = $('#toastZone'); const x = document.createElement('div'); x.className = 'toast ' + t; x.textContent = m; z.appendChild(x); setTimeout(() => x.remove(), 3000); } };

const PWA = {
  deferred: null,
  init() { if ('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js').catch(() => {}); window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); this.deferred = e; $('#installBtn').style.display = 'inline-flex'; }); },
  async install() { if (!this.deferred) return; this.deferred.prompt(); const { outcome } = await this.deferred.userChoice; if (outcome === 'accepted') Toast.show('📲 O'rnatish boshlandi!', 'ok'); this.deferred = null; $('#installBtn').style.display = 'none'; }
};

$('#searchInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') Search.go(); });
window.addEventListener('DOMContentLoaded', () => App.init());
