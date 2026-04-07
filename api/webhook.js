// api/webhook.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  // 1. META VERIFICATION (The Handshake)
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === "WandaVerify123") {
      return res.status(200).send(challenge);
    }
    return res.status(403).end();
  }

  // 2. THE MESSAGE HANDLER
  if (req.method === 'POST') {
    const body = req.body;
    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (!message) return res.status(200).send('OK');

    const from = message.from; // Customer Number
    const text = message.text?.body || "";

    // MOMO/ORANGE SMS PARSER (The Shadow Accountant)
    const momoRegex = /(?:Confirmed|Transfer of|You have received)\s?([\d,.]+)\s?FCFA/i;
    const isMomo = text.match(momoRegex);

    if (isMomo) {
      const amount = parseFloat(isMomo[1].replace(/,/g, ''));
      const type = text.toLowerCase().includes('received') ? 'Income' : 'Expense';
      
      await reply(from, `🛡️ *WandaTax Shield*\n\nI detected a ${type} of *${amount.toLocaleString()} CFA*.\n\nI've added this to your tax-compliance ledger. You're staying audit-ready! ✅`);
      // Add Supabase logic here next
      return res.status(200).send('OK');
    }

    // DEFAULT RESPONSE
    await reply(from, "Welcome to WandaTax 🇨🇲. Forward a MoMo/Orange SMS to log it, or type an amount to start.");
    return res.status(200).send('OK');
  }
}

async function reply(to, text) {
  await fetch(`https://graph.facebook.com/v22.0/${process.env.PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: "whatsapp", to, text: { body: text } })
  });
}
