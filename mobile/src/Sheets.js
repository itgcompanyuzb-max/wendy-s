// Native sheets (iOS card style): product, cart, WendyCoin, pay QR.
import React, { useEffect, useRef, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, RED, api, fmt, haptic, img, loc, money, t, when } from './lib';
import { Check, Down, Gift, Percent, Plus, Qr, Trash, X } from './icons';
import { Photo, PricePill, Stepper, qtyOf } from './Home';
import QR from './qr';

function Sheet({ visible, onClose, children, bg = '#111113' }) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: bg }}>{children}</View>
    </Modal>
  );
}
const Grab = () => <View style={s.grab} />;

/* ---------- product ---------- */
export function ProductSheet({ p, menu, cart, onAdd, onDec, onClose, off }) {
  const insets = useSafeAreaInsets();
  if (!p) return null;
  const addons = (p.addons || []).map((id) => menu.products.find((x) => x.id === id)).filter(Boolean);
  return (
    <Sheet visible={!!p} onClose={onClose}>
      <Grab />
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        <View style={{ padding: 16 }}>
          <Photo p={p} style={{ width: '100%', aspectRatio: 1.15, borderRadius: 28 }} />
          <Text style={s.pH}>{loc(p, 'name')}</Text>
          <Text style={s.pD}>{loc(p, 'description')}</Text>
        </View>
        {addons.length ? (
          <View>
            <Text style={[s.h2, { marginHorizontal: 16 }]}>{t('С этим берут')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>
              {addons.map((a) => (
                <View key={a.id} style={s.rec}>
                  <Photo p={a} style={{ width: '100%', aspectRatio: 1, borderRadius: 16 }} />
                  <Text style={s.recH} numberOfLines={2}>{loc(a, 'name')}</Text>
                  <View style={{ flex: 1 }} />
                  <PricePill p={a} n={qtyOf(cart, a.id)} off={off.has(a.id)} onAdd={() => onAdd(a.id)} onDec={() => onDec(a.id)} />
                </View>
              ))}
            </ScrollView>
          </View>
        ) : null}
      </ScrollView>
      <View style={[s.foot, { paddingBottom: insets.bottom + 12 }]}>
        {off.has(p.id)
          ? <View style={[s.btn, { opacity: 0.5 }]}><Text style={s.btnT}>{t('Нет в наличии')}</Text></View>
          : <Pressable onPress={() => { onAdd(p.id); onClose(); }} style={({ pressed }) => [s.btn, pressed && s.pressed]}><Text style={s.btnT}>{money(p.price)}</Text></Pressable>}
      </View>
    </Sheet>
  );
}

/* ---------- cart ---------- */
export function CartSheet({ visible, menu, cart, onAdd, onDec, onClear, onCheckout, onClose }) {
  const insets = useSafeAreaInsets();
  const prod = (id) => menu.products.find((p) => p.id === id);
  const items = cart.filter((c) => prod(c.id));
  let sub = 0, full = 0;
  for (const c of items) { const p = prod(c.id); if (c.coin) continue; sub += p.price * c.qty; full += (p.old_price || p.price) * c.qty; }
  return (
    <Sheet visible={visible} onClose={onClose}>
      <Grab />
      <View style={s.cHead}>
        <Text style={s.cTitle}>{t('Корзина')}</Text>
        {items.length ? <Pressable hitSlop={10} onPress={() => { haptic('warning'); onClear(); }}><Trash size={24} color="#8e8e93" /></Pressable> : null}
      </View>
      {!items.length ? <Text style={s.emptyT}>{t('Корзина пуста')}</Text> : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 200 }}>
          {items.map((c) => {
            const p = prod(c.id);
            return (
              <View key={`${c.id}${c.coin ? 'c' : ''}`} style={s.ci}>
                <Photo p={p} style={{ width: 84, height: 84, borderRadius: 18 }} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.ciH} numberOfLines={2}>{loc(p, 'name')}</Text>
                  {c.coin ? <Text style={s.ciD}>{t('Обмен на WendyCoin')}</Text> : null}
                  <View style={s.ciBot}>
                    <View style={{ width: 120 }}><Stepper n={c.qty} onAdd={() => onAdd(p.id, c.coin)} onDec={() => onDec(p.id, c.coin)} /></View>
                    <View style={{ alignItems: 'flex-end' }}>
                      {!c.coin && p.old_price ? <Text style={s.old}>{money(p.old_price * c.qty)}</Text> : null}
                      <Text style={s.ciP}>{c.coin ? `${fmt(p.coin_cost * c.qty)} WC` : money(p.price * c.qty)}</Text>
                    </View>
                  </View>
                </View>
              </View>
            );
          })}
          <View style={s.tot}>
            <View style={s.totR}><Text style={s.totL}>{t('Товары')}</Text><Text style={s.totV}>{money(full)}</Text></View>
            {full > sub ? <View style={s.totR}><Text style={s.totL}>{t('Скидка')}</Text><Text style={[s.totV, { color: C.green }]}>−{money(full - sub)}</Text></View> : null}
            <Text style={s.note}>{t('Доставка рассчитается при оформлении')}</Text>
          </View>
        </ScrollView>
      )}
      {items.length ? (
        <View style={[s.foot, { paddingBottom: insets.bottom + 12 }]}>
          <Pressable onPress={() => { haptic('medium'); onCheckout(); }} style={({ pressed }) => [s.btn, pressed && s.pressed]}>
            <Text style={s.btnT}>{t('Оформить заказ')}</Text><Text style={s.btnS}>{money(sub)}</Text>
          </Pressable>
        </View>
      ) : null}
    </Sheet>
  );
}

/* ---------- WendyCoin ---------- */
export function CoinsSheet({ visible, token, coins, menu, onQR, onShop, onClose, setCoins }) {
  const [tab, setTab] = useState('hist');
  const [items, setItems] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!visible || !token) return;
    setItems(null); setErr(''); setTab('hist');
    api('/coins/history', { token }).then((r) => { setItems(r.items); setCoins(r.coins); }).catch((e) => setErr(e.message));
  }, [visible, token]);
  const pct = menu.settings.coin_percent || 10, rate = menu.settings.coin_value || 1;
  const steps = [
    [<Percent size={26} />, '#2fb352', t(`${pct}% с каждого заказа`), t('Возвращаем на баланс в WendyCoin')],
    [<Image source={{ uri: img('/img/coin.png') }} style={{ width: 40, height: 40 }} />, '#e9a41b', `1 WendyCoin = ${fmt(rate)} so'm`, t('По этому курсу коины списываются при оплате')],
    [<Qr size={26} />, RED, t('Оплата в ресторане'), t('Покажите QR-код кассиру или поднесите к сканеру киоска')],
    [<Gift size={26} />, '#4a6fe8', t('Обмен на товары'), t('Соусы, напитки и другие позиции — прямо в приложении')],
  ];
  return (
    <Sheet visible={visible} onClose={onClose} bg="#0d0d0f">
      <ScrollView stickyHeaderIndices={[1]} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={s.wTop}>
          <View style={s.wHead}><Text style={s.wTitle}>WendyCoin</Text><Pressable hitSlop={12} onPress={onClose}><Down size={26} /></Pressable></View>
          <View style={s.wBig}><Image source={{ uri: img('/img/coin.png') }} style={{ width: 56, height: 56 }} /><Text style={s.wN}>{fmt(coins)}</Text></View>
          <View style={s.wQr}>
            <Text style={s.wQrT}>{t('QR-код для оплаты в ресторане')}</Text>
            <Pressable onPress={onQR} style={({ pressed }) => [s.wQrB, pressed && s.pressed]}><Qr size={20} color="#111" /><Text style={s.wQrBT}>{t('Открыть')}</Text></Pressable>
          </View>
          {coins > 0 ? <Pressable onPress={onShop} style={({ pressed }) => [s.wMain, pressed && s.pressed]}><Text style={s.wMainT}>{t('Обменять на товары')}</Text></Pressable> : null}
        </View>
        <View style={{ backgroundColor: '#0d0d0f', paddingHorizontal: 16, paddingVertical: 12 }}>
          <View style={s.seg}>
            {[['hist', 'История'], ['how', 'Как это работает']].map(([k, l]) => (
              <Pressable key={k} onPress={() => { haptic('select'); setTab(k); }} style={[s.segB, tab === k && s.segOn]}><Text style={s.segT}>{t(l)}</Text></Pressable>
            ))}
          </View>
        </View>
        <View style={{ paddingHorizontal: 16 }}>
          {tab === 'how' ? steps.map(([ic, bg, h, d], i) => (
            <View key={i} style={s.step}><View style={[s.sic, { backgroundColor: bg }]}>{ic}</View><View style={{ flex: 1 }}><Text style={s.stepH}>{h}</Text><Text style={s.stepD}>{d}</Text></View></View>
          )) : items === null ? <Text style={s.emptyT}>{err || t('Загружаем…')}</Text>
            : !items.length ? <Text style={s.emptyT}>{t('Пока нет операций. За каждый заказ мы начисляем WendyCoin.')}</Text>
              : items.map((it) => (
                <View key={it.id} style={s.li}>
                  <View style={[s.liIc, it.delta > 0 && { backgroundColor: 'rgba(52,199,89,.16)' }]}>{it.delta > 0 ? <Plus size={20} color={C.green} /> : /ресторан/i.test(it.reason) ? <Qr size={20} color="#ddd" /> : <Minus2 />}</View>
                  <View style={{ flex: 1, minWidth: 0 }}><Text style={s.liH}>{when(it.created_at)}</Text><Text style={s.liD} numberOfLines={2}>{t(it.reason || (it.delta > 0 ? 'Начисление' : 'Списание'))}</Text></View>
                  <Text style={[s.liV, it.delta > 0 && { color: C.green }]}>{it.delta > 0 ? '+' : '−'}{fmt(Math.abs(it.delta))}</Text>
                </View>
              ))}
        </View>
      </ScrollView>
    </Sheet>
  );
}
const Minus2 = () => <View style={{ width: 16, height: 2.5, borderRadius: 2, backgroundColor: '#ddd' }} />;

/* ---------- pay QR ---------- */
function QrCode({ code, size }) {
  const { size: n, mod } = QR.matrix(code, 'H');
  const q = 2, cell = size / (n + q * 2);
  const hole = Math.ceil(n * 0.24 / 2) * 2 + 1, h0 = (n - hole) / 2, h1 = h0 + hole;
  const eye = (x, y) => (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
  const dots = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (!mod[y][x] || eye(x, y) || (x >= h0 && x < h1 && y >= h0 && y < h1)) continue;
    dots.push(<View key={`${x}-${y}`} style={{ position: 'absolute', left: (x + q) * cell + cell * 0.05, top: (y + q) * cell + cell * 0.05, width: cell * 0.9, height: cell * 0.9, borderRadius: cell * 0.32, backgroundColor: '#111' }} />);
  }
  const Eye = ({ x, y }) => (
    <View style={{ position: 'absolute', left: (x + q) * cell, top: (y + q) * cell, width: cell * 7, height: cell * 7, borderRadius: cell * 2.2, borderWidth: cell, borderColor: '#111', alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: cell * 3, height: cell * 3, borderRadius: cell, backgroundColor: '#111' }} />
    </View>
  );
  const c = (n / 2 + q) * cell, r = (hole / 2) * cell;
  return (
    <View style={{ width: size, height: size, backgroundColor: '#fff', borderRadius: size * 0.08 }}>
      {dots}
      <Eye x={0} y={0} /><Eye x={n - 7} y={0} /><Eye x={0} y={n - 7} />
      <View style={{ position: 'absolute', left: c - r, top: c - r, width: r * 2, height: r * 2, borderRadius: r, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
        <Image source={{ uri: img('/img/coin.png') }} style={{ width: r * 1.8, height: r * 1.8 }} />
      </View>
    </View>
  );
}

export function QRSheet({ visible, token, onClose, onPaid }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [code, setCode] = useState('');
  const [left, setLeft] = useState(0);
  const [total, setTotal] = useState(120);
  const [done, setDone] = useState(null);
  const [err, setErr] = useState('');
  const exp = useRef(0);
  const codeRef = useRef('');

  async function fresh() {
    try {
      const r = await api('/coins/qr', { token, method: 'POST' });
      codeRef.current = r.code; setCode(r.code); setTotal(r.expires_in); exp.current = Date.now() + r.expires_in * 1000; setLeft(r.expires_in); setErr('');
    } catch (e) { setErr(e.message); }
  }
  useEffect(() => {
    if (!visible) return undefined;
    setDone(null); setCode(''); codeRef.current = ''; fresh();
    const tick = setInterval(() => {
      if (!codeRef.current) return;
      const l = Math.max(0, Math.round((exp.current - Date.now()) / 1000));
      setLeft(l);
      if (l <= 0) { codeRef.current = ''; setCode(''); haptic('light'); fresh(); }
    }, 1000);
    const poll = setInterval(async () => {
      if (!codeRef.current) return;
      try {
        const r = await api('/coins/qr/' + codeRef.current, { token });
        if (r.state === 'used') { codeRef.current = ''; setDone(r); haptic('success'); onPaid(r.coins); }
      } catch { /* try again */ }
    }, 2500);
    return () => { clearInterval(tick); clearInterval(poll); };
  }, [visible]);

  const qs = Math.min(320, width - 64);
  return (
    <Sheet visible={visible} onClose={onClose}>
      <Grab />
      {done ? (
        <View style={{ alignItems: 'center', padding: 24, paddingTop: 40 }}>
          <View style={s.ok}><Check size={56} width={3.2} /></View>
          <Text style={[s.qT, { marginTop: 18 }]}>{t('Оплачено')}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}><Text style={s.spent}>−{fmt(done.spent)}</Text><Image source={{ uri: img('/img/coin.png') }} style={{ width: 34, height: 34 }} /></View>
          {done.branch ? <Text style={[s.qS, { marginTop: 10 }]}>{done.branch}</Text> : null}
          <Pressable onPress={onClose} style={({ pressed }) => [s.btn, { alignSelf: 'stretch', marginTop: 28 }, pressed && s.pressed]}><Text style={s.btnT}>{t('Готово')}</Text></Pressable>
        </View>
      ) : (
        <View style={{ alignItems: 'center', paddingHorizontal: 24, paddingTop: 8, paddingBottom: insets.bottom + 20 }}>
          <Text style={s.qT}>WendyCoin</Text>
          <Text style={s.qS}>{t('Покажите код кассиру или поднесите к сканеру киоска')}</Text>
          <View style={{ marginTop: 22, width: qs, height: qs, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderRadius: 30 }}>
            {code ? <QrCode code={code} size={qs - 24} /> : <Text style={{ color: '#666' }}>{err || t('Создаём код…')}</Text>}
          </View>
          <Text style={s.code}>{code ? code.replace(/^(..)(....)(....)(..)$/, '$1 $2 $3 $4') : ' '}</Text>
          <View style={[s.bar, { width: qs }]}><View style={{ height: '100%', width: `${code ? (left / (total || 120)) * 100 : 0}%`, backgroundColor: RED, borderRadius: 3 }} /></View>
          <Text style={[s.qS, { marginTop: 10, fontVariant: ['tabular-nums'] }]}>{code ? t(`Обновится через ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`) : t('Создаём код…')}</Text>
        </View>
      )}
    </Sheet>
  );
}

const s = StyleSheet.create({
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
  grab: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: '#3a3a3e', marginTop: 8, marginBottom: 6 },
  pH: { color: '#fff', fontSize: 28, fontWeight: '800', marginTop: 16 },
  pD: { color: '#b0b0b5', fontSize: 16, lineHeight: 22, marginTop: 8 },
  h2: { color: '#fff', fontSize: 21, fontWeight: '800', marginTop: 10, marginBottom: 12 },
  rec: { width: 150, backgroundColor: C.card, borderRadius: 20, padding: 10 },
  recH: { color: '#fff', fontSize: 14.5, fontWeight: '700', marginTop: 8, marginBottom: 10, lineHeight: 18 },
  foot: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, backgroundColor: 'rgba(17,17,19,.96)' },
  btn: { height: 58, borderRadius: 29, backgroundColor: RED, alignItems: 'center', justifyContent: 'center' },
  btnT: { color: '#fff', fontSize: 19, fontWeight: '800' },
  btnS: { color: 'rgba(255,255,255,.85)', fontSize: 13.5, fontWeight: '600', marginTop: 1 },
  cHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 6, paddingBottom: 12 },
  cTitle: { color: '#fff', fontSize: 30, fontWeight: '800' },
  emptyT: { color: C.gray, textAlign: 'center', marginTop: 30, fontSize: 16, lineHeight: 22, paddingHorizontal: 20 },
  ci: { flexDirection: 'row', gap: 12, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,.1)' },
  ciH: { color: '#fff', fontSize: 17, fontWeight: '700' },
  ciD: { color: C.gold, fontSize: 13.5, marginTop: 3 },
  ciBot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  ciP: { color: '#fff', fontSize: 16.5, fontWeight: '800' },
  old: { color: '#8e8e93', fontSize: 13, textDecorationLine: 'line-through' },
  tot: { marginTop: 18, padding: 16, borderRadius: 20, backgroundColor: C.card, gap: 10 },
  totR: { flexDirection: 'row', justifyContent: 'space-between' },
  totL: { color: C.gray, fontSize: 16 }, totV: { color: '#fff', fontSize: 16, fontWeight: '700' },
  note: { color: '#77777c', fontSize: 13.5 },
  wTop: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 22, backgroundColor: '#c4162f', borderBottomLeftRadius: 30, borderBottomRightRadius: 30 },
  wHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  wTitle: { color: '#fff', fontSize: 30, fontWeight: '800' },
  wBig: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginVertical: 16 },
  wN: { color: '#fff', fontSize: 52, fontWeight: '800' },
  wQr: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, paddingLeft: 18, borderRadius: 22, backgroundColor: 'rgba(255,255,255,.14)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,.25)' },
  wQrT: { flex: 1, color: '#fff', fontSize: 16.5, fontWeight: '600' },
  wQrB: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, paddingHorizontal: 18, borderRadius: 23, backgroundColor: '#fff' },
  wQrBT: { color: '#111', fontSize: 16.5, fontWeight: '700' },
  wMain: { marginTop: 14, height: 56, borderRadius: 28, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center' },
  wMainT: { color: '#1a1a1a', fontSize: 18, fontWeight: '800' },
  seg: { flexDirection: 'row', padding: 4, borderRadius: 26, backgroundColor: C.card },
  segB: { flex: 1, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: RED },
  segT: { color: '#fff', fontSize: 16, fontWeight: '700' },
  step: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 22, backgroundColor: C.card, marginBottom: 10 },
  sic: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  stepH: { color: '#fff', fontSize: 17, fontWeight: '700' },
  stepD: { color: C.gray, fontSize: 14.5, lineHeight: 19, marginTop: 3 },
  li: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,.08)' },
  liIc: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,.08)', alignItems: 'center', justifyContent: 'center' },
  liH: { color: '#fff', fontSize: 16, fontWeight: '700' },
  liD: { color: C.gray, fontSize: 14, marginTop: 2 },
  liV: { color: '#fff', fontSize: 17, fontWeight: '800' },
  qT: { color: '#fff', fontSize: 28, fontWeight: '800' },
  qS: { color: C.gray, fontSize: 15.5, textAlign: 'center', marginTop: 6, lineHeight: 21 },
  code: { color: '#c7c7cc', fontSize: 17, fontWeight: '700', letterSpacing: 2, marginTop: 16, fontFamily: 'Menlo' },
  bar: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,.1)', overflow: 'hidden', marginTop: 16 },
  ok: { width: 104, height: 104, borderRadius: 52, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' },
  spent: { color: C.gold, fontSize: 36, fontWeight: '800' },
});
