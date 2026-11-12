// The website screens the native app does not draw yet (login, checkout, address/map, profile, banners, coin shop).
// The page stays loaded off screen and slides in when needed, so they open instantly.
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { Animated, Easing, Linking, StyleSheet, useWindowDimensions } from 'react-native';
import { WebView } from 'react-native-webview';
import { BASE, haptic } from './lib';

const NATIVE_FEEL = `
  window.__WENDYS_APP__ = true; window.__WENDYS_NATIVE__ = true;
  document.documentElement.classList.add('native-app');
  var st = document.createElement('style');
  st.textContent = '*{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}'
    + 'input,textarea,[contenteditable]{-webkit-user-select:text;user-select:text}html,body{overscroll-behavior:none}';
  (document.head || document.documentElement).appendChild(st);
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); }, { passive: false });
  true;
`;

const WebShell = forwardRef(function WebShell({ visible, onState, onFail }, ref) {
  const web = useRef(null);
  const { width } = useWindowDimensions();
  const x = useRef(new Animated.Value(width)).current;

  useEffect(() => {
    Animated.timing(x, { toValue: visible ? 0 : width, duration: visible ? 320 : 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [visible, width]);

  useImperativeHandle(ref, () => ({
    run(cmd, cart, arg) { web.current?.injectJavaScript(`window.WN && WN.run(${JSON.stringify(cmd)}, ${JSON.stringify(cart || null)}, ${JSON.stringify(arg ?? null)}); true;`); },
    setCart(cart) { web.current?.injectJavaScript(`window.WN && WN.setCart(${JSON.stringify(cart)}); true;`); },
    closeTop() { web.current?.injectJavaScript(`(function(){var k=Object.keys(Sh.stack);if(k.length)Sh.close(k[k.length-1]);else if(St.token)go('home');})(); true;`); },
    reload() { web.current?.reload(); },
  }));

  const onMessage = useCallback((e) => {
    let m; try { m = JSON.parse(e.nativeEvent.data); } catch { return; }
    if (m.haptic) haptic(m.haptic);
    if (m.state) onState(m.state);
  }, [onState]);

  const onNavigate = useCallback((req) => {
    const u = req.url || '';
    if (u.startsWith(BASE) || /^(about|blob|data):/.test(u) || req.isTopFrame === false) return true;
    Linking.openURL(u).catch(() => { });
    return false;
  }, []);

  return (
    <Animated.View pointerEvents={visible ? 'auto' : 'none'} style={[StyleSheet.absoluteFill, { transform: [{ translateX: x }], backgroundColor: '#000' }]}>
      <WebView
        ref={web}
        source={{ uri: BASE + '/?m=1' }}
        style={{ flex: 1, backgroundColor: '#000' }}
        originWhitelist={['*']}
        injectedJavaScriptBeforeContentLoaded={NATIVE_FEEL}
        onMessage={onMessage}
        onShouldStartLoadWithRequest={onNavigate}
        onError={onFail}
        onHttpError={(e) => { if (e.nativeEvent.statusCode >= 500) onFail(); }}
        onContentProcessDidTerminate={() => web.current?.reload()}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
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
        setSupportMultipleWindows={false}
        geolocationEnabled
        javaScriptEnabled
        domStorageEnabled
        cacheEnabled
        allowsInlineMediaPlayback
      />
    </Animated.View>
  );
});
export default WebShell;
