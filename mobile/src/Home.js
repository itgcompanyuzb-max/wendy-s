// Native menu: header with address, WendyCoin bar, banners, sticky categories, products, cart button.
import React, { useMemo, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, RED, fmt, haptic, img, loc, money, t } from './lib';
import { Bag, Down, Fork, Minus, Plus, Qr, Receipt, Search, Walk } from './icons';

export const qtyOf = (cart, id) => cart.find((c) => c.id === id && !c.coin)?.qty || 0;

export function Stepper({ n, onAdd, onDec, big }) {
  return (
    <View style={[s.stepper, big && { height: 50 }]}>
      <Pressable hitSlop={8} onPress={onDec} style={s.stBtn}><Minus size={20} /></Pressable>
      <Text style={s.stN}>{n}</Text>
      <Pressable hitSlop={8} onPress={onAdd} style={s.stBtn}><Plus size={20} /></Pressable>
    </View>
  );
}

export function PricePill({ p, n, off, onAdd, onDec }) {
  if (off) return <View style={[s.pill, { opacity: 0.5 }]}><Text style={s.pillT}>{t('Нет в наличии')}</Text></View>;
  if (n > 0) return <Stepper n={n} onAdd={onAdd} onDec={onDec} />;
  return (
    <Pressable onPress={onAdd} style={({ pressed }) => [s.pill, pressed && s.pressed]}>
      {p.old_price ? <Text style={s.old}>{money(p.old_price)}</Text> : null}
      <Text style={s.pillT}>{money(p.price)}</Text>
    </Pressable>
  );
}

export function Photo({ p, style, round }) {
  const u = img(p.image);
  return (
    <View style={[s.ph, style, round && { borderRadius: 999 }]}>
      {u ? <Image source={{ uri: u }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : <Text style={s.phT}>{(loc(p, 'name') || '?').slice(0, 1)}</Text>}
    </View>
  );
}

export default function Home({ menu, web, cart, coins, onAdd, onDec, onProduct, onCart, onCoins, onQR, onWeb }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const scroll = useRef(null);
  const chips = useRef(null);
  const secY = useRef({});
  const chipX = useRef({});
  const lock = useRef(0);
  const [cat, setCat] = useState(menu.categories[0]?.id);
  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState('');
  const round = menu.settings.product_image_shape === 'circle';
  const off = new Set(web.mode === 'pickup' && web.branchId ? menu.stock_off?.[web.branchId] || [] : []);
  const colW = (width - 16 * 2 - 12) / 2;

  const sections = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return menu.categories.map((c) => {
      let items = menu.products.filter((p) => p.category_id === c.id);
      if (qq) items = items.filter((p) => `${p.name} ${p.description} ${loc(p, 'name')} ${loc(p, 'description')}`.toLowerCase().includes(qq));
      return { c, items };
    }).filter((x) => x.items.length);
  }, [menu, q, web.lang]);

  const total = cart.reduce((sum, c) => { const p = menu.products.find((x) => x.id === c.id); return sum + (p && !c.coin ? p.price * c.qty : 0); }, 0);
  const count = cart.reduce((n, c) => n + c.qty, 0);

  function goCat(id) {
    haptic('select'); setCat(id); lock.current = Date.now() + 900;
    const y = secY.current[id];
    if (y != null) scroll.current?.scrollTo({ y: Math.max(0, y - 62), animated: true });
    centerChip(id);
  }
  function centerChip(id) {
    const x = chipX.current[id];
    if (x) chips.current?.scrollTo({ x: Math.max(0, x.x - (width - x.w) / 2), animated: true });
  }
  function onScroll(e) {
    if (Date.now() < lock.current) return;
    const y = e.nativeEvent.contentOffset.y + 80;
    let cur = sections[0]?.c.id;
    for (const { c } of sections) if (secY.current[c.id] != null && secY.current[c.id] <= y) cur = c.id;
    if (cur !== cat) { setCat(cur); haptic('select'); centerChip(cur); }
  }

  const card = (p) => {
    const n = qtyOf(cart, p.id), dis = off.has(p.id);
    const pill = <PricePill p={p} n={n} off={dis} onAdd={() => onAdd(p.id)} onDec={() => onDec(p.id)} />;
    if (p.big) {
      return (
        <Pressable key={p.id} onPress={() => onProduct(p)} style={({ pressed }) => [s.big, pressed && s.pressed]}>
          <Photo p={p} style={{ width: '100%', aspectRatio: 1.45, borderRadius: 24 }} />
          {p.badge ? <Text style={s.badge}>{p.badge}</Text> : null}
          <Text style={s.bigH}>{loc(p, 'name')}</Text>
          <Text style={s.desc} numberOfLines={2}>{loc(p, 'description')}</Text>
          <View style={{ marginTop: 12, alignSelf: 'flex-start', minWidth: 170 }}>{pill}</View>
        </Pressable>
      );
    }
    return (
      <Pressable key={p.id} onPress={() => onProduct(p)} style={({ pressed }) => [s.pc, { width: colW }, pressed && s.pressed]}>
        <Photo p={p} round={round} style={{ width: '100%', aspectRatio: 1, borderRadius: round ? 999 : 20 }} />
        {p.badge ? <Text style={[s.badge, { top: 8, left: 8 }]}>{p.badge}</Text> : null}
        <Text style={s.pcH} numberOfLines={2}>{loc(p, 'name')}</Text>
        <Text style={[s.desc, { fontSize: 13.5 }]} numberOfLines={2}>{loc(p, 'description')}</Text>
        <View style={{ flex: 1 }} />
        <View style={{ marginTop: 10 }}>{pill}</View>
      </Pressable>
    );
  };

  return (
    <View style={s.fill}>
      <View style={[s.head, { paddingTop: insets.top + 6 }]}>
        <Pressable onPress={() => { haptic('light'); onWeb('addr'); }} style={s.circle}>{web.mode === 'pickup' ? <Fork color={RED} size={24} /> : <Walk color={RED} size={24} />}</Pressable>
        <Pressable onPress={() => { haptic('light'); onWeb('addr'); }} style={s.addr}>
          <Text style={s.addrT} numberOfLines={1}>{t(web.title || 'Укажите адрес доставки')}</Text><Down size={18} />
        </Pressable>
        <Pressable onPress={() => { haptic('light'); onWeb('profile'); }} style={s.avatar}>
          <Image source={{ uri: img(`/img/avatars/${web.avatar || 9}.png`) }} style={{ width: 52, height: 52 }} />
        </Pressable>
      </View>

      <ScrollView ref={scroll} stickyHeaderIndices={[2]} onScroll={onScroll} scrollEventThrottle={32} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={s.coinbar}>
          <Pressable onPress={onCoins} style={s.cbL}><Image source={{ uri: img('/img/coin.png') }} style={{ width: 42, height: 42 }} /><Text style={s.cbN}>{fmt(coins)}</Text></Pressable>
          <Pressable onPress={onQR} style={({ pressed }) => [s.cbQr, pressed && s.pressed]}><Qr size={22} /><Text style={s.cbQrT}>{t('QR-код')}</Text></Pressable>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }} style={{ marginBottom: 6 }}>
          {menu.banners.map((b) => (
            <Pressable key={b.id} onPress={() => { haptic('light'); onWeb('banner', b.id); }} style={[s.story, { backgroundColor: b.color || '#222' }]}>
              {b.image ? <Image source={{ uri: img(b.image) }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
              {!b.image ? <Text style={s.storyT}>{loc(b, 'title')}</Text> : null}
            </Pressable>
          ))}
        </ScrollView>

        <View style={s.catbar}>
          <ScrollView ref={chips} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, alignItems: 'center' }}>
            <Pressable onPress={() => { haptic('select'); setSearchOpen((v) => !v); setQ(''); }} style={s.sbtn}><Search size={22} /></Pressable>
            {menu.categories.map((c) => (
              <Pressable key={c.id} onLayout={(e) => { chipX.current[c.id] = { x: e.nativeEvent.layout.x, w: e.nativeEvent.layout.width }; }} onPress={() => goCat(c.id)} style={[s.ch, c.id === cat && s.chOn]}>
                <Text style={[s.chT, c.id === cat && { color: '#000' }]}>{loc(c, 'name')}</Text>
              </Pressable>
            ))}
          </ScrollView>
          {searchOpen ? <TextInput autoFocus value={q} onChangeText={setQ} placeholder={t('Поиск по меню')} placeholderTextColor="#777" style={s.search} returnKeyType="search" clearButtonMode="while-editing" /> : null}
        </View>

        {sections.length ? sections.map(({ c, items }) => (
          <View key={c.id} onLayout={(e) => { secY.current[c.id] = e.nativeEvent.layout.y; }} style={{ paddingHorizontal: 16 }}>
            <Text style={s.sec}>{loc(c, 'name')}</Text>
            {items.filter((p) => p.big).map(card)}
            <View style={s.grid}>{items.filter((p) => !p.big).map(card)}</View>
          </View>
        )) : <Text style={s.empty}>{t('Ничего не найдено')}</Text>}
        <View style={{ height: 120 + insets.bottom }} />
      </ScrollView>

      {count > 0 ? (
        <Pressable onPress={onCart} style={({ pressed }) => [s.fab, { bottom: insets.bottom + 12 }, pressed && s.pressed]}><Bag size={28} /><Text style={s.fabT}>{money(total)}</Text></Pressable>
      ) : web.activeOrder ? (
        <Pressable onPress={() => { haptic('medium'); onWeb('profile'); }} style={({ pressed }) => [s.fab, { bottom: insets.bottom + 12 }, pressed && s.pressed]}><Receipt size={26} /><Text style={s.fabT}>{t('Мои заказы')}</Text></Pressable>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1, backgroundColor: C.bg },
  pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 10, gap: 8, backgroundColor: C.bg },
  circle: { width: 52, height: 52, borderRadius: 26, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  addr: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minWidth: 0 },
  addrT: { color: '#fff', fontSize: 17, fontWeight: '600', flexShrink: 1 },
  avatar: { width: 52, height: 52, borderRadius: 26, overflow: 'hidden', backgroundColor: C.card },
  coinbar: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginTop: 4, marginBottom: 14, height: 64, paddingLeft: 10, paddingRight: 8, borderRadius: 22, backgroundColor: '#c8162f', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,.25)' },
  cbL: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, height: '100%' },
  cbN: { color: '#fff', fontSize: 26, fontWeight: '800' },
  cbQr: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 48, paddingHorizontal: 16, borderRadius: 16, backgroundColor: 'rgba(255,255,255,.16)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,.35)' },
  cbQrT: { color: '#fff', fontSize: 17, fontWeight: '700' },
  story: { width: 116, height: 150, borderRadius: 22, overflow: 'hidden', justifyContent: 'flex-end', padding: 10 },
  storyT: { color: '#fff', fontSize: 14, fontWeight: '700' },
  catbar: { backgroundColor: C.bg, paddingVertical: 8 },
  sbtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: C.card2, alignItems: 'center', justifyContent: 'center' },
  ch: { height: 46, paddingHorizontal: 18, borderRadius: 23, justifyContent: 'center' },
  chOn: { backgroundColor: '#fff' },
  chT: { color: '#ddd', fontSize: 17, fontWeight: '600' },
  search: { marginHorizontal: 16, marginTop: 10, height: 48, borderRadius: 24, backgroundColor: C.card, color: '#fff', paddingHorizontal: 18, fontSize: 17 },
  sec: { color: '#fff', fontSize: 28, fontWeight: '800', marginTop: 22, marginBottom: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  big: { marginBottom: 18 },
  bigH: { color: '#fff', fontSize: 22, fontWeight: '800', marginTop: 12 },
  pc: { backgroundColor: C.card, borderRadius: 24, padding: 10, paddingBottom: 12 },
  pcH: { color: '#fff', fontSize: 16, fontWeight: '700', marginTop: 10, lineHeight: 20 },
  desc: { color: C.gray, fontSize: 14.5, lineHeight: 19, marginTop: 4 },
  badge: { position: 'absolute', top: 12, left: 12, backgroundColor: RED, color: '#fff', fontSize: 12, fontWeight: '800', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, overflow: 'hidden' },
  ph: { backgroundColor: C.card2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  phT: { color: '#555', fontSize: 34, fontWeight: '800' },
  pill: { height: 44, borderRadius: 22, backgroundColor: C.card2, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, flexDirection: 'row', gap: 6 },
  pillT: { color: '#fff', fontSize: 15.5, fontWeight: '700' },
  old: { color: '#8e8e93', fontSize: 13, textDecorationLine: 'line-through' },
  stepper: { height: 44, borderRadius: 22, backgroundColor: RED, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 6 },
  stBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  stN: { color: '#fff', fontSize: 17, fontWeight: '800' },
  empty: { color: C.gray, textAlign: 'center', marginTop: 40, fontSize: 16 },
  fab: { position: 'absolute', right: 14, height: 56, paddingLeft: 16, paddingRight: 22, borderRadius: 28, backgroundColor: RED, flexDirection: 'row', alignItems: 'center', gap: 10, shadowColor: RED, shadowOpacity: 0.45, shadowRadius: 14, shadowOffset: { width: 0, height: 8 } },
  fabT: { color: '#fff', fontSize: 19, fontWeight: '800' },
});
