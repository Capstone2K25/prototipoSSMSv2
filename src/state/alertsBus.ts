// src/state/alertsBus.ts
import { supabase } from '../supabaseClient';

export type AppAlertType = 'low-stock' | 'error' | 'sync' | 'info';

export type AppAlert = {
  id: string;
  type: AppAlertType;
  message: string;
  date: string;     // para UI
  read: boolean;
  channel?: string;
};

export async function emitAlert(
  payload: { type: AppAlertType; message: string; channel?: string; read?: boolean }
) {
  const uiAlert: AppAlert = {
    id: crypto.randomUUID(),
    date: new Date().toLocaleString(),
    read: payload.read ?? false,
    type: payload.type,
    message: payload.message,
    channel: payload.channel,
  };

  // 1) disparo UI inmediato
  window.dispatchEvent(new CustomEvent<AppAlert>('app:alert', { detail: uiAlert }));

  // 2) persistencia en Supabase
  await supabase.from('alerts').insert({
    type: payload.type,
    message: payload.message,
    channel: payload.channel ?? null,
    read: payload.read ?? false
  });

  return uiAlert;
}
