import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, BackHandler, Platform, Pressable, SafeAreaView,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WebView } from 'react-native-webview';
import * as Haptics from 'expo-haptics';

// the web app asks for vibration with postMessage({ haptic: 'select' | 'light' | 'medium' | 'success' | 'warning' })
function onWebMessage(e) {
  let m; try { m = JSON.parse(e.nativeEvent.data); } catch { return; }
  const k = m && m.haptic;
  if (k === 'select') Haptics.selectionAsync();
  else if (k === 'light') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  else if (k === 'medium') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  else if (k === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  else if (k === 'warning') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
}

const KEY = 'wendys_server_url';
// the live site; the app opens it straight away (long-press the gear in the corner to use another server)
const DEFAULT_URL = 'https://wendy-s-r2cm.onrender.com';
const RED = '#e21d3c';
const BG = '#0c0c0e';

function normalize(raw) {
  let u = raw.trim();
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = 'http://' + u;
  return u.replace(/\/+$/, '');
}

export default function App() {
  const [url, setUrl] = useState(null);      // saved server URL
  const [draft, setDraft] = useState('');
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const web = useRef(null);
  const canGoBack = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((v) => {
      setUrl(v || DEFAULT_URL); setDraft(v || DEFAULT_URL);
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack.current && web.current) { web.current.goBack(); return true; }
      return false;
    });
    return () => sub.remove();
  }, []);

  async function save() {
    const u = normalize(draft);
    if (!u) return;
    await AsyncStorage.setItem(KEY, u);
    setFailed(false);
    setUrl(u);
  }

  async function change() {
    await AsyncStorage.removeItem(KEY);
    setUrl(null);
    setFailed(false);
  }

  if (!ready) {
    return <View style={[s.fill, s.center]}><ActivityIndicator color={RED} /></View>;
  }

  if (!url || failed) {
    return (
      <SafeAreaView style={[s.fill, s.center, { padding: 24 }]}>
        <StatusBar style="light" />
        <Text style={s.title}>Wendy's</Text>
        <Text style={s.hint}>
          {failed
            ? 'Не удалось открыть Wendy\'s. Проверьте интернет и нажмите «Открыть».'
            : 'Адрес сервера'}
        </Text>
        <TextInput
          style={s.input}
          value={draft}
          onChangeText={setDraft}
          placeholder={DEFAULT_URL}
          placeholderTextColor="#666"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        <Pressable style={s.btn} onPress={save}>
          <Text style={s.btnText}>Открыть</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[s.fill, { backgroundColor: BG }]}>
      <StatusBar style="light" />
      <WebView
        ref={web}
        source={{ uri: url }}
        style={{ backgroundColor: BG }}
        startInLoadingState
        renderLoading={() => <View style={[s.fill, s.center]}><ActivityIndicator color={RED} /></View>}
        onNavigationStateChange={(st) => { canGoBack.current = st.canGoBack; }}
        onMessage={onWebMessage}
        onError={() => setFailed(true)}
        onHttpError={(e) => { if (e.nativeEvent.statusCode >= 500) setFailed(true); }}
        geolocationEnabled
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        allowsBackForwardNavigationGestures
        setSupportMultipleWindows={false}
        pullToRefreshEnabled
      />
      <Pressable style={s.gear} onLongPress={change}>
        <Text style={{ color: '#888', fontSize: 11 }}>⚙</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1, backgroundColor: BG },
  center: { alignItems: 'center', justifyContent: 'center' },
  title: { color: '#fff', fontSize: 34, fontWeight: '800', marginBottom: 8 },
  hint: { color: '#aaa', fontSize: 16, marginBottom: 16, textAlign: 'center' },
  input: {
    width: '100%', backgroundColor: '#1c1c20', color: '#fff', borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, marginBottom: 14,
  },
  btn: { width: '100%', backgroundColor: RED, borderRadius: 28, paddingVertical: 16, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  small: { color: '#777', fontSize: 12, marginTop: 18, textAlign: 'center' },
  gear: { position: 'absolute', right: 6, bottom: 6, opacity: 0.4, padding: 6 },
});
