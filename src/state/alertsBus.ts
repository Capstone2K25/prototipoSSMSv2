import { supabase } from '../supabaseClient';

export type AppAlertType = 'low-stock' | 'error' | 'sync' | 'info';
export type AppAlert = {
  id: string;
  type: AppAlertType;
  message: string;
  channel?: string;
  read: boolean;
};

export const emitAlert = async (payload: { type: AppAlertType; message: string; channel?: string }) => {
  const { data } = await supabase.from('alerts').insert({
    type: payload.type,
    message: payload.message,
    channel: payload.channel ?? 'general',
    read: false
  }).select('id').maybeSingle();

  // Notifica a la app (Alerts.tsx injecta optimista)
  window.dispatchEvent(
    new CustomEvent<AppAlert>('app:alert', {
      detail: {
        id: data?.id ?? crypto.randomUUID(),
        type: payload.type,
        message: payload.message,
        channel: payload.channel ?? 'general',
        read: false
      }
    })
  );
};

export const emitAlertsRefresh = () => {
  window.dispatchEvent(new CustomEvent('alerts:refresh'));
};
