// Wendy's app: native menu, product, cart and WendyCoin screens.
// Login, checkout, address/map, profile, banners and the coin shop still come from the website (src/WebShell),
// which stays loaded behind the native screens and slides in when needed.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SplashScreen from 'expo-splash-screen';
import Home from './src/Home';
import WebShell from './src/WebShell';
import { CartSheet, CoinsSheet, ProductSheet, QRSheet } from './src/Sheets';
import { RED, api, haptic, setLang, t } from './src/lib';

SplashScreen.preventAutoHideAsync().catch(() => { });

export default function App() {
  return <SafeAreaProvider><Main /></SafeAreaProvider>;
}

function Main() {
  const [menu, setMenu] = useState(null);
  const [failed, setFailed] = useState(false);
  const [web, setWeb] = useState({ mode: 'delivery', title: '', token: null, lang: 'ru', avatar: 9, activeOrder: null, idle: false, known: false });
  const [cart, setCart] = useState([]);
  const [coins, setCoins] = useState(0);
  const [showWeb, setShowWeb] = useState(false);
  const [product, setProduct] = useState(null);
  const [sheet, setSheet] = useState(null); // 'cart' | 'coins' | 'qr'
  const shell = useRef(null);
  const showRef = useRef(false);
  const opened = useRef({ at: 0, busy: false });
  const cartRef = useRef([]);
  const fromWeb = useRef(false);
  useEffect(() => { showRef.current = showWeb; }, [showWeb]);

  /* menu: last copy at once, then fresh from the server */
  const loadMenu = useCallback(async () => {
    try {
      const m = await api('/menu');
      setMenu(m); setFailed(false);
      AsyncStorage.setItem('menu', JSON.stringify(m)).catch(() => { });
    } catch { if (!menu) setFailed(true); }
  }, [menu]);
  useEffect(() => {
    AsyncStorage.multiGet(['menu', 'cart']).then(([[, m], [, c]]) => {
      try { if (m) setMenu(JSON.parse(m)); } catch { /* broken cache */ }
      try { if (c) { const v = JSON.parse(c); cartRef.current = v; setCart(v); } } catch { /* broken cache */ }
    }).finally(loadMenu);
  }, []);

  /* the logo screen stays until the menu and the login state are known */
  const hidden = useRef(false);
  const hideSplash = useCallback(() => { if (!hidden.current) { hidden.current = true; SplashScreen.hideAsync().catch(() => { }); } }, []);
  useEffect(() => { if ((menu && web.known) || failed) hideSplash(); }, [menu, web.known, failed]);
  useEffect(() => { const tm = setTimeout(hideSplash, 9000); return () => clearTimeout(tm); }, []);

  /* the cart: saved on the phone, and passed to the website part */
  const changeCart = useCallback((next) => {
    cartRef.current = next; setCart(next);
    AsyncStorage.setItem('cart', JSON.stringify(next)).catch(() => { });
    if (!fromWeb.current) shell.current?.setCart(next);
  }, []);
  const add = useCallback((id, coin) => {
    haptic('light');
    const c = cartRef.current, i = c.findIndex((x) => x.id === id && !!x.coin === !!coin);
    changeCart(i >= 0 ? c.map((x, k) => (k === i ? { ...x, qty: Math.min(50, x.qty + 1) } : x)) : [...c, coin ? { id, qty: 1, coin: true } : { id, qty: 1 }]);
  }, []);
  const dec = useCallback((id, coin) => {
    haptic('light');
    const c = cartRef.current, i = c.findIndex((x) => x.id === id && !!x.coin === !!coin);
    if (i < 0) return;
    changeCart(c[i].qty <= 1 ? c.filter((_, k) => k !== i) : c.map((x, k) => (k === i ? { ...x, qty: x.qty - 1 } : x)));
  }, []);

  /* state from the website part: login, language, address, cart after checkout */
  const onState = useCallback((st) => {
    setLang(st.lang);
    setWeb({ ...st, known: true });
    if (st.token) setCoins(st.coins || 0);
    if (!st.idle) opened.current.busy = true;
    if (!st.token) { if (!showRef.current) { opened.current = { at: Date.now(), busy: true }; setShowWeb(true); } return; }
    if (showRef.current) {
      fromWeb.current = true; changeCart(st.cart || []); fromWeb.current = false;
      if (st.idle && opened.current.busy && Date.now() - opened.current.at > 700) setShowWeb(false);
    }
  }, []);

  const openWeb = useCallback((cmd, arg) => {
    setSheet(null); setProduct(null);
    opened.current = { at: Date.now(), busy: false };
    shell.current?.run(cmd, cartRef.current, arg);
    setShowWeb(true);
  }, []);

  /* balance after login and after paying in a restaurant */
  useEffect(() => {
    if (!web.token) return;
    api('/me', { token: web.token }).then((r) => setCoins(r.user.coins || 0)).catch(() => { });
  }, [web.token]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (showRef.current) { shell.current?.closeTop(); return true; }
      return false;
    });
    return () => sub.remove();
  }, []);

  const needLogin = () => { if (!web.token) { openWeb('login'); return true; } return false; };

  if (failed && !menu) {
    return (
      <View style={[s.fill, s.center, { padding: 28 }]}>
        <StatusBar style="light" />
        <Image source={require('./assets/icon.png')} style={s.logo} />
        <Text style={s.title}>{t('Нет подключения')}</Text>
        <Text style={s.hint}>{t('Проверьте интернет и попробуйте ещё раз')}</Text>
        <Pressable style={({ pressed }) => [s.btn, pressed && { opacity: 0.8 }]} onPress={() => { haptic('light'); setFailed(false); loadMenu(); shell.current?.reload(); }}>
          <Text style={s.btnText}>{t('Повторить')}</Text>
        </Pressable>
      </View>
    );
  }

  const off = new Set(menu && web.mode === 'pickup' && web.branchId ? menu.stock_off?.[web.branchId] || [] : []);
  return (
    <View style={s.fill}>
      <StatusBar style="light" />
      {menu ? (
        <Home
          menu={menu} web={web} cart={cart} coins={coins}
          onAdd={(id) => add(id)} onDec={(id) => dec(id)}
          onProduct={(p) => { haptic('light'); setProduct(p); }}
          onCart={() => { haptic('medium'); setSheet('cart'); }}
          onCoins={() => { haptic('light'); if (!needLogin()) setSheet('coins'); }}
          onQR={() => { haptic('light'); if (!needLogin()) setSheet('qr'); }}
          onWeb={openWeb}
        />
      ) : <View style={s.fill} />}
      {menu ? (
        <>
          <ProductSheet p={product} menu={menu} cart={cart} off={off} onAdd={add} onDec={dec} onClose={() => setProduct(null)} />
          <CartSheet visible={sheet === 'cart'} menu={menu} cart={cart} onAdd={add} onDec={dec} onClear={() => { changeCart([]); setSheet(null); }} onCheckout={() => { if (!needLogin()) openWeb('checkout'); }} onClose={() => setSheet(null)} />
          <CoinsSheet visible={sheet === 'coins'} token={web.token} coins={coins} menu={menu} setCoins={setCoins} onQR={() => setSheet('qr')} onShop={() => openWeb('coinShop')} onClose={() => setSheet(null)} />
          <QRSheet visible={sheet === 'qr'} token={web.token} onPaid={setCoins} onClose={() => setSheet(null)} />
        </>
      ) : null}
      <WebShell ref={shell} visible={showWeb} onState={onState} onFail={() => { if (!menu) setFailed(true); }} />
    </View>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#000' },
  center: { alignItems: 'center', justifyContent: 'center' },
  logo: { width: 96, height: 96, borderRadius: 22, marginBottom: 22 },
  title: { color: '#fff', fontSize: 26, fontWeight: '800', marginBottom: 8 },
  hint: { color: '#9a9aa0', fontSize: 15, lineHeight: 21, marginBottom: 26, textAlign: 'center' },
  btn: { alignSelf: 'stretch', backgroundColor: RED, borderRadius: 28, paddingVertical: 17, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
