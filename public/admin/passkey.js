/* Sign-in by face (Face ID / fingerprint) through passkeys. Shared by the admin, manager and courier pages
   and by the phone page that approves a computer's QR code. `api(path, method, body)` is the page's own API helper. */
const Passkey = (() => {
  const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));

  const supported = () => !!(window.PublicKeyCredential && navigator.credentials);
  // does this device have its own Face ID / Touch ID / fingerprint?
  const hasFace = async () => { try { return supported() && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); } catch { return false; } };
  const isPhone = () => /iPhone|iPad|Android/i.test(navigator.userAgent);
  const deviceName = () => {
    const u = navigator.userAgent;
    return /iPhone/.test(u) ? 'iPhone' : /iPad/.test(u) ? 'iPad' : /Android/.test(u) ? 'Android' : /Mac/.test(u) ? 'Mac' : /Windows/.test(u) ? 'Windows' : 'Устройство';
  };
  const cancelled = e => e && (e.name === 'NotAllowedError' || e.name === 'AbortError');

  async function signIn(api, { app, qr } = {}) {
    const { id, options: o } = await api('auth/passkey/options', 'POST', {});
    const cred = await navigator.credentials.get({ publicKey: {
      challenge: unb64u(o.challenge), rpId: o.rpId, timeout: o.timeout, userVerification: o.userVerification,
      allowCredentials: (o.allowCredentials || []).map(c => ({ ...c, id: unb64u(c.id) })),
    } });
    const r = cred.response;
    return api('auth/passkey/verify', 'POST', { id, app, qr, response: {
      id: cred.id, rawId: b64u(cred.rawId), type: cred.type, clientExtensionResults: cred.getClientExtensionResults(),
      authenticatorAttachment: cred.authenticatorAttachment || undefined,
      response: { clientDataJSON: b64u(r.clientDataJSON), authenticatorData: b64u(r.authenticatorData), signature: b64u(r.signature), userHandle: r.userHandle ? b64u(r.userHandle) : undefined },
    } });
  }

  // paths: the signed-in person's own face by default; the employee page passes the invite paths + token
  async function enroll(api, { optionsPath = 'auth/passkey/register-options', finishPath = 'auth/passkey/register', extra = {} } = {}) {
    const { options: o } = await api(optionsPath, 'POST', extra);
    const cred = await navigator.credentials.create({ publicKey: {
      ...o, challenge: unb64u(o.challenge), user: { ...o.user, id: unb64u(o.user.id) },
      excludeCredentials: (o.excludeCredentials || []).map(c => ({ ...c, id: unb64u(c.id) })),
    } });
    const r = cred.response;
    return api(finishPath, 'POST', { ...extra, device: deviceName(), response: {
      id: cred.id, rawId: b64u(cred.rawId), type: cred.type, clientExtensionResults: cred.getClientExtensionResults(),
      authenticatorAttachment: cred.authenticatorAttachment || undefined,
      response: { clientDataJSON: b64u(r.clientDataJSON), attestationObject: b64u(r.attestationObject), transports: r.getTransports ? r.getTransports() : [] },
    } });
  }

  return { supported, hasFace, isPhone, deviceName, cancelled, signIn, enroll };
})();
