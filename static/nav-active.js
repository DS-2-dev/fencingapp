// Set the active nav button based on the current location.pathname
(function(){
  function findMatch(path) {
    // Normalize path: strip trailing slash except root
    if (!path) path = location.pathname || '/';
    if (path.length > 1 && path.endsWith('/')) path = path.slice(0,-1);
    // mapping order matters: longer first
    const map = [
      {test: p=> p === '/' , sel: '.home-btn'},
      {test: p=> p.startsWith('/summary'), sel: '.summary-btn'},
      {test: p=> p.startsWith('/checkin'), sel: '.checkin-btn'},
      {test: p=> p.startsWith('/seeding'), sel: '.seeding-btn'},
      {test: p=> p.startsWith('/pools'), sel: '.pools-btn'},
      {test: p=> p.startsWith('/de'), sel: '.de-btn'}
    ];
    for (const m of map) if (m.test(path)) return m.sel;
    return null;
  }

  function setActive() {
    const path = location.pathname || '/';
    const sel = findMatch(path);
    const all = Array.from(document.querySelectorAll('.nav-btn'));
    all.forEach(a => a.classList.remove('active'));
    if (sel) {
      const el = document.querySelector(sel);
      if (el) el.classList.add('active');
    }
  }

  document.addEventListener('DOMContentLoaded', setActive);
  // SPA-style navigation hooks
  window.addEventListener('popstate', setActive);
  window.addEventListener('page:loaded', setActive);
  // Also set active immediately when nav links are clicked (optimistic)
  document.addEventListener('click', (ev) => {
    const a = ev.target.closest && ev.target.closest('a.nav-btn');
    if (!a) return;
    // Store last page when clicking home
    if (a.classList.contains('home-btn')) {
      sessionStorage.setItem('lastPage', location.pathname);
    }
    // small delay to allow navigation to proceed
    setTimeout(setActive, 10);
  }, {capture:true});
})();

/* Minimize / Maximize UI controls
   - Ctrl+M toggles minimize (collapses fixed bars into thin strips)
   - Ctrl+Shift+M toggles maximize (emphasizes bars)
   - A small restore button is shown when minimized
   State persists in localStorage under 'fencingapp:ui-state'. */
(function(){
  function setState(state){
    document.body.classList.toggle('app-minimized', state === 'minimized');
    document.body.classList.toggle('app-maximized', state === 'maximized');
    localStorage.setItem('fencingapp:ui-state', state || 'normal');
    updateRestoreButton();
  }

  function toggleMinimize(){
    const isMin = document.body.classList.toggle('app-minimized');
    if (isMin) document.body.classList.remove('app-maximized');
    localStorage.setItem('fencingapp:ui-state', isMin ? 'minimized' : 'normal');
    updateRestoreButton();
  }

  function toggleMaximize(){
    const isMax = document.body.classList.toggle('app-maximized');
    if (isMax) document.body.classList.remove('app-minimized');
    localStorage.setItem('fencingapp:ui-state', isMax ? 'maximized' : 'normal');
    updateRestoreButton();
  }

  function updateRestoreButton(){
    let btn = document.querySelector('.app-restore-btn');
    if (document.body.classList.contains('app-minimized')){
      if (!btn){
        btn = document.createElement('button');
        btn.className = 'app-restore-btn frutiger-aero-button';
        btn.innerText = 'Restore';
        btn.addEventListener('click', () => { toggleMinimize(); });
        document.body.appendChild(btn);
      }
      btn.style.display = 'inline-flex';
    } else if (btn){
      btn.style.display = 'none';
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const state = localStorage.getItem('fencingapp:ui-state');
    if (state) setState(state);
  });

  document.addEventListener('keydown', (ev) => {
    // Ctrl/Cmd + M = minimize toggle
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'm'){
      ev.preventDefault();
      toggleMinimize();
      return;
    }
    // Ctrl/Cmd + Shift + M = maximize toggle
    if ((ev.ctrlKey || ev.metaKey) && ev.shiftKey && ev.key.toLowerCase() === 'm'){
      ev.preventDefault();
      toggleMaximize();
      return;
    }
  });

  // Expose helpers for debugging / external triggers
  window.fencingappUI = {
    setState, toggleMinimize, toggleMaximize
  };
})();
