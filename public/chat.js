/* Support: action sheet (chat / call / cancel) and the chat itself (text + photos only) */
const supportPhone = () => (St.menu?.settings.support_phone || branches()[0]?.phone || '').trim();

A.support = () => {
  const phone = supportPhone();
  Sh.open('support', () => `<div class="act-wrap">
    <div class="act-group">
      <button class="act-b" onclick="A.openChat()">Написать в чат</button>
      ${phone ? `<a class="act-b" href="tel:${esc(phone.replace(/[^+\d]/g, ''))}" onclick="Sh.close('support')">Позвонить</a>` : ''}
    </div>
    <div class="act-group"><button class="act-b strong" onclick="Sh.close('support')">Отменить</button></div></div>`, 'act');
};

const CH = { last: 0, timer: null, sending: false };
A.openChat = () => {
  Sh.close('support');
  if (!St.token) { toast('Войдите в профиль, чтобы написать в чат'); return go('login'); }
  CH.last = 0; CH.msgs = [];
  Sh.open('chat', () => `<div class="sh-head" style="padding:max(14px,env(safe-area-inset-top)) 16px 8px"><button onclick="Sh.close('chat')">${I.x()}</button><b style="font-size:18px">Чат поддержки</b><span style="width:28px"></span></div>
    <div class="body chat-body" id="chatbody"><div class="chat-empty" id="chatempty">Напишите нам — ответим как можно скорее</div></div>
    <div class="chat-bar">
      <button class="chat-attach" onclick="document.getElementById('chatfile').click()" aria-label="Фото">${I.plus(24)}</button>
      <input type="file" id="chatfile" accept="image/png,image/jpeg,image/webp" hidden>
      <input id="chattext" placeholder="Сообщение" maxlength="1000" autocomplete="off">
      <button class="chat-send" onclick="A.sendChat()" aria-label="Отправить">${I.locate(22)}</button>
    </div>`, 'full', () => clearInterval(CH.timer));
  $('#chattext').onkeydown = e => { if (e.key === 'Enter') A.sendChat(); };
  $('#chatfile').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) A.sendChatImage(f); };
  A.pollChat(true);
  CH.timer = setInterval(() => A.pollChat(false), 4000);
};
function chatBubble(m) {
  return `<div class="cm ${m.sender === 'user' ? 'me' : 'them'}">${m.image ? `<img src="${esc(m.image)}" alt="" onclick="A.viewImg('${esc(m.image)}')">` : ''}${m.text ? `<div>${esc(m.text)}</div>` : ''}<small>${esc(String(m.created_at).slice(11, 16))}</small></div>`;
}
A.pollChat = async first => {
  try {
    const r = await api('/chat?after=' + CH.last);
    const box = $('#chatbody'); if (!box) return;
    if (r.messages.length) {
      $('#chatempty')?.remove();
      const stick = first || box.scrollHeight - box.scrollTop - box.clientHeight < 80;
      box.insertAdjacentHTML('beforeend', r.messages.map(chatBubble).join(''));
      CH.last = r.messages[r.messages.length - 1].id;
      if (stick) box.scrollTop = box.scrollHeight;
    }
  } catch { /* ignore, retry on next tick */ }
};
async function chatPost(body) {
  if (CH.sending) return; CH.sending = true;
  try { await api('/chat', { body }); await A.pollChat(true); } catch (e) { toast(e.message); }
  CH.sending = false;
}
A.sendChat = () => {
  const i = $('#chattext'); const text = i.value.trim(); if (!text) return;
  i.value = ''; chatPost({ text });
};
A.sendChatImage = file => {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return toast('Можно отправлять только фото и текст');
  const img = new Image(); const url = URL.createObjectURL(file);
  img.onload = () => {
    const max = 1280, k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
    chatPost({ image: c.toDataURL('image/jpeg', .82), text: ($('#chattext').value || '').trim() }); const t = $('#chattext'); if (t) t.value = '';
  };
  img.onerror = () => toast('Не удалось открыть фото');
  img.src = url;
};
A.viewImg = src => Sh.open('imgview', () => `<div style="position:absolute;inset:0;background:#000;display:grid;place-items:center" onclick="Sh.close('imgview')"><img src="${src}" style="max-width:100%;max-height:100%;object-fit:contain"></div>`, 'full');
