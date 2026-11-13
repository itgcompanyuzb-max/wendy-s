// The phone's own notifications (lock screen, banner from the top) — local ones, no push server needed:
// - news from the server (sales from the admin, order status, coins, birthday) are checked while the app is open,
//   when it comes back, and in the background when iOS lets the app run (about every 15+ minutes)
// - "we are still waiting for you in the cart" is scheduled on the phone itself when the app is closed with items in the cart
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE = 'https://wendy-s-r2cm.onrender.com';
const TASK = 'wendys-news';
const CART_ID = 'cart-reminder';

// shown as a banner even while the app is open
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

export async function askPermission() {
  try {
    const s = await Notifications.getPermissionsAsync();
    if (s.granted) return true;
    if (s.canAskAgain === false) return false;
    return (await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } })).granted;
  } catch { return false; }
}

let checking = false;
export async function checkNews() {
  if (checking) return; checking = true;
  try {
    const [[, token], [, last], [, lang]] = await AsyncStorage.multiGet(['nf_token', 'nf_last', 'nf_lang']);
    if (!token) return;
    const r = await fetch(`${BASE}/api/notifications?after=${Number(last) || 0}&lang=${lang === 'uz' ? 'uz' : 'ru'}`, { headers: { Authorization: 'Bearer ' + token } });
    if (!r.ok) return;
    const { items } = await r.json();
    if (!items || !items.length) { if (!last) await AsyncStorage.setItem('nf_last', '0'); return; }
    await AsyncStorage.setItem('nf_last', String(items[items.length - 1].id));
    if (last === null) return; // first check after sign-in: old news are not repeated
    for (const n of items.slice(-3)) {
      if (n.kind === 'cart') continue; // the phone schedules its own cart reminder
      await Notifications.scheduleNotificationAsync({ content: { title: n.title, body: n.body || '', sound: 'default', data: { n } }, trigger: null });
    }
  } catch { /* offline: next time */ } finally { checking = false; }
}

TaskManager.defineTask(TASK, async () => {
  try { await checkNews(); return BackgroundTask.BackgroundTaskResult.Success; } catch { return BackgroundTask.BackgroundTaskResult.Failed; }
});
export async function startBackground() {
  try {
    if ((await BackgroundTask.getStatusAsync()) !== BackgroundTask.BackgroundTaskStatus.Available) return;
    if (!(await TaskManager.isTaskRegisteredAsync(TASK))) await BackgroundTask.registerTaskAsync(TASK, { minimumInterval: 15 });
  } catch { /* not allowed on this phone */ }
}

// the app went to the background with items in the cart: remind later, unless the customer comes back first
export async function scheduleCart(info) {
  try {
    await Notifications.cancelScheduledNotificationAsync(CART_ID);
    if (!info || !info.token || !info.cart || !info.remindOn) return;
    const n = info.cart, uz = info.lang === 'uz';
    const m = n % 10, h = n % 100;
    const ru = m === 1 && h !== 11 ? 'товар ждёт' : m >= 2 && m <= 4 && (h < 12 || h > 14) ? 'товара ждут' : 'товаров ждут';
    await Notifications.scheduleNotificationAsync({
      identifier: CART_ID,
      content: {
        title: uz ? '🛒 Savatda sizni hali ham kutyapmiz' : '🛒 Мы всё ещё ждём вас в корзине',
        body: uz ? `${n} ta mahsulot sizni kutyapti — hammasi issiqligida buyurtma bering 🍔` : `${n} ${ru} вас — оформите заказ, пока всё горячее 🍔`,
        sound: 'default', data: { n: { kind: 'cart' } },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: Math.max(15, info.remindMin || 60) * 60, repeats: false },
    });
  } catch { /* no permission */ }
}
export const cancelCart = () => Notifications.cancelScheduledNotificationAsync(CART_ID).catch(() => { });

// a tap on a notification: what the app should open
export function onTap(cb) {
  const sub = Notifications.addNotificationResponseReceivedListener((r) => cb(r.notification.request.content.data?.n));
  Notifications.getLastNotificationResponseAsync().then((r) => { if (r) cb(r.notification.request.content.data?.n); }).catch(() => { });
  return () => sub.remove();
}
