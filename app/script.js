document.addEventListener('DOMContentLoaded', function () {
 
  // ── API BASE ───────────────────────────────────
  // Якщо застосунок працює на тому ж PHP-хості — залишити ''
  // Для окремого API-сервера вкажіть, наприклад: 'https://api.example.com'
  const API_BASE = '';
 
  // ── ДОПОМІЖНІ ФУНКЦІЇ API ────────────────────────────────
  async function apiPost(endpoint, body) {
    const r = await fetch(API_BASE + endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return r.json();
  }
 
  async function apiGet(endpoint) {
    const r = await fetch(API_BASE + endpoint);
    return r.json();
  }
 
  async function apiDelete(endpoint, body) {
    const r = await fetch(API_BASE + endpoint, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return r.json();
  }
 
  // Відправка нотатки в базу даних
  // - Якщо dbId ще немає → POST create.php (створення нового запису)
  // - Якщо dbId вже є → POST create.php з цим ID (оновлення)
  // Повертає dbId від сервера при успіху або null при помилці
  async function syncNoteToDb(note) {
    try {
      const payload = {
        title:     note.title,
        content:   note.content,
        read_once: note.readOnce || false,
        expire_in: note.expireIn || null,   // секунди; null = без обмеження терміну
        password:  note.passwordPlain || '', // хешується на стороні сервера
      };
	  
	  if (note.editToken) {
        payload.edit_token = note.editToken;
      }
	  
      if (note.dbId) payload.id = note.dbId;
 
      const res = await apiPost('create.php', payload);
      if (res.ok && res.id) {
        note.editToken = res.edit_token; // зберігаємо токен
        return res.id;
      }
      console.error('syncNoteToDb failed:', res);
      return null;
    } catch (err) {
      console.error('syncNoteToDb error:', err);
      return null;
    }
  }
 
  // ── ДАНІ МОВ ПРОГРАМУВАННЯ ──────────────────────────────
  const LANGUAGES = [
    'ABAP','ActionScript','Ada','AppleScript','Arduino','Assembly','AutoHotkey','AWK',
    'Bash','BASIC','Batch','Brainfuck',
    'C','C#','C++','Clojure','CMake','COBOL','CoffeeScript','Crystal','CSS',
    'D','Dart','Delphi','Dockerfile',
    'Elixir','Elm','Erlang',
    'F#','Fortran',
    'Go','Groovy',
    'Handlebars','Haskell','Haxe','HTML',
    'Java','JavaScript','JSON','Julia',
    'Kotlin',
    'LaTeX','Less','Lisp','Lua',
    'Markdown','MATLAB',
    'Nim','Nix',
    'Objective-C','OCaml',
    'Pascal','Perl','PHP','PowerShell','Prolog','Protobuf','Python',
    'R','Racket','Ruby','Rust',
    'Sass','Scala','Shell','Solidity','SQL','Swift',
    'Tcl','Terraform','TOML','TypeScript',
    'V','Verilog','VHDL','VimScript',
    'WebAssembly','XML','YAML','Zig'
  ];
 
  const LANG_ID = {
    'C#':'csharp','C++':'cpp','Objective-C':'objectivec','Shell':'bash','Batch':'dos',
    'AppleScript':'applescript','Assembly':'x86asm','AutoHotkey':'autohotkey',
    'CMake':'cmake','COBOL':'cobol','CoffeeScript':'coffeescript','Dockerfile':'dockerfile',
    'Elixir':'elixir','Elm':'elm','Erlang':'erlang','Fortran':'fortran','Groovy':'groovy',
    'Handlebars':'handlebars','Haskell':'haskell','Haxe':'haxe','Julia':'julia',
    'Kotlin':'kotlin','LaTeX':'latex','Less':'less','Lisp':'lisp','Lua':'lua',
    'MATLAB':'matlab','Nim':'nim','Nix':'nix','OCaml':'ocaml','Pascal':'delphi',
    'Prolog':'prolog','Protobuf':'protobuf','Racket':'lisp','Solidity':'solidity',
    'Tcl':'tcl','Terraform':'hcl','Verilog':'verilog','VHDL':'vhdl','VimScript':'vim',
    'WebAssembly':'wasm','Zig':'zig','F#':'fsharp','Crystal':'crystal','Dart':'dart',
    'V':'v','ActionScript':'actionscript','D':'d','Brainfuck':'brainfuck'
  };
 
  function getLangId(name) {
    return LANG_ID[name] || name.toLowerCase().replace(/[^a-z0-9]/g, '');
  }
 
  // ── СТАН ─────────────────────────────
  // Кожен об’єкт нотатки:
  //   id            — локальний UUID (використовується як ключ у sidebar та редакторі)
  //   dbId          — ID від сервера (hex), встановлюється після першої синхронізації; використовується в посиланнях
  //   title, content, createdAt, updatedAt, pinned
  //   readOnce      — bool
  //   expireIn      — час у секундах (null = без обмеження); зберігається для повторної відправки в API
  //   expireAt      — timestamp JS (мс) для локального відображення таймера
  //   password      — відкритий текст (показується у share modal, очищається після синхронізації)
  //   passwordPlain — те саме, що password; використовується тільки під час syncNoteToDb
  //   passwordSet   — bool: чи має нотатка пароль на сервері
  let notes            = JSON.parse(localStorage.getItem('nc_notes') || '[]');
  let activeId         = null;
  let autosaveTimer    = null;
  let deleteTarget     = null;
  let ctxTarget        = null;
  let previewVisible   = true;
  let langDropdownOpen = false;
  let passwordTarget   = null;
  let sharedNoteDbId   = null;   // встановлюється при показі запиту пароля для shared нотатки
  let currentTheme     = localStorage.getItem('nc_theme') || 'dark';
 
  // ── ДОПОМІЖНІ ФУНКЦІЇ ──────────────────────────
  function generateId() {
    return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
  }
 
  function formatDate(ts) {
    const d = new Date(ts), now = new Date(), diff = now - d;
    if (diff < 60000)    return 'щойно';
    if (diff < 3600000)  return Math.floor(diff / 60000) + 'хв тому';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'год тому';
    return d.toLocaleDateString('uk-UA', { month: 'short', day: 'numeric' });
  }
 
 function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text);
  } else {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}
 
  function escHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
 
// Збереження нотаток у localStorage (завжди). Синхронізація з БД виконується окремо через syncNoteToDb()  function saveNotes() {
    const clean = notes.map(function (n) {
      const c = Object.assign({}, n);
      delete c.passwordPlain;   // ніколи не зберігати пароль у відкритому вигляді в localStorage
      return c;
    });
    localStorage.setItem('nc_notes', JSON.stringify(clean));
  }
 
  function getNote(id) {
    return notes.find(function (n) { return n.id === id; });
  }
 
  // Повертає публічне посилання для нотатки, яка синхронізована з БД
  // Веде на shared.php, який редіректить на index.html?share=<dbId>
  // після чого клієнт отримує дані через view.php
  function shareUrl(note) {
    var base = location.origin + location.pathname.replace(/\/[^\/]*$/, '');
    var id   = note.dbId || '';
    return base + '/shared.php?id=' + encodeURIComponent(id);
  }
 
  // ── СПОВІЩЕННЯ ──────────────────────────────────────
  function toast(msg, type) {
    type = type || 'info';
    const c = document.getElementById('toastContainer');
    const t = document.createElement('div');
    t.className = 'toast ' + type;
    const icons = { success: 'ic-check', error: 'ic-warning', info: 'ic-note' };
    const iconId = icons[type] || 'ic-note';
    t.innerHTML = '<span class="icon" style="width:14px;height:14px;flex-shrink:0"><svg><use href="#' + iconId + '"/></svg></span>' + escHtml(msg);
    c.appendChild(t);
    setTimeout(function () {
      t.style.opacity = '0';
      t.style.transform = 'translateY(8px)';
      t.style.transition = '.3s';
      setTimeout(function () { t.remove(); }, 300);
    }, 2800);
  }
 
  // ── ТЕМА ──────────────────────────────────────
  function applyTheme(t) {
    currentTheme = t;
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem('nc_theme', t);
    document.getElementById('hlTheme').href = t === 'dark'
      ? 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/tokyo-night-dark.min.css'
      : 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css';
    const themeIcon = document.getElementById('themeIcon');
    themeIcon.innerHTML = '<svg><use href="' + (t === 'dark' ? '#ic-moon' : '#ic-sun') + '"/></svg>';
    // перерендерити прев’ю з новими кольорами підсвітки
    const note = getNote(activeId);
    if (note) updatePreview(note.content);
  }
 
  // застосувати збережену тему одразу (DOM вже завантажений)
  applyTheme(currentTheme);
 
  document.getElementById('themeToggleLabel').addEventListener('click', function () {
    applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
  });
 
  // ── ПОПЕРЕДНІЙ ПЕРЕГЛЯД ────────────────────────────────────
  marked.setOptions({ breaks: true, gfm: true });
 
  function updatePreview(md) {
    const out = document.getElementById('previewContent');
    const raw = marked.parse(md || '');
    out.innerHTML = DOMPurify.sanitize(raw);
    out.querySelectorAll('pre code').forEach(function (block) {
      hljs.highlightElement(block);
      const pre  = block.parentElement;
      const lang = (block.className.match(/language-(\w+)/) || [])[1] || '';
      if (lang) {
        const lbl = document.createElement('span');
        lbl.className = 'code-lang-label';
        lbl.textContent = lang;
        pre.appendChild(lbl);
      }
      const copyBtn = document.createElement('button');
      copyBtn.className   = 'copy-code-btn';
      copyBtn.textContent = 'Копіювати';
      copyBtn.onclick = function () {
        navigator.clipboard.writeText(block.textContent);
        copyBtn.textContent = 'Скопійовано!';
        setTimeout(function () { copyBtn.textContent = 'Копіювати'; }, 1500);
      };
      pre.appendChild(copyBtn);
    });
  }
 
  // ── ВИПАДАЮЧИЙ СПИСОК МОВ ──────────────────────────
  function buildLangList(filter) {
    filter = filter || '';
    const list = document.getElementById('langList');
    const filtered = filter
      ? LANGUAGES.filter(function (l) { return l.toLowerCase().indexOf(filter.toLowerCase()) !== -1; })
      : LANGUAGES;
    if (!filtered.length) {
      list.innerHTML = '<div style="padding:14px;text-align:center;color:var(--text3);font-size:12px">Нічого не знайдено</div>';
      return;
    }
    const grouped = {};
    filtered.forEach(function (l) {
      const k = l[0].toUpperCase();
      if (!grouped[k]) grouped[k] = [];
      grouped[k].push(l);
    });
    const letters = Object.keys(grouped).sort();
    let html = '';
    letters.forEach(function (letter) {
      if (!filter) html += '<div class="lang-group-header">' + letter + '</div>';
      grouped[letter].forEach(function (l) {
        html += '<div class="lang-item" data-lang="' + getLangId(l) + '">' + escHtml(l) + '</div>';
      });
    });
    list.innerHTML = html;
    list.querySelectorAll('.lang-item').forEach(function (item) {
      item.addEventListener('click', function () {
        insertCodeBlock(item.getAttribute('data-lang'));
        closeLangDropdown();
      });
    });
  }
 
  function openLangDropdown() {
    document.getElementById('langDropdown').classList.add('open');
    document.getElementById('langSearch').value = '';
    buildLangList('');
    document.getElementById('langSearch').focus();
    langDropdownOpen = true;
  }
 
  function closeLangDropdown() {
    document.getElementById('langDropdown').classList.remove('open');
    langDropdownOpen = false;
  }
 
  document.getElementById('langTrigger').addEventListener('click', function (e) {
    e.stopPropagation();
    if (langDropdownOpen) { closeLangDropdown(); } else { openLangDropdown(); }
  });
 
  document.getElementById('langSearch').addEventListener('input', function (e) {
    buildLangList(e.target.value);
  });
 
  // ── sidebar ─────────────────────────────
  function renderSidebar(filter) {
    filter = filter || '';
    const list = document.getElementById('notesList');
    let visible = notes.slice().sort(function (a, b) {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return b.updatedAt - a.updatedAt;
    });
    if (filter) {
      visible = visible.filter(function (n) {
        return (n.title + ' ' + n.content).toLowerCase().indexOf(filter.toLowerCase()) !== -1;
      });
    }
    if (!visible.length) {
      list.innerHTML = '<div class="no-notes"><div class="no-notes-icon"><span class="icon" style="width:24px;height:24px"><svg><use href="#ic-note"/></svg></span></div>' + (filter ? 'Нотаток не знайдено' : 'Нотаток ще немає') + '</div>';
      return;
    }
    let html = '';
    visible.forEach(function (n) {
      const isActive = n.id === activeId;
      html += '<div class="note-item' + (isActive ? ' active' : '') + '" data-id="' + escHtml(n.id) + '">'
        + '<span class="note-icon"><span class="icon" style="width:14px;height:14px"><svg><use href="#ic-note"/></svg></span></span>'
        + '<div class="note-item-body">'
        + '<div class="note-item-title">' + (n.pinned ? '<span style="color:var(--yellow)">▲ </span>' : '') + escHtml(n.title || 'Без назви') + '</div>'
        + '<div class="note-item-meta">'
        + '<span class="note-date">' + formatDate(n.updatedAt) + '</span>'
        + (n.readOnce ? '<span class="tag-temp">Одноразова</span>' : '')
        + (n.expireAt  ? '<span class="tag-temp">Тимчас.</span>' : '')
        + (n.password  ? '<span class="tag-pass">Захищена</span>' : '')
        + '</div></div>'
        + '<div class="note-item-actions">'
        + '<button class="note-pin-btn' + (n.pinned ? ' pinned' : '') + '" data-pin="' + escHtml(n.id) + '" title="Закріпити">'
        + '<span class="icon" style="width:11px;height:11px"><svg><use href="#ic-pin"/></svg></span></button>'
        + '<button class="note-del-btn" data-del="' + escHtml(n.id) + '" title="Видалити">'
        + '<span class="icon" style="width:11px;height:11px"><svg><use href="#ic-trash"/></svg></span></button>'
        + '</div></div>';
    });
    list.innerHTML = html;
 
    list.querySelectorAll('.note-item').forEach(function (el) {
      el.addEventListener('click', function (e) {
        if (e.target.closest('[data-del]') || e.target.closest('[data-pin]')) return;
        openNote(el.getAttribute('data-id'));
      });
      el.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        showCtxMenu(e, el.getAttribute('data-id'));
      });
    });
    list.querySelectorAll('[data-del]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        promptDelete(btn.getAttribute('data-del'));
      });
    });
    list.querySelectorAll('[data-pin]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        togglePin(btn.getAttribute('data-pin'));
      });
    });
  }
 
  // ── ВІДОБРАЖЕННЯ РЕДАКТОРА ТА READ-ONLY ──────────────
  function setReadOnly(isReadOnly) {
    var app    = document.getElementById('app');
    var banner = document.getElementById('readonlyBanner');

    var title   = document.getElementById('noteTitle');
    var content = document.getElementById('noteContent');

    if (isReadOnly) {
      app.classList.add('editor-readonly');
      banner.classList.remove('hidden');

      title.readOnly = true;
      content.readOnly = true;

    } else {
      app.classList.remove('editor-readonly');
      banner.classList.add('hidden');

      title.readOnly = false;
      content.readOnly = false;
    }
  }

 
  function showEditor(note) {
    document.getElementById('noteTitle').style.display   = '';
    document.getElementById('noteContent').style.display = '';
    document.getElementById('emptyState').style.display  = 'none';
    document.getElementById('noteTitle').value   = note.title;
    document.getElementById('noteContent').value = note.content;
    // Блокуємо редактор, якщо нотатка вже синхронізована з БД
    // Користувач може читати локально, але не редагувати
    // щоб уникнути розбіжностей з серверною версією
    setReadOnly(!!note.shared);
  }
 
  // Відображення спільної нотатки в режимі тільки для читання
  // Локальний об'єкт не використовується; activeId = null
  function showSharedEditor(title, content) {
    document.getElementById('noteTitle').style.display   = '';
    document.getElementById('noteContent').style.display = '';
    document.getElementById('emptyState').style.display  = 'none';
    document.getElementById('noteTitle').value   = title;
    document.getElementById('noteContent').value = content;
    setReadOnly(true);
  }
 
  function clearEditor() {
    activeId = null;
    document.getElementById('noteTitle').style.display   = 'none';
    document.getElementById('noteContent').style.display  = 'none';
    document.getElementById('emptyState').style.display   = '';
    document.getElementById('previewContent').innerHTML   = '';
    document.getElementById('tempBanner').classList.add('hidden');
    setReadOnly(false);
    updateToolbarStates();
  }
 
  function updateTempBanner(note) {
    const banner = document.getElementById('tempBanner');
    const label  = document.getElementById('tempBannerText');
    const parts  = [];
    if (note.readOnce) parts.push('Тимчасова нотатка — видаляється після першого перегляду');
    if (note.expireAt) {
      const rem = note.expireAt - Date.now();
      if (rem > 0) {
        const h = Math.floor(rem / 3600000);
        const m = Math.floor((rem % 3600000) / 60000);
        parts.push('закінчується через ' + h + 'год ' + m + 'хв');
      }
    }
    if (parts.length) {
      label.textContent = parts.join(' · ');
      banner.classList.remove('hidden');
    } else {
      banner.classList.add('hidden');
    }
  }
 
  // ── ПЕРЕВІРКА ІСНУВАННЯ В БД ────────────────────
  // Для нотаток, які вже опубліковані на сервері (note.dbId встановлений),
  // викликаємо view.php, щоб перевірити, чи запис ще існує.
  //
  // Побічний ефект: для read-once нотаток БЕЗ пароля view.php видалить запис
  // під час цього запиту. Це очікувана поведінка — перевірка і є читанням,
  // тому окремий DELETE виклик не потрібен.
  //
  // Повертає:
  //   'ok'       – запис доступний (read-once вже видалені на сервері)
  //   'gone'     – запис вже видалений або протермінований
  //   'password' – запис існує, але вимагає пароль
  //   'error'    – помилка мережі/сервера; виклик має обробити як fail-open
  async function checkNoteExistsOnServer(dbId) {
    try {
      const res = await apiGet('view.php?id=' + encodeURIComponent(dbId));
  
      if (!res || typeof res !== 'object') return 'error';
  
      // destroyed:true означає, що view.php щойно віддав нотатку І видалив її —
      // дані були валідні та використані в цьому запиті → вважаємо як 'ok',
      // щоб клієнт міг показати її з локального кешу і потім видалити локально.
      // НЕ повертати 'gone' — 'gone' означає, що ми запізнились.
      if (res.destroyed === true) return 'ok';
  
      if (res.error === 'password_required') {
        return 'password';
      }
  
      if (
        res.error === 'Note not found or has been deleted' ||
        res.error === 'Note has expired'
      ) {
        return 'gone';
      }
  
      if (res.error) return 'gone';
  
      return 'ok';
  
    } catch (e) {
      console.warn('checkNoteExistsOnServer error', e);
      return 'error';
    }
  }
 
  // видаляє нотатку з локального стану та коректно оновлює інтерфейс
  function purgeLocalNote(id) {
    notes = notes.filter(function (n) { return n.id !== id; });
    saveNotes();
    if (activeId === id) clearEditor();
    renderSidebar(document.getElementById('searchInput').value);
  }
 
  // ── CRUD для нотатки ──────────────────────────────────
  function newNote() {
    var note = {
      id: generateId(), title: '', content: '',
      createdAt: Date.now(), updatedAt: Date.now(),
      readOnce: false, expireIn: null, expireAt: null,
      password: '', passwordSet: false, pinned: false,
      dbId: null,   // заповнюється лише коли користувач явно поширює нотатку через "Apply & Generate Link"
	  editToken: null,
    };
    notes.unshift(note);
    saveNotes();
    openNote(note.id, true);
    renderSidebar('');
    document.getElementById('noteTitle').focus();
  }
 
  async function openNote(id, skipCheck) {
	// skipCheck=true допустимий лише для нових нотаток (ще без dbId).
	// Він НЕ повинен обходити перевірку сервера для нотаток, що вже мають dbId.
    var skipServer = skipCheck === true;
    var note = getNote(id);
    if (!note) return;

    // ── 1. Локальна перевірка терміну дії ───────────────────────────────────────────────
    if (note.expireAt && Date.now() > note.expireAt) {
      purgeLocalNote(id);
      toast('Нотатка застаріла', 'info');
      return;
    }

    // ── 2. Перевірка на сервері — обов’язкова для кожної нотатки з dbId ────────
    // Виконується ДО перевірки локального пароля, щоб сервер міг повідомити,
    // чи нотатку вже було використано на іншому пристрої (read-once) або видалено.
    // Пропускається лише якщо dbId ще відсутній (нова, ще не синхронізована).
    if (!skipServer && note.dbId) {
      var status = await checkNoteExistsOnServer(note.dbId);

      // Збій мережі — заборонити доступ; ніколи не показувати застарілий локальний контент
      if (status === 'error') {
        toast('Не вдалося перевірити нотатку на сервері. Перевірте зʼєднання.', 'error');
        return;
      }

      // Нотатка більше не існує на сервері
      if (status === 'gone') {
        purgeLocalNote(id);
        toast('Нотатку не знайдено або її вже видалено', 'error');
        return;
      }

      // Сервер вимагає пароль
      if (status === 'password') {
        if (note.readOnce) {
		// read-once + password_required: нотатка могла вже бути використана деінде.
		// Ніколи не запитувати повторно — вважати видаленою, щоб уникнути повторного доступу.
          purgeLocalNote(id);
          toast('Нотатку вже видалено', 'info');
          return;
        }
        // Звичайна нотатка з паролем — перейти до локальної перевірки нижче
      }

      // status === 'ok' → нотатка підтверджена на сервері.
	  // Для read-once нотаток запис на сервері видаляється цим GET-запитом.
    }

    // ── 3. Локальна перевірка пароля ──────────────────────────────────────────────
    // Виконується лише якщо сервер підтвердив існування нотатки (або немає dbId).
    if (note.password && !note._unlocked) {
      promptPassword(id);
      return;
    }

    // ── 4. Read-once: показати контент і потім видалити локальну копію ────────────────────
    if (note.readOnce && !skipServer) {
      activeId = id;
      showEditor(note);
      updatePreview(note.content);
      updateTempBanner({ readOnce: true, expireAt: note.expireAt });
      updateToolbarStates();
      notes = notes.filter(function (n) { return n.id !== id; });
      saveNotes();
      renderSidebar(document.getElementById('searchInput').value);
      toast('Одноразова нотатка — видалено з бази даних. Вміст доступний лише в поточному сеансі.', 'info');
      return;
    }

    // ── 5. Звичайне відкриття ──────────────────────────────────────────────────────
    activeId = id;
    showEditor(note);
    updatePreview(note.content);
    updateTempBanner(note);
    updateToolbarStates();
    renderSidebar(document.getElementById('searchInput').value);
  }
 
  function togglePin(id) {
    const note = getNote(id);
    if (!note) return;
    note.pinned = !note.pinned;
    saveNotes();
    renderSidebar(document.getElementById('searchInput').value);
    toast(note.pinned ? 'Нотатку закріплено' : 'Нотатку відкріплено', 'info');
  }
 
  function promptDelete(id) {
    deleteTarget = id;
    document.getElementById('deleteModal').classList.add('open');
  }
 
  function deleteNote(id) {
    var note = getNote(id);
    var dbId = note ? note.dbId : null;
    notes = notes.filter(function (n) { return n.id !== id; });
    if (activeId === id) clearEditor();
    saveNotes();
    renderSidebar(document.getElementById('searchInput').value);
    toast('Нотатку видалено', 'info');
    // Спроба видалення з БД (best-effort)
    if (dbId) {
      apiDelete('delete.php', { id: dbId, edit_token: note.editToken }).catch(function () {});
    }
  }
 
  // ── АВТОЗБЕРЕЖЕННЯ ─────────────────────────────
  // Кожна нотатка з вмістом автоматично синхронізується з БД,
  // щоб посилання працювали на будь-якому пристрої без відкриття share modal.
  //   - Немає dbId           → створюємо запис, зберігаємо отриманий dbId
  //   - Є dbId, не shared    → оновлюємо існуючий запис
  //   - note.shared = true   → пропускаємо; запис заблокований після публікації
  function scheduleAutosave() {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(async function () {
      var note = getNote(activeId);
      if (!note) return;

      // Завжди зберігати в localStorage
      saveNotes();

      // Показати індикатор збереження
      var ind = document.getElementById('autosaveIndicator');
      ind.classList.add('visible');
      setTimeout(function () { ind.classList.remove('visible'); }, 2000);

      // Пропустити синхронізацію з БД для явно опублікованих нотаток — контент зафіксований
      if (note.shared) return;

      // Синхронізувати лише якщо є що зберігати
      if (!note.title.trim() && !note.content.trim()) return;

      // Синхронізувати з БД (створити, якщо ще немає dbId, інакше оновити)
      var dbId = await syncNoteToDb(note);
      if (dbId && !note.dbId) {
        note.dbId = dbId;
        saveNotes();
      }
    }, 900);
  }
 
  document.getElementById('noteTitle').addEventListener('input', function (e) {
    const note = getNote(activeId);
    if (!note) return;
    note.title = e.target.value;
    note.updatedAt = Date.now();
    scheduleAutosave();
    renderSidebar(document.getElementById('searchInput').value);
  });
 
  document.getElementById('noteContent').addEventListener('input', function (e) {
    const note = getNote(activeId);
    if (!note) return;
    note.content = e.target.value;
    note.updatedAt = Date.now();
    scheduleAutosave();
    updatePreview(e.target.value);
    updateToolbarStates();
  });
 
  document.getElementById('noteContent').addEventListener('keyup',  updateToolbarStates);
  document.getElementById('noteContent').addEventListener('click',  updateToolbarStates);
  document.getElementById('noteContent').addEventListener('select', updateToolbarStates);
 
  // ── АВТОПРОДОВЖЕННЯ НУМЕРОВАНИХ / МАРКОВАНИХ СПИСКІВ ───────
  document.getElementById('noteContent').addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    const ta  = e.target;
    const val = ta.value;
    const pos = ta.selectionStart;
    const lineStart = val.lastIndexOf('\n', pos - 1) + 1;
    const line = val.substring(lineStart, pos);
 
    // Нумерований список
    const olM = line.match(/^(\s*)(\d+)\.\s(.*)$/);
    if (olM) {
      e.preventDefault();
      if (olM[3].trim() === '') {
        // Порожній елемент → завершити
        ta.value = val.substring(0, lineStart) + '\n' + val.substring(pos);
        ta.selectionStart = ta.selectionEnd = lineStart + 1;
      } else {
        const ins = '\n' + olM[1] + (parseInt(olM[2], 10) + 1) + '. ';
        ta.setRangeText(ins, pos, pos, 'end');
      }
      ta.dispatchEvent(new Event('input'));
      return;
    }
 
    // Маркований список
    const ulM = line.match(/^(\s*)([-*+])\s(.*)$/);
    if (ulM) {
      e.preventDefault();
      if (ulM[3].trim() === '') {
        ta.value = val.substring(0, lineStart) + '\n' + val.substring(pos);
        ta.selectionStart = ta.selectionEnd = lineStart + 1;
      } else {
        ta.setRangeText('\n' + ulM[1] + ulM[2] + ' ', pos, pos, 'end');
      }
      ta.dispatchEvent(new Event('input'));
      return;
    }
  });
 
  // ── форматування ─────────────────────────
  function getEditorCtx() {
    const ta  = document.getElementById('noteContent');
    const val = ta.value;
    const s   = ta.selectionStart;
    const e   = ta.selectionEnd;
    const ls  = val.lastIndexOf('\n', s - 1) + 1;
    const leRaw = val.indexOf('\n', e);
    const le  = leRaw === -1 ? val.length : leRaw;
    return { ta, val, s, e, ls, le };
  }
 
  function toggleWrap(marker, placeholder) {
    const { ta, val, s, e } = getEditorCtx();
    const m   = marker.length;
    const sel = val.substring(s, e);
 
    if (sel.startsWith(marker) && sel.endsWith(marker) && sel.length > m * 2) {
      // Виділення обгорнуте → розгорнути
      ta.setRangeText(sel.slice(m, -m), s, e, 'select');
    } else if (val.substring(s - m, s) === marker && val.substring(e, e + m) === marker) {
      // Курсор всередині маркерів → видалити оточуючі маркери
      ta.setRangeText(sel, s - m, e + m, 'select');
    } else {
      // Обгорнути виділення або плейсхолдер
      const rep = marker + (sel || placeholder) + marker;
      ta.setRangeText(rep, s, e, 'select');
      if (!sel) {
        ta.selectionStart = s + m;
        ta.selectionEnd   = s + m + placeholder.length;
      }
    }
    ta.focus();
    ta.dispatchEvent(new Event('input'));
  }
 
  function toggleLinePrefix(prefix) {
    const { ta, val, ls, le, s } = getEditorCtx();
    const line = val.substring(ls, le);
    if (line.startsWith(prefix)) {
      // Видалення префікса: встановити курсор на початкову позицію мінус довжина префікса (з обмеженням)
      const newPos = Math.max(ls, s - prefix.length);
      ta.setRangeText(line.slice(prefix.length), ls, le, 'preserve');
      ta.selectionStart = ta.selectionEnd = newPos;
    } else {
      // Додавання префікса: встановити курсор одразу після нового префікса
      ta.setRangeText(prefix + line, ls, le, 'preserve');
      // Курсор має стояти одразу після префікса, щоб користувач міг одразу вводити текст
      const cursorPos = ls + prefix.length;
      ta.selectionStart = ta.selectionEnd = cursorPos;
    }
    ta.focus();
    ta.dispatchEvent(new Event('input'));
  }
 
  function toggleHeading(hashes) {
    const { ta, val, ls, le } = getEditorCtx();
    const line = val.substring(ls, le);
    const m = line.match(/^(#{1,6})\s/);
    if (m) {
      if (m[1] === hashes) {
        // Повністю видалити заголовок
        const newText = line.replace(/^#{1,6}\s/, '');
        ta.setRangeText(newText, ls, le, 'preserve');
        ta.selectionStart = ta.selectionEnd = ls;
      } else {
        // Замінити рівень існуючого заголовка
        const newText = line.replace(/^#{1,6}\s/, hashes + ' ');
        ta.setRangeText(newText, ls, le, 'preserve');
        // Встановити курсор після нового префікса заголовка (решітки + пробіл)
        ta.selectionStart = ta.selectionEnd = ls + hashes.length + 1;
      }
    } else {
      // Вставити префікс заголовка
      ta.setRangeText(hashes + ' ' + line, ls, le, 'preserve');
      // Встановити курсор одразу після "### ", щоб почати вводити текст заголовка
      ta.selectionStart = ta.selectionEnd = ls + hashes.length + 1;
    }
    ta.focus();
    ta.dispatchEvent(new Event('input'));
  }
 
  function isWrapped(marker) {
    const ta  = document.getElementById('noteContent');
    const val = ta.value;
    const s   = ta.selectionStart;
    const e   = ta.selectionEnd;
    const m   = marker.length;
    const sel = val.substring(s, e);
    if (sel.startsWith(marker) && sel.endsWith(marker) && sel.length > m * 2) return true;
    return val.substring(s - m, s) === marker && val.substring(e, e + m) === marker;
  }
 
  function updateToolbarStates() {
    if (!activeId) {
      document.querySelectorAll('.tb-btn').forEach(function (b) { b.classList.remove('active'); });
      return;
    }
    const ta    = document.getElementById('noteContent');
    const val   = ta.value;
    const pos   = ta.selectionStart;
    const ls    = val.lastIndexOf('\n', pos - 1) + 1;
    const leRaw = val.indexOf('\n', pos);
    const line  = val.substring(ls, leRaw === -1 ? val.length : leRaw);
 
    document.querySelector('[data-action="bold"]').classList.toggle('active',       isWrapped('**'));
    document.querySelector('[data-action="italic"]').classList.toggle('active',     isWrapped('_'));
    document.querySelector('[data-action="inlinecode"]').classList.toggle('active', isWrapped('`'));
    document.querySelector('[data-action="h1"]').classList.toggle('active',  /^#\s/.test(line) && !/^##/.test(line));
    document.querySelector('[data-action="h2"]').classList.toggle('active',  /^##\s/.test(line) && !/^###/.test(line));
    document.querySelector('[data-action="h3"]').classList.toggle('active',  /^###\s/.test(line));
    document.querySelector('[data-action="ul"]').classList.toggle('active',  /^[-*+]\s/.test(line));
    document.querySelector('[data-action="ol"]').classList.toggle('active',  /^\d+\.\s/.test(line));
    document.querySelector('[data-action="quote"]').classList.toggle('active', /^>/.test(line));
  }
 
  function insertCodeBlock(lang) {
    if (!activeId) { toast('Спочатку виберіть або створіть нотатку', 'error'); return; }
    const ta  = document.getElementById('noteContent');
    const pos = ta.selectionStart;
    const before = ta.value.substring(0, pos);
    const nl = (before.length && !before.endsWith('\n')) ? '\n' : '';
    const ins = nl + '```' + lang + '\n\n```\n';
    ta.setRangeText(ins, pos, pos, 'end');
    // Встановити курсор всередині блоку
    const blockStart = ta.value.lastIndexOf('```' + lang + '\n') + ('```' + lang + '\n').length;
    ta.selectionStart = ta.selectionEnd = blockStart;
    ta.focus();
    ta.dispatchEvent(new Event('input'));
  }
 
  // ── ОБРОБНИК КНОПОК ПАНЕЛІ ІНСТРУМЕНТІВ ─────────────────────
  document.querySelectorAll('[data-action]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (!activeId) { toast('Спочатку виберіть або створіть нотатку', 'error'); return; }
      const a = btn.getAttribute('data-action');
      if      (a === 'bold')       toggleWrap('**', 'bold text');
      else if (a === 'italic')     toggleWrap('_', 'italic text');
      else if (a === 'inlinecode') toggleWrap('`', 'code');
      else if (a === 'h1')         toggleHeading('#');
      else if (a === 'h2')         toggleHeading('##');
      else if (a === 'h3')         toggleHeading('###');
      else if (a === 'ul')         toggleLinePrefix('- ');
      else if (a === 'ol')         toggleLinePrefix('1. ');
      else if (a === 'quote')      toggleLinePrefix('> ');
      else if (a === 'link') {
        const { ta, val, s, e } = getEditorCtx();

        // Спробувати визначити Markdown-посилання навколо курсора
        const left  = val.lastIndexOf('[', s);
        const right = val.indexOf(')', s);

        if (left !== -1 && right !== -1) {
          const candidate = val.substring(left, right + 1);
          const m = candidate.match(/^\[([^\]]+)\]\(([^)]*)\)$/);

          if (m) {
            const text = m[1];

            // Замінити все посилання на звичайний текст
            ta.setRangeText(text, left, right + 1, 'end');
            ta.focus();
            ta.dispatchEvent(new Event('input'));
            return;
          }
        }

        const sel = val.substring(s, e);

        // Вставити нове посилання
        const linkText = sel || 'link text';
        const insertion = '[' + linkText + '](https://example.com)';

        ta.setRangeText(insertion, s, e, 'end');

        const urlStart = s + 1 + linkText.length + 2;
        const urlEnd   = urlStart + 3;

        ta.selectionStart = urlStart;
        ta.selectionEnd   = urlEnd;

        ta.focus();
        ta.dispatchEvent(new Event('input'));
        }
      updateToolbarStates();
    });
  });
 
  // ── HEADER КНОПКИ ─────────────────────────────
  document.getElementById('sidebarToggle').addEventListener('click', function () {
    document.getElementById('app').classList.toggle('sidebar-collapsed');
  });
 
  document.getElementById('togglePreviewBtn').addEventListener('click', function () {
    previewVisible = !previewVisible;
    document.getElementById('app').classList.toggle('preview-hidden', !previewVisible);
    document.getElementById('togglePreviewBtn').classList.toggle('active', !previewVisible);
  });
 
  document.getElementById('newNoteBtn').addEventListener('click', newNote);
 
  document.getElementById('searchInput').addEventListener('input', function (e) {
    renderSidebar(e.target.value);
  });
 
  document.getElementById('exportBtn').addEventListener('click', function () {
    const note = getNote(activeId);
    if (!note) { toast('Нотатку не вибрано', 'error'); return; }
    // charset=utf-8 необхідний, щоб кирилиця та інші не-ASCII символи
	// коректно зберігались у завантаженому файлі.
    const blob = new Blob(['# ' + note.title + '\n\n' + note.content], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
	// Зберігати Unicode-символи в імені файлу — видаляти лише реально небезпечні для ФС
	// символи (/ \ : * ? " < > |), а не всі не-ASCII.
    const safeName = (note.title || 'нотатка').replace(/[\/\\:*?"<>|]/g, '_').trim() || 'нотатка';
    a.download = safeName + '.md';
    a.click();
    toast('Експортовано як Markdown', 'success');
  });
 
  // ── МОДАЛЬНЕ ВІКНО SHARE ────────────────────────────────
  function updateShareLinkDisplay(note) {
    var el = document.getElementById('shareLinkUrl');
    if (note && note.dbId) {
      el.textContent = shareUrl(note);
    } else {
      el.textContent = 'Натисніть «Зберегти і згенерувати посилання»';
    }
  }
 
  document.getElementById('shareBtn').addEventListener('click', function () {
    if (!activeId) { toast('Нотатку не вибрано', 'error'); return; }
    var note = getNote(activeId);
    document.getElementById('readOnceCheck').checked  = !!note.readOnce;
    document.getElementById('hasExpiryCheck').checked = !!note.expireIn;
    document.getElementById('expiryRow').style.display = note.expireIn ? '' : 'none';
    document.getElementById('notePassword').value = '';
 
    // Використовувати note.shared (а не note.dbId) для перевірки блокування.
	// dbId тепер призначається при першій автосинхронізації; shared встановлюється лише після явної публікації.
    var alreadyShared = !!note.shared;
    document.getElementById('readOnceCheck').disabled  = alreadyShared;
    document.getElementById('hasExpiryCheck').disabled = alreadyShared;
    document.getElementById('expirySelect').disabled   = alreadyShared;
    document.getElementById('notePassword').disabled   = alreadyShared;
    document.getElementById('notePassword').placeholder = alreadyShared ? '••••••••' : 'Залиште порожнім, якщо пароль не потрібен';
    var applyBtn = document.getElementById('applyShareSettings');
    if (alreadyShared) {
      applyBtn.textContent   = '✓ Посилання згенеровано';
      applyBtn.disabled      = true;
      applyBtn.style.background = 'var(--green)';
    } else {
      applyBtn.textContent   = 'Зберегти і згенерувати посилання';
      applyBtn.disabled      = false;
      applyBtn.style.background = '';
    }
 
    // показати посилання, якщо вже опубліковано, інакше показати плейсхолдер
    document.getElementById('shareLinkUrl').textContent =
      (note.shared && note.dbId) ? shareUrl(note) : 'Натисніть «Зберегти і згенерувати посилання»';
    document.getElementById('shareModal').classList.add('open');
  });
 
  document.getElementById('shareModalClose').addEventListener('click', function () {
    document.getElementById('shareModal').classList.remove('open');
  });
 
  document.getElementById('hasExpiryCheck').addEventListener('change', function (e) {
    document.getElementById('expiryRow').style.display = e.target.checked ? '' : 'none';
  });
 
  document.getElementById('applyShareSettings').addEventListener('click', async function () {
    var note = getNote(activeId);
    if (!note) return;
 
    // ── перевірити обов’язкові поля перед будь-яким записом у БД ───────────────
    if (!note.title.trim()) {
      toast('Будь ласка, додайте назву нотатки', 'error');
      document.getElementById('shareModal').classList.remove('open');
      document.getElementById('noteTitle').focus();
      return;
    }
    if (!note.content.trim()) {
      toast('Будь ласка, додайте вміст нотатки', 'error');
      document.getElementById('shareModal').classList.remove('open');
      document.getElementById('noteContent').focus();
      return;
    }
 
    var applyBtn = document.getElementById('applyShareSettings');
    applyBtn.textContent = 'Збереження…';
    applyBtn.disabled = true;
 
    // оновити локальні поля
    note.readOnce = document.getElementById('readOnceCheck').checked;
    var hasExpiry = document.getElementById('hasExpiryCheck').checked;
    var expireInSec = hasExpiry
      ? parseInt(document.getElementById('expirySelect').value, 10)
      : null;
    note.expireIn  = expireInSec;
    note.expireAt  = expireInSec ? Date.now() + expireInSec * 1000 : null;
 
    var pwd = document.getElementById('notePassword').value;
    if (pwd) {
      note.password      = pwd;
      note.passwordPlain = pwd;
      note.passwordSet   = true;
    }
 
    // ── Синхронізація з БД ────────────────────────────────────────────────────────
    var dbId = await syncNoteToDb(note);
    if (dbId) {
      note.dbId          = dbId;
      note.shared        = true;   // позначає нотатку як опубліковану — редактор блокується
      note.passwordPlain = undefined;
      saveNotes();
      updateTempBanner(note);
      renderSidebar(document.getElementById('searchInput').value);
      updateShareLinkDisplay(note);
      setReadOnly(true);
 
      // ── заблокувати всі елементи форми share-modal після успішної генерації
      document.getElementById('readOnceCheck').disabled  = true;
      document.getElementById('hasExpiryCheck').disabled = true;
      document.getElementById('expirySelect').disabled   = true;
      document.getElementById('notePassword').disabled   = true;
      document.getElementById('notePassword').placeholder = '••••••••';
      applyBtn.textContent = '✓ Посилання згенеровано';
      applyBtn.disabled    = true;
      applyBtn.style.background = 'var(--green)';
 
      toast('Нотатку збережено — посилання готове до передачі', 'success');
    } else {
      toast('Не вдалося зʼєднатися із сервером. Налаштування збережено локально.', 'error');
      saveNotes();
      applyBtn.textContent = 'Зберегти і згенерувати посилання';
      applyBtn.disabled = false;
    }
  });
 
  document.getElementById('copyLinkBtn').addEventListener('click', function () {
    var note = getNote(activeId);
    if (!note) return;
    if (!note.dbId) {
      toast('Спочатку застосуйте налаштування для генерації посилання', 'error');
      return;
    }
    var url = shareUrl(note);
    copyText(url).catch(function () {});
    var btn = document.getElementById('copyLinkBtn');
    btn.textContent = 'Скопійовано!';
    btn.classList.add('copied');
    setTimeout(function () { btn.textContent = 'Копіювати'; btn.classList.remove('copied'); }, 2000);
    toast('Посилання скопійовано!', 'success');
  });
 
  // ── MODAL видалення ───────────────────────────────
  document.getElementById('deleteModalClose').addEventListener('click', function () {
    document.getElementById('deleteModal').classList.remove('open');
  });
 
  document.getElementById('confirmDelete').addEventListener('click', function () {
    if (deleteTarget) { deleteNote(deleteTarget); deleteTarget = null; }
    document.getElementById('deleteModal').classList.remove('open');
  });
 
  // ── MODAL паролю ─────────────────────────────
  function promptPassword(id) {
    passwordTarget = id;
    sharedNoteDbId = null;
    document.getElementById('passwordInput').value = '';
    document.getElementById('passwordModal').classList.add('open');
    setTimeout(function () { document.getElementById('passwordInput').focus(); }, 100);
  }
 
  document.getElementById('passwordModalClose').addEventListener('click', function () {
    document.getElementById('passwordModal').classList.remove('open');
    passwordTarget  = null;
    sharedNoteDbId = null;
  });
 
  document.getElementById('confirmPassword').addEventListener('click', async function () {
    var pwd = document.getElementById('passwordInput').value;
 
    // Спільна нотатка (пароль на стороні сервера)
    if (sharedNoteDbId) {
	  if (!pwd) {
        toast('Введіть пароль', 'error');
        return;
      }
	  
      document.getElementById('passwordModal').classList.remove('open');
      await openSharedNote(sharedNoteDbId, pwd);
      sharedNoteDbId = null;
      return;
    }
 
    // Локальна нотатка (пароль на клієнті, збережений у localStorage)
    var note = getNote(passwordTarget);
    if (!note) return;
    if (pwd === note.password) {
      note._unlocked = true;
      document.getElementById('passwordModal').classList.remove('open');
      // НЕ передавати skipCheck=true — нотатки з dbId мають перевірятися
	  // на сервері навіть після локального розблокування паролем.
      openNote(passwordTarget);
      passwordTarget = null;
    } else {
      document.getElementById('passwordInput').style.borderColor = 'var(--red)';
      toast('Неправильний пароль', 'error');
      setTimeout(function () {
        document.getElementById('passwordInput').style.borderColor = '';
      }, 1000);
    }
  });
 
  document.getElementById('passwordInput').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') document.getElementById('confirmPassword').click();
  });
 
  // ── контекстне меню ───────────────────────────────
  function showCtxMenu(e, id) {
    ctxTarget = id;
    const note = getNote(id);
    document.getElementById('ctx-pin-label').textContent = note && note.pinned ? 'Відкріпити нотатку' : 'Закріпити нотатку';
    const menu = document.getElementById('ctxMenu');
    menu.style.display = '';
    menu.style.left = Math.min(e.clientX, window.innerWidth  - 170) + 'px';
    menu.style.top  = Math.min(e.clientY, window.innerHeight - 150) + 'px';
  }
 
  function hideCtx() {
    document.getElementById('ctxMenu').style.display = 'none';
    ctxTarget = null;
  }
 
  document.getElementById('ctx-pin').addEventListener('click', function () {
    if (ctxTarget) togglePin(ctxTarget);
    hideCtx();
  });
 
  document.getElementById('ctx-share').addEventListener('click', function () {
    if (ctxTarget) {
      openNote(ctxTarget);
      setTimeout(function () { document.getElementById('shareBtn').click(); }, 80);
    }
    hideCtx();
  });
 
  document.getElementById('ctx-export').addEventListener('click', function () {
    if (ctxTarget) {
      openNote(ctxTarget);
      setTimeout(function () { document.getElementById('exportBtn').click(); }, 80);
    }
    hideCtx();
  });
 
  document.getElementById('ctx-delete').addEventListener('click', function () {
    if (ctxTarget) promptDelete(ctxTarget);
    hideCtx();
  });
 
  // Закрити контекстне меню при кліку поза ним
  document.addEventListener('click', function (e) {
    const menu = document.getElementById('ctxMenu');
    if (menu.style.display !== 'none' && !menu.contains(e.target)) hideCtx();
    // Закрити випадаючий список мов при кліку поза ним
    if (langDropdownOpen && !document.getElementById('langBtnWrap').contains(e.target)) {
      closeLangDropdown();
    }
  });
 
  // ── гарячі клавіші (в розробці) ─────────────────────────
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      hideCtx();
      closeLangDropdown();
      document.querySelectorAll('.modal-overlay.open').forEach(function (m) {
        m.classList.remove('open');
      });
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') { e.preventDefault(); newNote(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'p') { e.preventDefault(); document.getElementById('togglePreviewBtn').click(); }
    if ((e.ctrlKey || e.metaKey) && e.key === '\\') { e.preventDefault(); document.getElementById('sidebarToggle').click(); }
  });
 
  // ── МАРШРУТИЗАЦІЯ URL ─────────────────────────────
  // Підтримуються два типи URL:
  //   #/note/<localId>        – старий hash-роутинг (власник на тому ж пристрої)
  //   ?id=<dbId>              – shared-посилання на view.php; ми перехоплюємо
  //                             його також на index.html для кращого UX
  //   Прямий виклик: view.php?id=X   – обробляється сервером (view.php)
 
  async function handleViewParam() {
    // Якщо сторінка завантажена як index.html?share=<dbId>, відкрити спільну нотатку
    var params = new URLSearchParams(location.search);
    var shareId = params.get('share');
    if (!shareId) return false;
    await openSharedNote(shareId, null);
    return true;
  }
 
  async function openSharedNote(dbId, passwordAttempt) {
    // очистити редактор під час завантаження
    document.getElementById('emptyState').style.display  = '';
    document.getElementById('noteTitle').style.display   = 'none';
    document.getElementById('noteContent').style.display = 'none';
 
    try {
      var res;
      if (typeof passwordAttempt === 'string') {
        res = await apiPost('view.php', { id: dbId, password: passwordAttempt });
      } else {
        res = await apiGet('view.php?id=' + encodeURIComponent(dbId));
      }
 
      if (res.error === 'password_required') {
        showSharedPasswordPrompt(dbId);
        return;
      }
      if (res.error === 'wrong_password') {
        toast('Неправильний пароль', 'error');
        showSharedPasswordPrompt(dbId);
        return;
      }
      if (res.error) {
        // Нотатка прострочена, не знайдена або вже використана
        toast(res.message || res.error || 'Нотатку не знайдено або вже видалено.', 'error');
        document.getElementById('emptyState').style.display = '';
        return;
      }
 
      // ── Успіх: відобразити в режимі лише читання ────────────────────────────────
      showSharedEditor(res.title || '', res.content || '');
      updatePreview(res.content || '');
 
      // Показати тимчасовий банер, використовуючи метадані з сервера
      var bannerNote = {
        readOnce: res.read_once,
        expireAt: res.expire_at ? new Date(res.expire_at).getTime() : null,
      };
      updateTempBanner(bannerNote);
 
      if (res.destroyed) {
        toast('Одноразова нотатка — остаточно видалена з сервера після цього перегляду.', 'info');
        var banner = document.getElementById('tempBanner');
        var label  = document.getElementById('tempBannerText');
        label.textContent = 'Цю нотатку остаточно видалено — вміст доступний лише в поточному сеансі';
        banner.classList.remove('hidden');
      }
 
    } catch (err) {
      console.error('openSharedNote error:', err);
      toast('Не вдалося завантажити нотатку — перевірте зʼєднання', 'error');
    }
  }
 
  // запит пароля спеціально для shared нотаток (перевірка на сервері)
  function showSharedPasswordPrompt(dbId) {
    sharedNoteDbId = dbId;
    document.getElementById('passwordInput').value = '';
    document.getElementById('passwordModal').classList.add('open');
    setTimeout(function () { document.getElementById('passwordInput').focus(); }, 100);
  }
 
  function handleHash() {
    var m = location.hash.match(/^#\/note\/(.+)$/);
    if (!m) return;
    var id = m[1];
    var localNote = getNote(id);
    if (localNote) {
      openNote(id);
    } else {
      // якщо ID відсутній у localStorage → вважаємо його dbId і отримуємо з сервера
      openSharedNote(id, null);
    }
  }
  window.addEventListener('hashchange', handleHash);
 
  // ── ІНІЦІАЛІЗАЦІЯ ───────────────────────────
  // видалення прострочених локальних нотаток
  notes = notes.filter(function (n) { return !n.expireAt || Date.now() < n.expireAt; });
  saveNotes();
  renderSidebar('');
 
  // перевіряємо параметр ?share=<dbId> (посилання з модального вікна поширення, що веде на index.html)
  handleViewParam().then(function (handled) {
    if (!handled) {
      handleHash();
      // відкрити першу доступну нотатку, якщо жодна не була відкрита через hash
      if (!activeId && notes.length) {
        var first = notes.find(function (n) { return !n.expireAt || Date.now() < n.expireAt; });
        if (first) openNote(first.id);
      }
    }
  });
 
});