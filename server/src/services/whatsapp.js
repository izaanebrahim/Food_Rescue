// WhatsApp integration, two parts:
//
// 1. Click-to-chat links (always on, free, no setup)
//    https://wa.me/<number>?text=<message> opens WhatsApp with the chat
//    and a pre-written message. Used for the "Message on WhatsApp" buttons.
//
// 2. WhatsApp Business Cloud API (optional)
//    If WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID are set in .env, the
//    notification dispatcher also sends each notification as a WhatsApp
//    message. Without them, notifications stay in-app only.
//    See docs/WHATSAPP.md for setup.

const GRAPH_VERSION = process.env.WHATSAPP_API_VERSION || 'v21.0';

export function waLink(phone, text) {
  const digits = String(phone).replace(/\D/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

function fmtTime(d) {
  return new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

function mapsLink(lat, lng) {
  return `https://maps.google.com/?q=${lat},${lng}`;
}

/** Message the claimer sends to the donor. */
export function claimerToDonorText(c) {
  return [
    `Hi ${c.donor_name}, this is ${c.claimant_person}${c.claimant_name !== c.claimant_person ? ` from ${c.claimant_name}` : ''} (Food Rescue).`,
    `I've claimed "${c.title}" (${c.quantity_servings} servings).`,
    `Pickup code: ${c.pickup_code}`,
    `I'll collect before ${fmtTime(c.pickup_deadline)} from ${c.pickup_address}.`,
  ].join('\n');
}

/** Message the donor sends to the claimer. */
export function donorToClaimerText(c) {
  return [
    `Hi ${c.claimant_person}, this is ${c.donor_name} (Food Rescue).`,
    `"${c.title}" (${c.quantity_servings} servings) is ready for you.`,
    `Pickup address: ${c.pickup_address}`,
    `Map: ${mapsLink(c.lat, c.lng)}`,
    `Please collect before ${fmtTime(c.pickup_deadline)}.`,
  ].join('\n');
}

export function cloudApiEnabled() {
  return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

/**
 * Send one message through the Cloud API.
 * With WHATSAPP_TEMPLATE set, sends that approved template with the
 * message as its single body parameter ({{1}}). Business-initiated
 * messages must use a template; plain text only works inside a 24-hour
 * customer service window, which is enough for test numbers.
 */
export async function sendWhatsApp(phone, message) {
  const to = String(phone).replace(/\D/g, '');
  const template = process.env.WHATSAPP_TEMPLATE;
  const body = template
    ? {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: template,
          language: { code: process.env.WHATSAPP_TEMPLATE_LANG || 'en' },
          components: [{ type: 'body', parameters: [{ type: 'text', text: message }] }],
        },
      }
    : { messaging_product: 'whatsapp', to, type: 'text', text: { body: message } };

  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`WhatsApp API ${res.status}: ${detail.slice(0, 200)}`);
  }
  return res.json();
}
