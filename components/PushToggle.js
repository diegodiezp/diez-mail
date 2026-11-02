'use client';
// "Enable alerts" for this device. On iPhone this only works from the app
// installed on the home screen (iOS 16.4+), which is how Diez Mail is used
// at fairs anyway; in a plain Safari tab we say so instead of failing.

import { useEffect, useState } from 'react';
import { Icon } from './ui';

function urlB64ToUint8Array(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export default function PushToggle({ compact = false }) {
  const [state, setState] = useState('checking'); // checking | unsupported | ios-browser | off | on | denied | busy
  const [msg, setMsg] = useState('');

  useEffect(() => {
    (async () => {
      const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
      const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
      if (!supported) { setState(isIOS && !standalone ? 'ios-browser' : 'unsupported'); return; }
      if (Notification.permission === 'denied') { setState('denied'); return; }
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        setState(sub ? 'on' : 'off');
      } catch {
        setState('off');
      }
    })();
  }, []);

  const enable = async () => {
    setState('busy');
    setMsg('');
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { setState(perm === 'denied' ? 'denied' : 'off'); return; }
      const { publicKey } = await fetch('/api/push/subscribe').then((r) => r.json());
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(publicKey) });
      }
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON(), device: navigator.userAgent }),
      });
      if (!res.ok) throw new Error('Could not save this device');
      await fetch('/api/push/test', { method: 'POST' });
      setState('on');
      setMsg('Test notification sent.');
    } catch (err) {
      setState('off');
      setMsg(err.message || 'Could not enable alerts');
    }
  };

  const disable = async () => {
    setState('busy');
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState('off');
      setMsg('');
    } catch {
      setState('on');
    }
  };

  if (state === 'checking' || state === 'unsupported') return null;

  if (state === 'ios-browser') {
    return compact ? null : (
      <span className="text-2xs text-gallery-light">Add to Home Screen to get alerts</span>
    );
  }

  if (state === 'denied') {
    return <span className="text-2xs text-gallery-light">Alerts blocked in browser settings</span>;
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={state === 'on' ? disable : enable}
        disabled={state === 'busy'}
        className={state === 'on' ? 'btn-ghost' : 'btn-secondary btn-sm'}
        title={state === 'on' ? 'Turn off alerts on this device' : 'Get a notification when someone inquires'}
      >
        <Icon name="bell" size={14} />
        {state === 'on' ? 'Alerts on' : state === 'busy' ? 'Working…' : 'Enable alerts'}
      </button>
      {msg && !compact && <span className="text-2xs text-gallery-mid">{msg}</span>}
    </div>
  );
}
