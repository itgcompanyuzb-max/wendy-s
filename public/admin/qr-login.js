/* Opened on the phone by scanning the QR code on a computer's login screen.
   The person confirms with Face ID / fingerprint; the phone shows a tick and the computer opens the panel. */
(() => {
  const root = document.getElementById('root');
  const token = location.hash.slice(1);
  history.replaceState(null, '', location.pathname); // the token is not left in the address bar or history
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  async function api(path, method = 'GET', body) {
    const r = await fetch('/api/admin/' + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || 'Ошибка'), { status: r.status });
    return j;
  }
  const box = inner => { root.innerHTML = `<div class="login"><div class="glass box qr-phone"><div class="brand" style="padding:0"><img class="logo" src="/img/brand.png" alt=""><span>Wendy's</span></div>${inner}</div></div>`; };
  const tick = '<svg class="qr-tick" viewBox="0 0 96 96" aria-hidden="true"><circle cx="48" cy="48" r="44"/><path d="M28 50l14 14 27-30"/></svg>';
  const face = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M9 9v1M15 9v1M12 9v4h-1M9.5 16a3.5 3.5 0 0 0 5 0"/></svg>';

  function fail(title, text) { box(`<h1>${esc(title)}</h1><p class="muted" style="margin:0">${text}</p>`); }

  async function confirm(area) {
    box(`<h1>Вход с компьютера</h1><p class="muted" style="margin:0">Подтвердите вход в <b>${esc(area)}</b> лицом или отпечатком пальца.</p>
      <p class="muted" style="margin:10px 0 0;font-size:13px">Если вы сейчас не входите на компьютере — просто закройте эту страницу.</p>
      <button class="btn primary" id="go" style="width:100%;margin-top:20px">${face} Подтвердить</button><div class="err" id="err"></div>`);
    const go = document.getElementById('go');
    go.onclick = async () => {
      go.disabled = true; document.getElementById('err').textContent = '';
      try {
        const r = await Passkey.signIn(api, { qr: token });
        box(`${tick}<h1 style="text-align:center">Готово</h1><p class="muted" style="margin:0;text-align:center">${esc(r.area.charAt(0).toUpperCase() + r.area.slice(1))} открывается на компьютере.</p><p class="muted" id="closing" style="margin:14px 0 0;text-align:center;font-size:13px"></p>`);
        if (navigator.vibrate) navigator.vibrate(30);
        setTimeout(() => { window.close(); const c = document.getElementById('closing'); if (c) c.textContent = 'Эту страницу можно закрыть.'; }, 1500);
      } catch (e) {
        go.disabled = false;
        if (Passkey.cancelled(e)) {
          document.getElementById('err').innerHTML = 'На этом телефоне вход по лицу ещё не включён, или подтверждение отменено.<br>Включите его: войдите на телефоне по номеру → «Безопасность» → «Вход по лицу».';
        } else document.getElementById('err').textContent = e.message;
      }
    };
  }

  (async () => {
    if (!token) return fail('Нет кода', 'Отсканируйте QR-код на экране входа компьютера ещё раз.');
    if (!Passkey.supported()) return fail('Не поддерживается', 'Этот браузер не умеет входить по лицу. Откройте ссылку в Safari (iPhone) или Chrome (Android).');
    try {
      const i = await api('auth/qr/info', 'POST', { token });
      if (!i.valid) return fail('QR-код устарел', 'Обновите страницу входа на компьютере и отсканируйте новый код.');
      confirm(i.area);
    } catch (e) { fail('Ошибка', esc(e.message)); }
  })();
})();
