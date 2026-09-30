import type { WhatsAppOrderItem } from '@/types/database';
export interface OrderNotification {
  id: string; order_id: string; title: string; message: string; created_at: string; read_at: string | null;
  changes: {
    estado?: { antes: string; ahora: string };
    items?: { antes: WhatsAppOrderItem[]; ahora: WhatsAppOrderItem[] };
    total?: { antes: number; ahora: number };
    entrega?: { antes: string; ahora: string };
    pago?: { antes: string | null; ahora: string | null };
  };
}
