import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, BackHandler, Image, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';
import * as Haptics from 'expo-haptics';
import * as SplashScreen from 'expo-splash-screen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import BUNDLED, { VERSION as BUNDLED_VERSION } from './src/bundle';
import { askPermission, cancelCart, checkNews, onTap, scheduleCart, startBackground } from './src/notify';

// keep the logo screen up until the menu is drawn: no spinner, no white page
SplashScreen.preventAutoHideAsync().catch(() => { });

const URL = 'https://wendy-s-r2cm.onrender.com';

/* The screens come from the web app that is built into this app (src/bundle.js): they open at once, without the internet.
   The data (menu, orders, coins) comes from the server. When the server has a newer design, it is downloaded
   in the background and used from the next start — no new install needed. */
const K = { html: 'bundle_html', ver: 'bundle_version', base: 'bundle_base' };
async function savedBundle() {
  try {
    const [[, html], [, ver], [, base]] = await AsyncStorage.multiGet([K.html, K.ver, K.base]);
    // a copy downloaded for an older install is dropped: the new install brings its own
    if (html && ver && base === BUNDLED_VERSION) return { html, ver };
  } catch { /* nothing saved */ }
  return { html: BUNDLED, ver: BUNDLED_VERSION };
}
async function checkUpdate(current) {
  try {
    const r = await fetch(URL + '/app-bundle.json', { headers: { 'Cache-Control': 'no-cache' } });
    const { version } = await r.json();
    if (!version || version === current) return;
    const h = await fetch(URL + '/app-bundle.html', { headers: { 'Cache-Control': 'no-cache' } });
    const html = await h.text();
    if (!h.ok || !html.includes(`window.__BUNDLE__ = '${version}'`)) return; // only a complete copy
    await AsyncStorage.multiSet([[K.html, html], [K.ver, version], [K.base, BUNDLED_VERSION]]);
  } catch { /* offline: try next time */ }
}
const ORIGIN = URL.replace(/^(https?:\/\/[^/]+).*$/, '$1');
const BG = '#000';
const RED = '#e21d3c';

// the web app asks for vibration with postMessage({ haptic: 'select' | 'light' | 'medium' | 'success' | 'warning' })
function vibrate(k) {
  try {
    if (k === 'select') Haptics.selectionAsync();
    else if (k === 'light') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    else if (k === 'medium') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    else if (k === 'heavy') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    else if (k === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    else if (k === 'warning') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    else if (k === 'error') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  } catch { /* no haptic engine */ }
}

// runs before the page: no text selection, no long-press menus, no grey tap flash, no pinch zoom — feels like an app
const NATIVE_FEEL = `
  window.__WENDYS_APP__ = true;
  document.documentElement.classList.add('native-app');
  var st = document.createElement('style');
  st.textContent = '*{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}'
    + 'input,textarea,[contenteditable]{-webkit-user-select:text;user-select:text}'
    + 'html,body{overscroll-behavior:none}';
  (document.head || document.documentElement).appendChild(st);
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); }, { passive: false });
  true;
`;

export default function App() {
  const [bundle, setBundle] = useState(null);
  useEffect(() => { savedBundle().then((b) => { setBundle(b); checkUpdate(b.ver); }); }, []);
  const [failed, setFailed] = useState(false);
  const [key, setKey] = useState(0);
  const web = useRef(null);
  const canGoBack = useRef(false);

  const shown = useRef(false);
  const showApp = useCallback(() => {
    if (shown.current) return;
    shown.current = true;
    SplashScreen.hideAsync().catch(() => { });
  }, []);
  useEffect(() => { const t = setTimeout(showApp, 10000); return () => clearTimeout(t); }, [showApp]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack.current && web.current) { web.current.goBack(); return true; }
      return false;
    });
    return () => sub.remove();
  }, []);

  /* notifications: the page tells who is signed in, the language and the cart; the phone shows its own notifications */
  const info = useRef(null);
  const loaded = useRef(false);
  const pendingTap = useRef(null);
  const openNotif = useCallback((n) => {
    if (!n) return;
    if (!loaded.current || !web.current) { pendingTap.current = n; return; }
    web.current.injectJavaScript(`window.openNotif && openNotif(${JSON.stringify(n)}); true;`);
  }, []);
  useEffect(() => onTap(openNotif), []);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') { cancelCart(); checkNews(); }
      else if (st === 'background') scheduleCart(info.current);
    });
    const tick = setInterval(() => { if (AppState.currentState === 'active') checkNews(); }, 15000);
    return () => { sub.remove(); clearInterval(tick); };
  }, []);
  const onAppInfo = useCallback(async (a) => {
    const before = info.current;
    info.current = a;
    try {
      if (a.token) await AsyncStorage.multiSet([['nf_token', a.token], ['nf_lang', a.lang || 'ru']]);
      else await AsyncStorage.multiRemove(['nf_token', 'nf_last']);
    } catch { /* storage full */ }
    if (a.token && (!before || before.token !== a.token)) {
      if (!before || !before.token) await AsyncStorage.removeItem('nf_last').catch(() => { }); // a new sign-in: start from now
      if (await askPermission()) { startBackground(); checkNews(); }
    }
  }, []);

  const onMessage = useCallback((e) => {
    let m; try { m = JSON.parse(e.nativeEvent.data); } catch { return; }
    if (m && m.haptic) vibrate(m.haptic);
    if (m && m.app) onAppInfo(m.app);
  }, []);

  // our own pages stay inside; phone numbers, Telegram, maps and other sites open in their own apps
  const onNavigate = useCallback((req) => {
    const u = req.url || '';
    if (u.startsWith(ORIGIN) || u.startsWith('about:') || u.startsWith('blob:') || u.startsWith('data:')) return true;
    if (req.isTopFrame === false) return true;
    Linking.openURL(u).catch(() => { });
    return false;
  }, []);

  if (failed) {
    return (
      <View style={[s.fill, s.center, { padding: 28 }]}>
        <StatusBar style="light" />
        <Image source={require('./assets/icon.png')} style={s.logo} />
        <Text style={s.title}>Нет подключения</Text>
        <Text style={s.hint}>Проверьте интернет и попробуйте ещё раз{'\n'}Internetni tekshiring va qayta urinib ko'ring</Text>
        <Pressable style={({ pressed }) => [s.btn, pressed && { opacity: 0.8 }]} onPress={() => { vibrate('light'); setFailed(false); setKey((k) => k + 1); }}>
          <Text style={s.btnText}>Повторить · Qayta urinish</Text>
        </Pressable>
      </View>
    );
  }

  if (!bundle) return <View style={s.fill} />;
  return (
    <View style={s.fill}>
      <StatusBar style="light" translucent />
      <WebView
        key={key}
        ref={web}
        source={{ html: bundle.html, baseUrl: URL + '/' }}
        style={s.fill}
        containerStyle={s.fill}
        originWhitelist={['*']}
        injectedJavaScriptBeforeContentLoaded={NATIVE_FEEL}
        onMessage={onMessage}
        onLoadEnd={() => { showApp(); loaded.current = true; if (pendingTap.current) { const n = pendingTap.current; pendingTap.current = null; setTimeout(() => openNotif(n), 1500); } }}
        onNavigationStateChange={(st) => { canGoBack.current = st.canGoBack; }}
        onShouldStartLoadWithRequest={onNavigate}
        onError={() => { showApp(); setFailed(true); }}
        onHttpError={(e) => { if (e.nativeEvent.statusCode >= 500) { showApp(); setFailed(true); } }}
        onContentProcessDidTerminate={() => web.current && web.current.reload()}
        // edge to edge: the page itself keeps clear of the notch and the home bar
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        // nothing that gives away a browser
        bounces={false}
        overScrollMode="never"
        allowsBackForwardNavigationGestures={false}
        allowsLinkPreview={false}
        pullToRefreshEnabled={false}
        hideKeyboardAccessoryView
        keyboardDisplayRequiresUserAction={false}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        setBuiltInZoomControls={false}
        textZoom={100}
        decelerationRate="normal"
        setSupportMultipleWindows={false}
        geolocationEnabled
        javaScriptEnabled
        domStorageEnabled
        cacheEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
      />
    </View>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1, backgroundColor: BG },
  center: { alignItems: 'center', justifyContent: 'center' },
  logo: { width: 96, height: 96, borderRadius: 22, marginBottom: 22 },
  title: { color: '#fff', fontSize: 26, fontWeight: '800', marginBottom: 8 },
  hint: { color: '#9a9aa0', fontSize: 15, lineHeight: 21, marginBottom: 26, textAlign: 'center' },
  btn: { alignSelf: 'stretch', backgroundColor: RED, borderRadius: 28, paddingVertical: 17, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
