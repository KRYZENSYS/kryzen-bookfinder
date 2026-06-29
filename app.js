/* ============================================
   KRYZEN BookFinder — API Keys Configuration
   ============================================
   TO ADD/MODIFY YOUR API KEYS, EDIT THE CONFIG OBJECT BELOW.
   You can also change them in the app: ⚙️ Admin → 🔑 API Keys
   ============================================ */

/* ============================================
   KRYZEN BookFinder — CONFIG
   ============================================
   ⚠️ ADMIN CREDENTIALS (MUHIM!) ⚠️
   Login:    KRYZEN_ADMIN
   Parol:    Kryz3n@B00kF1nd3r!2026
   ============================================ */

const ADMIN_CONFIG = {
  username: 'KRYZEN_ADMIN',
  password: 'Kryz3n@B00kF1nd3r!2026',
  email: 'f91186645@gmail.com',
  name: 'KRYZEN Administrator',
  role: 'superadmin'
};

// SHA-256 hash (real parolni saqlamaslik uchun)
async function hashPassword(pwd) {
  const enc = new TextEncoder().encode(pwd);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Initialize admin hash on first load
(async () => {
  try {
    if (!localStorage.getItem('kryzen_admin_hash')) {
      const h = await hashPassword(ADMIN_CONFIG.password);
      localStorage.setItem('kryzen_admin_hash', h);
    }
  } catch (e) {}
})();

const USERS_KEY = 'kryzen_users';
const SESSION_KEY = 'kryzen_session';

const Auth = {
  current: null,

  getUsers() {
    try { return JSON.parse(localStorage.getItem(USERS_KEY) || '[]'); } catch { return []; }
  },
  saveUsers(users) { try { localStorage.setItem(USERS_KEY, JSON.stringify(users)); } catch {} },

  async register(username, email, password) {
    if (!username || !email || !password) throw new Error('Barcha maydonlarni to'ldiring');
    if (username.length < 3) throw new Error('Login kamida 3 ta belgi');
    if (password.length < 6) throw new Error('Parol kamida 6 ta belgi');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Email noto'g'ri');
    if (username.toLowerCase() === ADMIN_CONFIG.username.toLowerCase()) throw new Error('Bu login band');

    const users = this.getUsers();
    if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) throw new Error('Bu login band');
    if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) throw new Error('Bu email band');

    const hash = await hashPassword(password);
    const newUser = {
      id: 'u-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      username, email, hash,
      name: username,
      avatar: '👤',
      role: 'user',
      joined: Date.now(),
      lastLogin: Date.now(),
      favorites: [],
      history: [],
      preferences: { theme: 'dark', language: 'uz' }
    };
    users.push(newUser);
    this.saveUsers(users);
    this.current = newUser;
    sessionStorage.setItem(SESSION_KEY, newUser.id);
    return newUser;
  },

  async login(username, password) {
    // Check admin first
    if (username === ADMIN_CONFIG.username) {
      const h = await hashPassword(password);
      const stored = localStorage.getItem('kryzen_admin_hash');
      if (h === stored) {
        const admin = { 
          id: 'admin', 
          username: ADMIN_CONFIG.username, 
          email: ADMIN_CONFIG.email,
          name: ADMIN_CONFIG.name,
          role: 'admin',
          avatar: '👑'
        };
        this.current = admin;
        sessionStorage.setItem(SESSION_KEY, 'admin');
        return admin;
      }
      throw new Error('Login yoki parol xato');
    }

    // Regular user
    const users = this.getUsers();
    const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
    if (!user) throw new Error('Login yoki parol xato');
    const h = await hashPassword(password);
    if (h !== user.hash) throw new Error('Login yoki parol xato');
    user.lastLogin = Date.now();
    this.saveUsers(users);
    this.current = user;
    sessionStorage.setItem(SESSION_KEY, user.id);
    return user;
  },

  logout() {
    this.current = null;
    sessionStorage.removeItem(SESSION_KEY);
  },

  restore() {
    try {
      const id = sessionStorage.getItem(SESSION_KEY);
      if (!id) return null;
      if (id === 'admin') {
        this.current = { 
          id: 'admin', 
          username: ADMIN_CONFIG.username,
          name: ADMIN_CONFIG.name,
          role: 'admin',
          avatar: '👑'
        };
        return this.current;
      }
      const users = this.getUsers();
      const u = users.find(x => x.id === id);
      if (u) { this.current = u; return u; }
      return null;
    } catch { return null; }
  },

  isLoggedIn() { return !!this.current; },
  isAdmin() { return this.current && this.current.role === 'admin'; },
  getCurrent() { return this.current; }
};

const API_CONFIG = {
  // 🔑 1) OPEN LIBRARY — bepul, kalit shart emas
  // Hujjat: https://openlibrary.org/developers/api
  openlibrary: {
    enabled: true,
    key: '',                    // Open Library hozircha kalit talab qilmaydi
    baseUrl: 'https://openlibrary.org/search.json',
    coverUrl: 'https://covers.openlibrary.org/b/id',
    defaultLimit: 20
  },

  // 🔑 2) GUTENDEX — bepul, kalit shart emas
  // Hujjat: https://gutendex.com/
  gutendex: {
    enabled: true,
    key: '',                    // Gutendex hozircha kalit talab qilmaydi
    baseUrl: 'https://gutendex.com/books',
    defaultLimit: 20
  },

  // 🔑 3) GOOGLE BOOKS — kalit bilan limit 1000 → 100,000 so'rov/kun
  // Kalit olish: https://console.cloud.google.com → Enable Books API → Create API Key
  googlebooks: {
    enabled: true,
    key: 'YOUR_GOOGLE_BOOKS_API_KEY_HERE',  // ← BU YERGA KALITINGIZNI QO'YING
    baseUrl: 'https://www.googleapis.com/books/v1/volumes',
    defaultLimit: 20
  },

  // 🔑 4) ISBNDB — ixtiyoriy premium API
  // Narxi: $9.99/oy (5000 qidiruv)
  // Kalit: https://isbndb.com/isbn-database-api
  // isbndb: {
  //   enabled: false,
  //   key: 'YOUR_ISBNDB_KEY',
  //   baseUrl: 'https://api2.isbndb.com/book',
  //   defaultLimit: 10
  // },

  // 🔑 5) NYTIMES BOOKS — bepul, kalit olish kerak
  // https://developer.nytimes.com/docs/books-product/1/overview
  // nytimes: {
  //   enabled: false,
  //   key: 'YOUR_NYTIMES_KEY',
  //   baseUrl: 'https://api.nytimes.com/svc/books/v3',
  //   defaultLimit: 20
  // }
};

const $ = s => { try { return document.querySelector(s); } catch { return null; } };
const $$ = s => { try { return [...document.querySelectorAll(s)]; } catch { return []; } };
const fmt = n => (n||0).toLocaleString('uz-UZ');
const esc = s => String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const Store = {
  KEY: 'kryzen_bookfinder_v1',
  KEY_CONFIG: 'kryzen_api_config',
  data: null,
  config: null,
  def() { return { theme: 'dark', favorites: [], recent: [], searchHistory: [], stats: { searches: 0, booksViewed: 0, downloads: 0 } }; },
  load() { 
    try { this.data = { ...this.def(), ...JSON.parse(localStorage.getItem(this.KEY) || '{}') }; } catch { this.data = this.def(); }
    // Load API config from localStorage or use defaults
    try {
      const stored = JSON.parse(localStorage.getItem(this.KEY_CONFIG) || '{}');
      this.config = {};
      for (const k in API_CONFIG) {
        this.config[k] = { ...API_CONFIG[k], ...(stored[k] || {}) };
      }
    } catch { 
      this.config = { ...API_CONFIG }; 
    }
    return this.data; 
  },
  save() { try { localStorage.setItem(this.KEY, JSON.stringify(this.data)); } catch {} },
  saveConfig() { 
    try { 
      const toSave = {};
      for (const k in this.config) {
        toSave[k] = { enabled: this.config[k].enabled, key: this.config[k].key };
      }
      localStorage.setItem(this.KEY_CONFIG, JSON.stringify(toSave));
    } catch {} 
  },
  getApiKey(name) { return this.config[name]?.key || ''; },
  isApiEnabled(name) { return !!this.config[name]?.enabled; }
};

// =================== API CALLER ===================
const API = {
  cache: new Map(),

  // Helper: URL ga key qo'shish
  _addKey(url, name) {
    const key = Store.getApiKey(name);
    if (!key || key.startsWith('YOUR_')) return url;
    const sep = url.includes('?') ? '&' : '?';
    if (name === 'googlebooks') return url + sep + 'key=' + encodeURIComponent(key);
    if (name === 'isbndb') return url + sep + 'apikey=' + encodeURIComponent(key);
    return url;
  },

  async openlibrary(query, opts = {}) {
    if (!Store.isApiEnabled('openlibrary')) throw new Error('Open Library disabled');
    const { page = 1, limit = 20, sort = '' } = opts;
    let url;
    if (query.kind === 'random') url = Store.config.openlibrary.baseUrl + '?q=*&sort=random&limit=' + limit + '&page=' + page;
    else if (query.q) url = Store.config.openlibrary.baseUrl + '?q=' + encodeURIComponent(query.q) + '&limit=' + limit + '&page=' + page + (sort ? '&sort=' + sort : '');
    else return [];
    const res = await fetch(url);
    if (!res.ok) throw new Error('OL fail: ' + res.status);
    const data = await res.json();
    return (data.docs || []).map(b => ({
      id: b.key || ('ol-' + (b.cover_i || Math.random())),
      title: b.title || 'Nomsiz',
      author: (b.author_name || [])[0] || 'Noma'lum',
      year: b.first_publish_year || null,
      cover: b.cover_i ? Store.config.openlibrary.coverUrl + '/' + b.cover_i + '-M.jpg' : null,
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
    if (!Store.isApiEnabled('gutendex')) throw new Error('Gutendex disabled');
    let url = Store.config.gutendex.baseUrl + '/?page=' + (opts.page || 1);
    if (query.q) url += '&search=' + encodeURIComponent(query.q);
    const res = await fetch(url);
    if (!res.ok) throw new Error('GX fail: ' + res.status);
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
    if (!Store.isApiEnabled('googlebooks')) throw new Error('Google Books disabled');
    const limit = opts.limit || 20;
    let url = Store.config.googlebooks.baseUrl + '?q=' + encodeURIComponent(query.q || '*') + '&maxResults=' + limit + '&startIndex=' + ((opts.page - 1 || 0) * limit);
    url = this._addKey(url, 'googlebooks');
    const res = await fetch(url);
    if (!res.ok) throw new Error('GB fail: ' + res.status);
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
    const order = ['openlibrary', 'gutendex', 'googlebooks'];
    for (const name of order) {
      if (!Store.isApiEnabled(name)) continue;
      try {
        const fn = this[name].bind(this);
        const r = await fn(q, opts);
        if (r && r.length) { this.cache.set(key, r); return r; }
      } catch (e) { console.warn(name, 'fail:', e.message); }
    }
    return [];
  }
};

// =================== SEARCH ===================
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

// =================== UI ===================
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

// =================== APP ===================
const App = {
  init() {
    try {
      Store.load();
      Auth.restore();
      this._updateAuthUI();
      if (Store.data.theme === 'light') document.documentElement.dataset.theme = 'light';
      this.startBg();
      this.renderHome();
      setTimeout(() => { const l = $('#loading'); if (l) l.classList.add('hide'); }, 800);
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
      admin: () => this.renderAdmin(),
      apikeys: () => this.renderApiKeys(),
      login: () => this.renderLogin(),
      register: () => this.renderRegister(),
      account: () => this.renderAccount(),
      adminUsers: () => Auth.isAdmin() ? this.renderAdminUsers() : this.renderLogin()
    };
    try { (map[page] || map.home)(); } catch (e) { console.error('go error:', e); }
  },
  renderHome() {
    const m = $('#main'); if (!m) return;
    let catsHtml = '';
    try { catsHtml = CATEGORIES.slice(0, 8).map(c => '<div class="cat-card" data-cat="' + esc(c.id) + '"><div class="cat-icon">' + c.icon + '</div><div class="cat-name">' + esc(c.name) + '</div></div>').join(''); }
    catch (e) { catsHtml = '<p style="color:var(--mut)">Kategoriyalar yuklanmadi</p>'; }
    m.innerHTML = '<h2 class="section-title">🔥 Trend kitoblar</h2><div id="homeTrend"></div><h2 class="section-title">📚 Mashhur janrlar</h2><div class="cat-grid" style="margin-bottom:30px" id="homeCats">' + catsHtml + '</div><h2 class="section-title">⭐ Top baholangan</h2><div id="homeTop"></div>';
    this._loadTrending('homeTrend');
    this._loadTrending('homeTop', 'classic best');
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
  searchCategory(catId) { try { const c = CATEGORIES.find(x => x.id === catId); if (c) Search.go(c.name); } catch {} },
  renderAuthors() {
    const m = $('#main'); if (!m) return;
    const authors = ['Dostoevsky','Tolstoy','Shakespeare','Pushkin','Asimov','Goethe','Hemingway','Twain'];
    m.innerHTML = '<h2 class="section-title">✍️ Mashhur mualliflar</h2><div class="cat-grid">' + authors.map((a, i) => '<div class="cat-card" data-author="' + esc(a) + '"><div class="cat-icon">' + ['🇷🇺','✍️','🎭','🌹','🚀','🎩','🎣','🎯'][i] + '</div><div class="cat-name">' + esc(a) + '</div></div>').join('') + '</div>';
    m.addEventListener('click', e => { const c = e.target.closest('.cat-card'); if (c && c.dataset.author) Search.go(c.dataset.author); });
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
  renderLogin() {
    const m = $('#main');
    m.innerHTML = '<h2 class="section-title">🔐 Tizimga kirish</h2><form class="contact-form" id="loginForm" style="max-width:420px;margin:0 auto"><div style="text-align:center;font-size:60px;margin-bottom:20px">🔐</div><input class="form-input" name="username" placeholder="Login" required autofocus><input class="form-input" type="password" name="password" placeholder="Parol" required><button type="submit" class="submit-btn">🔓 Kirish</button><p style="text-align:center;margin-top:20px;color:var(--mut)">Akkountingiz yo\'qmi? <a href="#" onclick="App.go(\'register\');return false" style="color:var(--neon)">Ro\'yxatdan o\'ting</a></p></form>';
    const f = $('#loginForm');
    if (f) f.addEventListener('submit', async e => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(f));
      try { 
        const u = await Auth.login(d.username, d.password);
        Toast.show('✅ Xush kelibsiz, ' + u.name + '!', 'ok');
        this._updateAuthUI();
        this.go(u.role === 'admin' ? 'admin' : 'home');
      } catch (err) { Toast.show('❌ ' + err.message, 'err'); }
    });
  },
  renderRegister() {
    const m = $('#main');
    m.innerHTML = '<h2 class="section-title">📝 Ro\'yxatdan o\'tish</h2><form class="contact-form" id="regForm" style="max-width:420px;margin:0 auto"><div style="text-align:center;font-size:60px;margin-bottom:20px">✨</div><input class="form-input" name="username" placeholder="Login (kamida 3 ta belgi) *" required><input class="form-input" type="email" name="email" placeholder="Email *" required><input class="form-input" type="password" name="password" placeholder="Parol (kamida 6 ta belgi) *" required><input class="form-input" type="password" name="password2" placeholder="Parolni tasdiqlang *" required><button type="submit" class="submit-btn">🚀 Ro\'yxatdan o\'tish</button><p style="text-align:center;margin-top:20px;color:var(--mut)">Allaqachon ro\'yxatdan o\'tganmisiz? <a href="#" onclick="App.go(\'login\');return false" style="color:var(--neon)">Kirish</a></p></form>';
    const f = $('#regForm');
    if (f) f.addEventListener('submit', async e => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(f));
      if (d.password !== d.password2) return Toast.show('❌ Parollar mos kelmadi', 'err');
      try { 
        const u = await Auth.register(d.username, d.email, d.password);
        Toast.show('✅ Muvaffaqiyatli ro\'yxatdan o\'tdingiz!', 'ok');
        this._updateAuthUI();
        this.go('home');
      } catch (err) { Toast.show('❌ ' + err.message, 'err'); }
    });
  },
  renderAccount() {
    const m = $('#main');
    const u = Auth.getCurrent();
    if (!u) { this.renderLogin(); return; }
    const favs = u.favorites || [];
    m.innerHTML = '<h2 class="section-title">👤 Mening profilim</h2><div class="admin-card" style="text-align:center"><div style="font-size:80px;margin-bottom:10px">' + (u.avatar || '👤') + '</div><h3>' + esc(u.name || u.username) + '</h3><p style="color:var(--mut)">@' + esc(u.username) + '</p><p style="color:var(--mut);font-size:13px">' + esc(u.email || '—') + '</p><p style="color:var(--mut);font-size:12px;margin-top:8px">Qo\'shilgan: ' + new Date(u.joined || Date.now()).toLocaleDateString('uz-UZ') + '</p></div><div class="admin-card"><h3>📊 Statistika</h3><div class="stat-grid"><div class="stat-item"><div class="stat-value">' + fmt(favs.length) + '</div><div class="stat-label">Sevimlilar</div></div><div class="stat-item"><div class="stat-value">' + fmt((u.history || []).length) + '</div><div class="stat-label">Qidiruvlar</div></div></div></div><div class="admin-card"><button class="action-btn" id="logoutBtn" style="background:var(--err);color:#fff">🚪 Chiqish</button></div>';
    const b = $('#logoutBtn');
    if (b) b.addEventListener('click', () => { Auth.logout(); this._updateAuthUI(); Toast.show('Chiqdingiz'); this.go('home'); });
  },
  _updateAuthUI() {
    const nav = $('#authNav');
    if (!nav) return;
    const u = Auth.getCurrent();
    if (u) {
      nav.innerHTML = '<a class="nav-link" onclick="App.go(\'account\')">👤 ' + esc(u.username) + '</a>' + (u.role === 'admin' ? '<a class="nav-link" onclick="App.go(\'admin\')">⚙️</a>' : '') + '<a class="nav-link" onclick="App.doLogout()" style="color:var(--err)">🚪</a>';
    } else {
      nav.innerHTML = '<a class="nav-link" onclick="App.go(\'login\')">🔐 Kirish</a><a class="nav-link" onclick="App.go(\'register\')">📝</a>';
    }
  },
  doLogout() { Auth.logout(); this._updateAuthUI(); Toast.show('Chiqdingiz'); this.go('home'); },
  renderAdminUsers() {
    const m = $('#main');
    const users = Auth.getUsers();
    let h = '<h2 class="section-title">👥 Foydalanuvchilar (' + users.length + ')</h2>';
    h += '<div class="admin-card" style="overflow-x:auto"><table style="width:100%;border-collapse:collapse"><thead><tr style="border-bottom:1px solid var(--bord)"><th style="padding:10px;text-align:left">#</th><th style="padding:10px;text-align:left">Login</th><th style="padding:10px;text-align:left">Email</th><th style="padding:10px;text-align:left">Sana</th><th style="padding:10px;text-align:left">Amal</th></tr></thead><tbody>';
    if (users.length === 0) h += '<tr><td colspan="5" style="padding:20px;text-align:center;color:var(--mut)">Hozircha foydalanuvchi yo\'q</td></tr>';
    users.forEach((u, i) => {
      h += '<tr style="border-bottom:1px solid var(--bord)"><td style="padding:10px">' + (i+1) + '</td><td style="padding:10px">' + esc(u.username) + '</td><td style="padding:10px">' + esc(u.email) + '</td><td style="padding:10px">' + new Date(u.joined).toLocaleDateString('uz-UZ') + '</td><td style="padding:10px"><button class="action-btn" data-del="' + esc(u.id) + '" style="padding:4px 10px;background:var(--err);color:#fff;font-size:12px">🗑</button></td></tr>';
    });
    h += '</tbody></table></div>';
    h += '<p style="margin-top:14px;padding:12px;background:var(--glass);border-radius:10px;color:var(--mut);font-size:13px">⚠️ Foydalanuvchilar ma\'lumotlari har bir foydalanuvchining o\'z brauzerida saqlanadi (localStorage). Bu demo rejim. To\'liq ishlashi uchun backend kerak.</p>';
    m.innerHTML = h;
    m.addEventListener('click', e => { const b = e.target.closest('[data-del]'); if (b && confirm('O\'chirilsinmi?')) { const id = b.dataset.del; const u = Auth.getUsers().filter(x => x.id !== id); Auth.saveUsers(u); Toast.show('O\'chirildi', 'ok'); this.renderAdminUsers(); } });
  },
    renderAdmin() {
    const s = Store.data.stats || {};
    $('#main').innerHTML = '<h2 class="section-title">⚙️ Admin panel</h2><div class="admin-card"><h3>📊 Statistika</h3><div class="stat-grid"><div class="stat-item"><div class="stat-value">' + fmt(s.searches || 0) + '</div><div class="stat-label">Qidiruvlar</div></div><div class="stat-item"><div class="stat-value">' + fmt(s.booksViewed || 0) + '</div><div class="stat-label">Ko\'rilgan</div></div><div class="stat-item"><div class="stat-value">' + fmt((Store.data.favorites || []).length) + '</div><div class="stat-label">Sevimlilar</div></div></div></div><div class="admin-card"><h3>🛠 Sozlamalar</h3><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="action-btn" id="apikeysBtn">🔑 API kalitlar</button><button class="action-btn" id="clearCacheBtn">🗑 Cache tozalash</button><button class="action-btn" id="resetBtn">♻️ Barcha ma\'lumotlarni tozalash</button></div></div><div class="admin-card"><h3>🌐 API holati</h3><div id="apiStatusList"></div></div>';
    const b1 = $('#apikeysBtn'); if (b1) b1.addEventListener('click', () => this.renderApiKeys());
    const b2 = $('#clearCacheBtn'); if (b2) b2.addEventListener('click', () => { API.cache.clear(); Toast.show('Cache tozalandi', 'ok'); this.renderAdmin(); });
    const b3 = $('#resetBtn'); if (b3) b3.addEventListener('click', () => { if (confirm('Barcha ma\'lumotlar o\'chirilsinmi?')) { localStorage.clear(); location.reload(); } });
    this._renderApiStatus();
  },
  _renderApiStatus() {
    const list = $('#apiStatusList'); if (!list) return;
    let h = '';
    for (const name in Store.config) {
      const c = Store.config[name];
      const hasKey = c.key && !c.key.startsWith('YOUR_');
      h += '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--bord)"><span><strong>' + name + '</strong> ' + (c.enabled ? '✅' : '❌') + ' ' + (hasKey ? '🔑' : '—') + '</span></div>';
    }
    list.innerHTML = h;
  },
  renderApiKeys() {
    const m = $('#main');
    let h = '<h2 class="section-title">🔑 API kalitlari</h2>';
    h += '<p style="color:var(--mut);margin-bottom:20px;padding:14px;background:var(--glass);border-radius:10px">Kalitlarni shu yerda o\'zgartirishingiz yoki <code>app.js</code> faylida <code>API_CONFIG</code> obyektida ham o\'zgartirishingiz mumkin. O\'zgarishlar faqat sizning brauzeringizda saqlanadi (localStorage).</p>';
    h += '<form id="apiKeysForm">';
    for (const name in Store.config) {
      const c = Store.config[name];
      h += '<div class="admin-card"><h3>' + name + '</h3>';
      h += '<label style="display:flex;align-items:center;gap:8px;margin:10px 0"><input type="checkbox" name="enabled_' + name + '" ' + (c.enabled ? 'checked' : '') + '> <span>Faollashtirish</span></label>';
      h += '<div style="margin:10px 0"><label style="display:block;font-size:12px;color:var(--mut);margin-bottom:4px">API Key:</label><input class="form-input" type="text" name="key_' + name + '" value="' + esc(c.key) + '" placeholder="Kalitni shu yerga kiriting"></div>';
      h += '<div style="font-size:11px;color:var(--mut)">URL: <code>' + esc(c.baseUrl) + '</code></div>';
      h += '</div>';
    }
    h += '<button type="submit" class="submit-btn" style="margin-top:20px">💾 Saqlash</button></form>';
    m.innerHTML = h;
    const f = $('#apiKeysForm');
    if (f) f.addEventListener('submit', e => {
      e.preventDefault();
      for (const name in Store.config) {
        Store.config[name].enabled = !!f.querySelector('[name="enabled_' + name + '"]').checked;
        Store.config[name].key = f.querySelector('[name="key_' + name + '"]').value.trim();
      }
      Store.saveConfig();
      API.cache.clear();
      Toast.show('✅ API kalitlar saqlandi!', 'ok');
      this.renderAdmin();
    });
  },
  showDetail(book) {
    try {
      Store.data.recent = [book, ...(Store.data.recent || []).filter(b => b.id !== book.id)].slice(0, 20);
      Store.data.stats.booksViewed++; Store.save();
      const isFav = (Store.data.favorites || []).some(b => b.id === book.id);
      const formats = book.formats && book.formats.length ? book.formats : [];
      const html = '<button class="modal-close" onclick="Modal.close()">✕</button><div class="detail"><div class="detail-cover">' + (book.cover ? '<img src="' + esc(book.cover) + '" alt="' + esc(book.title) + '" onerror="this.parentElement.textContent=\'📖\'">' : '📖') + '</div><div class="detail-content"><h2>' + esc(book.title) + '</h2><div class="detail-author">✍️ ' + esc(book.author || '—') + (book.year ? ' · ' + book.year : '') + '</div><div class="detail-meta"><div class="meta-item"><div class="meta-label">Nashriyot</div><div class="meta-value">' + esc(book.publisher || '—') + '</div></div><div class="meta-item"><div class="meta-label">Til</div><div class="meta-value">' + esc((book.language || '—').toString().toUpperCase()) + '</div></div><div class="meta-item"><div class="meta-label">Sahifalar</div><div class="meta-value">' + esc(book.pages || '—') + '</div></div><div class="meta-item"><div class="meta-label">ISBN</div><div class="meta-value">' + esc(book.isbn || '—') + '</div></div><div class="meta-item"><div class="meta-label">Reyting</div><div class="meta-value">' + (book.rating ? '⭐ ' + book.rating.toFixed(1) : '—') + '</div></div><div class="meta-item"><div class="meta-label">Manba</div><div class="meta-value">' + esc(book.source || 'Open Library') + '</div></div></div>' + (book.description ? '<div class="detail-desc">' + esc(book.description).slice(0, 500) + (book.description.length > 500 ? '...' : '') + '</div>' : '') + (book.subject && book.subject.length ? '<div style="margin-bottom:14px"><strong style="color:var(--neon)">Janrlar:</strong> ' + book.subject.slice(0, 5).map(s => '<span class="filter-chip" style="margin-right:6px">' + esc(s) + '</span>').join('') + '</div>' : '') + '<div class="detail-actions">' + (formats.length ? '<button class="action-btn primary" onclick="App.read()">📖 O\'qish</button>' : '') + '<button class="action-btn" onclick="App.share(\'' + esc(book.title).replace(/'/g, "") + '\')">📤 Ulashish</button><button class="action-btn" onclick="App.copyLink()">📋 Nusxalash</button><button class="action-btn" id="favBtn" style="color:' + (isFav ? 'var(--err)' : 'inherit') + '">' + (isFav ? '❤️' : '🤍') + '</button><button class="action-btn" onclick="App.qr()">📱 QR</button></div>' + (formats.length ? '<h3 style="margin:24px 0 12px;font-size:16px">📥 Yuklab olish</h3><div class="dl-formats">' + formats.slice(0, 6).map(f => '<div class="dl-fmt" data-url="' + esc(typeof f === 'string' ? f : f.url || '') + '"><div class="ftype">' + esc((typeof f === 'string' ? 'FILE' : (f.type || 'FILE')).toString().toUpperCase()) + '</div><div class="fsize">Yuklab olish</div></div>').join('') + '</div>' : book.previewLink ? '<h3 style="margin:24px 0 12px;font-size:16px">📥 Yuklab olish</h3><div style="padding:14px;background:var(--glass);border-radius:10px"><button class="action-btn primary" onclick="window.open(\'' + esc(book.previewLink) + '\',\'_blank\')">👁 Preview</button><button class="action-btn" onclick="window.open(\'' + esc(book.infoLink || '#') + '\',\'_blank\')">ℹ️ Batafsil</button></div>' : '<p style="margin-top:14px;padding:14px;background:var(--glass);border-radius:10px;color:var(--mut);font-size:13px">Ushbu kitobni yuklab olish mumkin emas.</p>') + '<div id="readerArea" style="margin-top:20px"></div></div></div>';
      Modal.open(html);
      const favBtn = $('#favBtn');
      if (favBtn) favBtn.addEventListener('click', () => this.toggleFav(book));
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
document.addEventListener('DOMContentLoaded', () => {
  const m = $('#modal'); if (m) m.addEventListener('click', e => { if (e.target.id === 'modal') Modal.close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') Modal.close(); });
});

const Toast = { show(m, t) { try { const z = $('#toastZone'); if (!z) return; const x = document.createElement('div'); x.className = 'toast ' + (t || ''); x.textContent = m; z.appendChild(x); setTimeout(() => { try { x.remove(); } catch {} }, 2800); } catch {} } };

document.addEventListener('DOMContentLoaded', () => {
  const inp = $('#searchInput');
  if (inp) inp.addEventListener('keydown', e => { if (e.key === 'Enter') Search.go(); });
  App.init();
});
