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
    if (e.key !== 'Escape' || !navMenu.classList.contains('open')) return;
    setMenu(false);
    hamburger.focus(); // don't strand keyboard focus inside a hidden menu
  });

  // Tabbing past the last menu link closes the menu, so focus doesn't
  // silently continue into page content behind an open overlay.
  navMenu.addEventListener('focusout', () => {
    setTimeout(() => {
      if (!navMenu.contains(document.activeElement) && document.activeElement !== hamburger) {
        setMenu(false);
      }
    }, 0);
  });
})();

/* ── EMAIL COPY (used by index + careers) ──
   Three tiers, because in-app browsers (Instagram, TikTok, Facebook) routinely
   block the async Clipboard API AND have no mail handler, so the old
   clipboard-or-mailto pair failed twice and looked dead:

     1. navigator.clipboard  — the modern path, works in real browsers
     2. execCommand('copy')  — the legacy path, still works in most webviews
     3. select the address   — so the native "Copy" menu is one tap away

   Tier 2 is attempted synchronously when tier 1 is unavailable, because
   execCommand requires an active user gesture and an async .catch() has
   already lost it. */
function legacyCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  // Must be on-screen and non-hidden for iOS to allow selection.
  ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;' +
                     'padding:0;border:none;opacity:0;pointer-events:none;';
  document.body.appendChild(ta);

  const sel = document.getSelection();
  const prev = sel && sel.rangeCount ? sel.getRangeAt(0) : null;

  ta.select();
  ta.setSelectionRange(0, text.length);   // iOS ignores select() alone

  let ok = false;
  try { ok = document.execCommand('copy'); } catch (_) { ok = false; }

  document.body.removeChild(ta);
  if (prev && sel) { sel.removeAllRanges(); sel.addRange(prev); }
  return ok;
}

/* Last resort: select the address where it sits on the page, so the user
   can tap Copy from the native selection menu. Better than a dead mailto. */
function selectAddress(spanId) {
  const span = document.getElementById(spanId);
  if (!span) return;
  const range = document.createRange();
  range.selectNodeContents(span);
  const sel = document.getSelection();
  if (!sel) return;
  sel.removeAllRanges();
  sel.addRange(range);
}

function copyEmail(e, address, spanId) {
  e.preventDefault();

  const settle = (ok) => {
    if (ok) flashCopied(spanId, address);
    else selectAddress(spanId);
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(address)
      .then(() => flashCopied(spanId, address))
      .catch(() => settle(legacyCopy(address)));
    return;
  }

  settle(legacyCopy(address));
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
