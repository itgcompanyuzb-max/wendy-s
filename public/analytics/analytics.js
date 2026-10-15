/* Analytics: customers, sales per branch, best sellers, peak hours. Same sign-in as the admin panel (sessionStorage token). */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => new Intl.NumberFormat('ru-RU').format(Math.round(n || 0));
const token = sessionStorage.getItem('atoken') || '';
const PANEL = sessionStorage.getItem('panel') === 'manager' ? 'manager' : 'admin';
const St = { me: null, branches: [], period: '7', branch: '', q: '', data: null, timer: null };
if (!token) location.replace(`/${PANEL}/?next=analytics`);

async function api(path) {
  const r = await fetch('/api/admin/' + path, { headers: { Authorization: 'Bearer ' + token } });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) { sessionStorage.removeItem('atoken'); location.replace(`/${PANEL}/?next=analytics`); throw new Error('auth'); }
  if (!r.ok) throw new Error(j.error || 'Ошибка');
  return j;
}
const PERIODS = [['today', 'Сегодня'], ['7', '7 дней'], ['30', '30 дней'], ['all', 'Всё время']];
const STATUS = { new: 'Новые', cooking: 'Готовятся', ready: 'Готовы', delivering: 'В пути', done: 'Выполнены', cancelled: 'Отменены' };
const PAY = { card: 'Карта', click: 'Click', payme: 'Payme', cash: 'Наличные', coins: 'WendyCoin' };
const TYPE = { delivery: 'Доставка', pickup: 'В пиццерии' };
const COLORS = ['#e2203d', '#7aa7ff', '#ffc83d', '#34d17a', '#b78cff', '#ff9d4d'];

function splitCard(title, obj, names) {
  const entries = Object.entries(obj).sort((a, b) => b[1] - a[1]); const sum = entries.reduce((n, e) => n + e[1], 0) || 1;
  return `<div class="glass card"><h3>${title}</h3>${entries.length ? `<div class="split">${entries.map(([k, v], i) => `<i style="width:${v / sum * 100}%;background:${COLORS[i % COLORS.length]}"></i>`).join('')}</div>
    ${entries.map(([k, v], i) => `<div class="lg"><span style="--c:${COLORS[i % COLORS.length]}">${esc(names[k] || k)}</span><b>${v} <small class="muted">(${Math.round(v / sum * 100)}%)</small></b></div>`).join('')}` : '<div class="muted">Нет данных</div>'}</div>`;
}
function hbars(items, valueKey, label, sub) {
  const max = Math.max(1, ...items.map(i => i[valueKey]));
  return items.map((i, n) => `<div class="hbar"><div class="nm">${n === 0 ? '<span class="crown">♛</span> ' : ''}${esc(label(i))}${sub ? `<small>${esc(sub(i))}</small>` : ''}</div><div class="tr"><b style="width:${i[valueKey] / max * 100}%"></b></div><b>${money(i[valueKey])}</b></div>`).join('') || '<div class="muted">Нет данных</div>';
}

async function load() {
  const q = `?period=${St.period}${St.branch ? '&branch_id=' + St.branch : ''}`;
  const d = St.data = await api('analytics/summary' + q);
  const k = d.kpis, c = d.customers, maxRev = Math.max(1, ...d.days.map(x => x.revenue));
  const showDay = d.days.length > 31 ? (x, i) => (i % 7 === 0 ? x.day.slice(5) : '') : x => x.day.slice(5);
  $('#body').innerHTML = `
  <div class="an-grid an-kpis">
    <div class="glass kpi"><small>Клиентов</small><b>${money(c.total)}</b><span class="pill info">${St.branch || St.me.role !== 'super' ? 'заказывали здесь' : 'всего в базе'}</span></div>
    ${c.new_in_period !== null ? `<div class="glass kpi"><small>Новых клиентов</small><b>${money(c.new_in_period)}</b><span class="pill ok">за период</span></div>` : ''}
    <div class="glass kpi"><small>Заказов</small><b>${money(k.orders)}</b><span class="pill ${k.cancelled ? 'warn' : ''}">отменено ${k.cancelled}</span></div>
    <div class="glass kpi"><small>Выручка, so'm</small><b>${money(k.revenue)}</b><span class="pill info">выполнено ${k.done}</span></div>
    <div class="glass kpi"><small>Средний чек</small><b>${money(k.avg)}</b><span class="pill">so'm</span></div>
    <div class="glass kpi"><small>Повторные покупатели</small><b>${c.repeat_rate}%</b><span class="pill">из ${c.buyers} покупателей</span></div>
  </div>
  <div class="an-grid an-2">
    <div class="glass card"><h3>Выручка по дням</h3><div class="chart">${d.days.map((x, i) => `<div class="col" title="${esc(x.day)}: ${money(x.revenue)} so'm, заказов ${x.orders}"><span>${x.revenue ? money(x.revenue / 1000) + 'k' : ''}</span><i style="height:${Math.max(2, x.revenue / maxRev * 78)}%"></i><span>${esc(showDay(x, i))}</span></div>`).join('') || '<div class="muted">Нет данных</div>'}</div></div>
    <div class="glass card"><h3>Часы пик (заказы)</h3><div class="chart hours">${d.by_hour.map((n, h) => `<div class="col" title="${h}:00 — ${n}"><span>${n || ''}</span><i style="height:${Math.max(2, n / Math.max(1, ...d.by_hour) * 78)}%"></i><span>${h % 3 === 0 ? h : ''}</span></div>`).join('')}</div></div>
  </div>
  <div class="an-grid an-2">
    <div class="glass card"><h3>Филиалы: куда идут заказы</h3>${hbars(d.by_branch, 'orders', b => b.name, b => `${money(b.revenue)} so'm · средний чек ${money(b.avg)} · доставка ${b.delivery} / в пиццерии ${b.pickup}`)}</div>
    <div class="glass card"><h3>Самые продаваемые товары</h3>${hbars(d.top_products, 'qty', p => p.name, p => `${money(p.revenue)} so'm${p.best_branch && !St.branch && St.me.role === 'super' ? ' · больше всего: ' + p.best_branch : ''}`)}</div>
  </div>
  <div class="an-grid an-3">${splitCard('Тип заказа', d.by_type, TYPE)}${splitCard('Оплата', d.by_payment, PAY)}${splitCard('Статусы заказов', d.by_status, STATUS)}</div>
  <div class="glass card"><div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:10px"><h3 style="margin:0">Клиенты</h3><input class="search" id="q" placeholder="Поиск по имени или телефону" value="${esc(St.q)}"></div><div class="scrollx" id="cust"></div></div>`;
  $('#q').addEventListener('input', e => { St.q = e.target.value; clearTimeout(St.timer); St.timer = setTimeout(loadCustomers, 300); });
  loadCustomers();
}
async function loadCustomers() {
  const { rows } = await api(`analytics/customers?q=${encodeURIComponent(St.q)}${St.branch ? '&branch_id=' + St.branch : ''}`);
  $('#cust').innerHTML = `<table class="tbl"><thead><tr><th>Клиент</th><th>Заказов</th><th>Потратил, so'm</th><th>Последний заказ</th><th>WendyCoin</th><th>Регистрация</th></tr></thead><tbody>${rows.map(u => `<tr class="click" data-uid="${u.id}"><td><b>${esc(u.name || 'Без имени')}</b><div class="faint">${esc(u.phone)}</div></td><td>${u.orders}</td><td><b>${money(u.spent)}</b></td><td class="faint">${esc(u.last_order || '—')}</td><td>${money(u.coins)}</td><td class="faint">${esc(String(u.created_at).slice(0, 10))}</td></tr>`).join('') || '<tr><td colspan="6"><div class="empty">Клиентов не найдено</div></td></tr>'}</tbody></table>`;
}
async function openCustomer(id) {
  let r; try { r = await api(`analytics/customers/${id}/orders${St.branch ? '?branch_id=' + St.branch : ''}`); } catch (e) { return alert(e.message); }
  const spent = r.orders.filter(o => o.status !== 'cancelled').reduce((n, o) => n + o.total, 0);
  const o = document.createElement('div'); o.className = 'overlay';
  o.innerHTML = `<div class="glass modal" style="max-width:680px"><div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start"><div><h2>${esc(r.user.name || 'Без имени')}</h2><div class="muted">${esc(r.user.phone)} · с ${esc(String(r.user.created_at).slice(0, 10))}</div></div><button class="btn sm" data-close>Закрыть</button></div>
    <div class="an-grid" style="grid-template-columns:repeat(3,1fr);margin:16px 0"><div class="glass kpi" style="padding:14px"><small>Заказов</small><b style="font-size:24px">${r.orders.length}</b></div><div class="glass kpi" style="padding:14px"><small>Потратил</small><b style="font-size:24px">${money(spent)}</b></div><div class="glass kpi" style="padding:14px"><small>WendyCoin</small><b style="font-size:24px">${money(r.user.coins)}</b></div></div>
    <h3 style="margin-bottom:8px">История заказов</h3><div style="max-height:46vh;overflow-y:auto">${r.orders.map(x => `<div class="row" style="align-items:flex-start"><div><b>№${x.id}</b> <span class="pill ${x.status === 'done' ? 'ok' : x.status === 'cancelled' ? 'bad' : 'info'}">${esc(STATUS[x.status] || x.status)}</span><div class="muted" style="font-size:13px;margin-top:4px">${esc(x.items.map(i => i.name + ' × ' + i.qty).join(', '))}</div><div class="faint" style="font-size:12px">${esc(x.created_at)} · ${esc(x.branch_name || '')} · ${esc(TYPE[x.type] || '')} · ${esc(PAY[x.payment] || x.payment)}</div></div><b style="white-space:nowrap">${money(x.total)}</b></div>`).join('') || '<div class="empty">Заказов нет</div>'}</div></div>`;
  document.body.appendChild(o);
  o.addEventListener('click', e => { if (e.target === o || e.target.closest('[data-close]')) o.remove(); });
}

async function init() {
  try { St.me = (await api('auth/me')).admin; } catch { return; }
  if (!['super', 'manager'].includes(St.me.role)) { location.replace(`/${PANEL}/`); return; }
  if (St.me.role === 'super') St.branches = (await api('branches')).rows;
  $('#root').innerHTML = `<div class="an"><div class="an-top"><div class="brand"><img class="logo" src="/img/brand.png" alt=""><span>Аналитика</span></div><span class="sp"></span>
    <div class="tabs" style="margin:0" id="periods">${PERIODS.map(([k, t]) => `<button class="${k === St.period ? 'on' : ''}" data-p="${k}">${t}</button>`).join('')}</div>
    ${St.me.role === 'super' ? `<select id="br"><option value="">Все филиалы</option>${St.branches.map(b => `<option value="${b.id}">${esc(b.name || b.address)}</option>`).join('')}</select>` : ''}
    <a class="btn" href="/${PANEL}/">← ${PANEL === 'manager' ? 'Панель менеджера' : 'Админ-панель'}</a></div><div id="body"><div class="skeleton"></div></div></div>`;
  $('#periods').addEventListener('click', e => { const b = e.target.closest('[data-p]'); if (!b) return; St.period = b.dataset.p; $('#periods').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); load(); });
  $('#br')?.addEventListener('change', e => { St.branch = e.target.value; load(); });
  document.addEventListener('click', e => { const r = e.target.closest('[data-uid]'); if (r) openCustomer(r.dataset.uid); });
  load(); setInterval(() => { if (!document.querySelector('.overlay')) load(); }, 60000);
}
if (token) init();
