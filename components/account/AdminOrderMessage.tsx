"use client";
import { useState } from 'react';
import type { Session } from '@supabase/supabase-js';
export function AdminOrderMessage({ orderId, session, initialMessage = '' }: { orderId: string; session: Session; initialMessage?: string }) {
 const [message,setMessage]=useState(initialMessage);
 const [saved,setSaved]=useState(initialMessage);
 const [busy,setBusy]=useState(false);
 const [result,setResult]=useState('');
 async function send(event: React.FormEvent) {
  event.preventDefault();setBusy(true);setResult('');
  try {
   const response=await fetch('/api/admin/orders',{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({orderId,customerMessage:message.trim()})});
   const payload=await response.json(); if(!response.ok) throw new Error(payload.error || 'No se pudo enviar el mensaje.');
   setSaved(message.trim());setMessage(message.trim());setResult('Mensaje guardado y aviso enviado al perfil del cliente.');
  } catch(e) {setResult(e instanceof Error ? e.message : 'No se pudo enviar.');} finally {setBusy(false);}
 }
 return <form onSubmit={event=>void send(event)} className="mt-3 space-y-2 border-t border-borde pt-3"><label htmlFor={`mensaje-${orderId}`} className="block text-xs font-bold">Mensaje al cliente</label><textarea id={`mensaje-${orderId}`} value={message} onChange={e=>setMessage(e.target.value)} maxLength={500} rows={2} placeholder="Ej.: Ya está listo, podés pasar a retirarlo." className="w-full rounded-lg border border-borde p-2 text-xs"/><button disabled={busy || !message.trim() || message.trim()===saved} className="rounded-lg border border-acero bg-acero-tenue px-3 py-2 text-xs font-bold disabled:opacity-50">{busy?'Enviando…':'Guardar y avisar al cliente'}</button>{result && <p role="status" className="text-xs">{result}</p>}</form>;
}
