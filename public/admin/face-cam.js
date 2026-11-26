/* Camera face sign-in (face-api.js, runs in the browser). Shared by the admin, manager and courier pages.
   The browser turns the face into 128 numbers; only those numbers go to the server, never a photo.
   Liveness: the face sits in a round frame with a ring of ticks around it; moving the head in a circle lights the ticks
   on that side, and the ring has to be closed. A printed photo held up to the camera cannot do that. */
const FaceCam = (() => {
  const LIB = '/vendor/face-api/face-api.js', MODELS = '/vendor/face-api/models';
  let ready = null;
  const supported = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && window.isSecureContext;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const dist = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; } return Math.sqrt(s); };

  function load() {
    if (ready) return ready;
    ready = new Promise((res, rej) => {
      const go = async () => {
        try {
          await Promise.all([faceapi.nets.tinyFaceDetector.loadFromUri(MODELS), faceapi.nets.faceLandmark68Net.loadFromUri(MODELS), faceapi.nets.faceRecognitionNet.loadFromUri(MODELS)]);
          res();
        } catch (e) { ready = null; rej(e); }
      };
      if (window.faceapi) return go();
      const s = document.createElement('script'); s.src = LIB; s.onload = go; s.onerror = () => { ready = null; rej(new Error('Не удалось загрузить распознавание лица')); };
      document.head.appendChild(s);
    });
    return ready;
  }

  // one look at the camera: the face (if one, big enough), its turn left/right as seen on the mirrored screen, its print
  async function look(video) {
    const r = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 })).withFaceLandmarks().withFaceDescriptor();
    if (!r) return null;
    const p = r.landmarks.positions, l = p[36], rr = p[45], nose = p[30];
    const eyes = Math.hypot(rr.x - l.x, rr.y - l.y) || 1;
    const yaw = -(nose.x - (l.x + rr.x) / 2) / eyes; // > 0: nose moved to the right of the (mirrored) screen
    const pitch = (nose.y - (l.y + rr.y) / 2) / eyes; // grows when the head tilts down
    return { yaw, pitch, size: r.detection.box.width / video.videoWidth, vec: Array.from(r.descriptor) };
  }

  /* the window: video in a round frame, a ring of ticks around it, a hint line */
  const TICKS = 60;
  const ringSvg = () => {
    let l = '';
    for (let i = 0; i < TICKS; i++) {
      const a = (i / TICKS) * 2 * Math.PI, sx = Math.sin(a), cy = -Math.cos(a);
      l += `<line x1="${(150 + 132 * sx).toFixed(1)}" y1="${(150 + 132 * cy).toFixed(1)}" x2="${(150 + 146 * sx).toFixed(1)}" y2="${(150 + 146 * cy).toFixed(1)}"/>`;
    }
    return `<svg class="cam-ticks" viewBox="0 0 300 300" aria-hidden="true">${l}</svg>`;
  };
  function ui(title, extraHtml = '') {
    const o = document.createElement('div');
    o.className = 'overlay';
    o.innerHTML = `<div class="glass modal cam-modal"><h2>${esc(title)}</h2>${extraHtml}
      <div class="cam-stage">${ringSvg()}<div class="cam-wrap"><video playsinline muted autoplay></video><div class="cam-ring"></div></div></div>
      <p class="cam-hint">Загрузка…</p><div class="err cam-err"></div>
      <div class="foot"><button class="btn" data-cam="cancel">Отмена</button><button class="btn primary" data-cam="go" hidden></button></div></div>`;
    document.body.appendChild(o);
    const $ = s => o.querySelector(s);
    return { o, video: $('video'), ring: $('.cam-ring'), ticks: [...o.querySelectorAll('.cam-ticks line')], hint: t => { $('.cam-hint').textContent = t; }, err: t => { $('.cam-err').textContent = t || ''; }, go: $('[data-cam=go]'), cancel: $('[data-cam=cancel]'), q: $ };
  }

  async function startCamera(video) {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
    video.srcObject = stream;
    await new Promise(r => { if (video.readyState >= 2) r(); else video.onloadeddata = r; });
    return () => stream.getTracks().forEach(t => t.stop());
  }

  // waits for one straight, close-enough face and returns its print
  async function straight(v, w, alive) {
    for (;;) {
      if (!alive()) throw new Error('cancelled');
      const f = await look(v);
      if (!f) { w.hint('Посмотрите в камеру'); w.ring.className = 'cam-ring'; }
      else if (f.size < 0.22) { w.hint('Подойдите ближе'); w.ring.className = 'cam-ring'; }
      else if (Math.abs(f.yaw) > 0.15) { w.hint('Смотрите прямо в камеру'); w.ring.className = 'cam-ring warn'; }
      else { w.ring.className = 'cam-ring ok'; return f; }
      await wait(120);
    }
  }
  // liveness: move the head in a circle; each direction lights the ticks on that side of the ring.
  // `need` = the share of the ring to close (sign-up asks for almost all of it, sign-in for a part)
  async function circle(v, w, alive, base, need) {
    const lit = new Set(), until = Date.now() + 30000;
    w.ticks.forEach(t => t.classList.remove('on'));
    w.hint(need > 0.5 ? 'Медленно поводите головой по кругу, пока кольцо не станет зелёным' : 'Слегка поводите головой по кругу');
    for (;;) {
      if (!alive()) throw new Error('cancelled');
      if (Date.now() > until) throw Object.assign(new Error('Кольцо не замкнулось. Попробуйте ещё раз, двигайте головой медленнее'), { retry: true });
      const f = await look(v);
      if (f) {
        const dx = f.yaw - base.yaw, dy = -(f.pitch - base.pitch) * 1.6; // right / up on the screen
        if (Math.hypot(dx, dy) > 0.09) {
          const i = Math.round((((Math.atan2(dx, dy) / (2 * Math.PI)) * TICKS) + TICKS) % TICKS);
          for (let k = -3; k <= 3; k++) { const n = (i + k + TICKS) % TICKS; if (!lit.has(n)) { lit.add(n); w.ticks[n].classList.add('on'); } }
          if (lit.size >= need * TICKS) { if (navigator.vibrate) navigator.vibrate(15); return; }
        }
      }
      await wait(60);
    }
  }

  // run a step-by-step camera task inside the window; resolves with its result or null if the person closed the window
  function run(w, task) {
    return new Promise(resolve => {
      let alive = true, stop = () => { };
      const close = val => { alive = false; stop(); w.o.remove(); resolve(val); };
      w.cancel.onclick = () => close(null);
      w.o.addEventListener('click', e => { if (e.target === w.o) close(null); });
      (async () => {
        try {
          await load();
          stop = await startCamera(w.video);
          for (;;) {
            // done: the window stays open (camera still on) until finish() shows the server's answer
            try { const val = await task(w, () => alive); if (val !== undefined) { alive = false; w.cancel.onclick = () => { stop(); w.o.remove(); }; return resolve(val); } }
            catch (e) {
              if (!alive || e.message === 'cancelled') return;
              if (!e.retry) throw e;
              w.err(e.message); w.ring.className = 'cam-ring'; await wait(1500); w.err('');
            }
          }
        } catch (e) {
          if (!alive) return;
          w.hint(''); w.err(e && e.name === 'NotAllowedError' ? 'Нет доступа к камере. Разрешите камеру для этого сайта в настройках браузера.' : (e.message || 'Ошибка камеры'));
        }
      })();
    });
  }

  /* sign in: straight look, part of the circle, straight look again (the same person) -> the face print to send */
  function signIn(title = 'Вход по Face ID') {
    const w = ui(title);
    return run(w, async (w, alive) => {
      const a = await straight(w.video, w, alive);
      await circle(w.video, w, alive, a, 0.35);
      w.hint('Теперь снова смотрите прямо');
      const b = await straight(w.video, w, alive);
      if (dist(a.vec, b.vec) > 0.45) throw Object.assign(new Error('Лицо сменилось во время проверки. Попробуйте ещё раз'), { retry: true });
      w.hint('Проверяем…');
      return { descriptor: a.vec.map((x, i) => (x + b.vec[i]) / 2), window: w };
    });
  }

  /* add a face: written consent, a full circle of the head (closes the ring), then 4 straight shots of the same person */
  // self = the person adds their own face (they agree themselves); otherwise an admin adds an employee's face
  function enroll(name, self = false) {
    const consent = self ? 'Я согласен(на) на обработку моих биометрических данных (лицо) для входа в систему. Хранится только зашифрованный цифровой отпечаток лица, без фото.'
      : 'Сотрудник дал письменное согласие на обработку биометрических данных (лицо). Хранится только зашифрованный цифровой отпечаток лица, без фото.';
    const w = ui(self ? 'Мой Face ID' : `Face ID: ${name}`, `<label class="cam-consent"><input type="checkbox" id="camok"> ${consent}</label>`);
    w.go.hidden = false; w.go.textContent = 'Начать';
    w.hint(self ? 'Отметьте согласие и нажмите «Начать». Смотрите в камеру.' : 'Отметьте согласие и нажмите «Начать». Сотрудник смотрит в камеру.');
    let started = null;
    const begin = new Promise(r => { started = r; });
    w.go.onclick = () => { if (!w.q('#camok').checked) return w.err(self ? 'Отметьте согласие' : 'Без письменного согласия сотрудника лицо добавлять нельзя'); w.err(''); w.go.hidden = true; started(); };
    return run(w, async (w, alive) => {
      await begin;
      const first = await straight(w.video, w, alive);
      await circle(w.video, w, alive, first, 0.9);
      const shots = [first.vec];
      while (shots.length < 4) {
        w.hint(`Смотрите прямо… ${shots.length}/4`);
        await wait(250);
        const f = await straight(w.video, w, alive);
        if (dist(f.vec, shots[0]) > 0.45) throw Object.assign(new Error('В кадре другой человек. Начните заново'), { retry: true });
        shots.push(f.vec);
      }
      w.hint('Сохраняем…');
      return { samples: shots, window: w };
    });
  }

  /* a face print from an uploaded photo (taken when the employee is added). The photo never leaves the browser.
     Exactly one face must be on it. Three prints: the photo as is and slightly darker / lighter. */
  async function fromPhoto(file) {
    if (!file || !/^image\//.test(file.type)) throw new Error('Выберите фото (JPG или PNG)');
    await load();
    const url = URL.createObjectURL(file);
    try {
      const img = new Image(); img.src = url; await img.decode();
      const max = 1024, k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const W = Math.round(img.naturalWidth * k), H = Math.round(img.naturalHeight * k);
      const shot = async filter => {
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const g = c.getContext('2d'); g.filter = filter; g.drawImage(img, 0, 0, W, H);
        return faceapi.detectAllFaces(c, new faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.5 })).withFaceLandmarks().withFaceDescriptors();
      };
      const first = await shot('none');
      if (!first.length) throw new Error('На фото не найдено лицо. Нужно чёткое фото лица анфас, без очков и маски');
      if (first.length > 1) throw new Error('На фото несколько лиц. Нужно фото только этого сотрудника');
      if (first[0].detection.box.width < 80) throw new Error('Лицо на фото слишком маленькое. Нужно фото крупнее');
      const out = [Array.from(first[0].descriptor)];
      for (const f of ['brightness(0.85)', 'brightness(1.15)']) { const r = await shot(f); if (r.length === 1) out.push(Array.from(r[0].descriptor)); }
      return out;
    } finally { URL.revokeObjectURL(url); }
  }

  // after the server answered: a tick or an error in the same window
  function finish(w, ok, text) {
    if (!w || !w.o.isConnected) return;
    w.video.srcObject?.getTracks?.().forEach(t => t.stop());
    if (ok) {
      w.q('.cam-stage').outerHTML = '<svg class="qr-tick" viewBox="0 0 96 96" aria-hidden="true"><circle cx="48" cy="48" r="44"/><path d="M28 50l14 14 27-30"/></svg>';
      w.hint(text || 'Готово'); w.err('');
      setTimeout(() => w.o.remove(), 1200);
    } else { w.hint(''); w.err(text || 'Ошибка'); w.cancel.textContent = 'Закрыть'; w.cancel.onclick = () => w.o.remove(); }
  }

  return { supported, load, signIn, enroll, finish, fromPhoto };
})();
