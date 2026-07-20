/* ═══════════════════════════════════════════
   Mike Kitai — shared behavior (all pages)
   ═══════════════════════════════════════════ */

/* ── NAV MENU ── */
(function () {
  const hamburger = document.getElementById('hamburger');
  const navMenu = document.getElementById('nav-menu');
  if (!hamburger || !navMenu) return;

  function setMenu(open) {
    navMenu.classList.toggle('open', open);
    hamburger.setAttribute('aria-expanded', String(open));
  }

  hamburger.addEventListener('click', () => setMenu(!navMenu.classList.contains('open')));

  document.addEventListener('click', (e) => {
    if (!hamburger.contains(e.target) && !navMenu.contains(e.target)) setMenu(false);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setMenu(false);
  });
})();

/* ── EMAIL COPY (used by index + careers) ──
   Copies `address` to the clipboard and flashes "Copied!" in the
   element with id `spanId`. Falls back to mailto: if the clipboard
   API is unavailable or fails. */
function copyEmail(e, address, spanId) {
  e.preventDefault();
  const fallback = () => { window.location.href = 'mailto:' + address; };

  if (!(navigator.clipboard && navigator.clipboard.writeText)) {
    fallback();
    return;
  }

  navigator.clipboard.writeText(address)
    .then(() => flashCopied(spanId, address))
    .catch(fallback);
}

function flashCopied(spanId, address) {
  const span = document.getElementById(spanId);
  if (!span) return;
  const originalDecoration = span.style.textDecoration;

  span.style.opacity = '0';
  setTimeout(() => {
    span.textContent = 'Copied!';
    span.style.textDecoration = 'none';
    span.style.opacity = '1';
    setTimeout(() => {
      span.style.opacity = '0';
      setTimeout(() => {
        span.textContent = address;
        span.style.textDecoration = originalDecoration;
        span.style.opacity = '1';
      }, 300);
    }, 1500);
  }, 300);
}
