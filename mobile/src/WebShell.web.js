// Browser preview of the native app (expo web, used only for testing the native screens):
// there is no WebView here, so the hidden website part is replaced by a stub that records what it was asked to open.
import React, { forwardRef, useEffect, useImperativeHandle } from 'react';
import { Text, View } from 'react-native';

const WebShell = forwardRef(function WebShell({ visible, onState }, ref) {
  useEffect(() => { window.__pushState = onState; const s = window.__TEST_STATE__; if (s) setTimeout(() => onState(s), 50); }, []);
  useImperativeHandle(ref, () => ({
    run(cmd, cart, arg) { (window.__WEB_CALLS__ = window.__WEB_CALLS__ || []).push({ cmd, cart, arg }); },
    setCart(cart) { window.__WEB_CART__ = cart; },
    closeTop() { }, reload() { },
  }));
  if (!visible) return null;
  return <View style={{ position: 'absolute', inset: 0, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff' }}>[web screen]</Text></View>;
});
export default WebShell;
