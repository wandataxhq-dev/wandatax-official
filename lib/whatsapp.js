export async function sendWhatsApp(to, text) {
  const cleanTo = String(to || '').replace(/\D/g, '');
  const url = `https://graph.facebook.com/v22.0/${process.env.PHONE_NUMBER_ID}/messages`;

  if (!cleanTo) {
    throw new Error('Cannot send WhatsApp message without a recipient phone number.');
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: cleanTo,
      type: 'text',
      text: { body: text }
    })
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(`WhatsApp API error (${response.status}): ${JSON.stringify(result)}`);
  }

  return result;
}