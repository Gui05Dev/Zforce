// Contato da Z-Force: fonte única para qualquer link de WhatsApp gerado por código.
// (Os links que já existiam no index.html continuam escritos por extenso de propósito:
// assim funcionam mesmo sem JavaScript.)

export const WHATSAPP_NUMBER = '5545988037791';

/** Monta o link do WhatsApp com a mensagem já preenchida. */
export function whatsappUrl(message) {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}
