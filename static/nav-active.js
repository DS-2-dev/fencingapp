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
