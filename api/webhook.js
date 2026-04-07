import { createClient } from '@supabase/supabase-js';

// --- CONFIGURATION (Environment Variables) ---
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const VERIFY_TOKEN = "WandaVerify123";

export default async function handler(req, res) {
  // 1. META HANDSHAKE (The Webhook Verification)
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log("WEBHOOK_VERIFIED");
      return res.status(200).send(challenge);
    }
    return res.status(403).end();
  }

  // 2. INCOMING MESSAGE HANDLER (The "Ear")
  if (req.method === 'POST') {
    const body = req.body;
    const entry = body.entry?.[0]?.changes?.[0]?.value;
    const message = entry?.messages?.[0];

    if (!message) return res.status(200).send('OK');

    const customerNumber = message.from;
    const textContent = message.text?.body || "";

    // A. MOMO/ORANGE SMS PARSER (The "Brain")
    const momoRegex = /(?:Confirmed|Transfer of|You have received)\s?([\d,.]+)\s?FCFA/i;
    const match = textContent.match(momoRegex);

    if (match) {
      const amount = parseFloat(match[1].replace(/,/g, ''));
      const isIncome = textContent.toLowerCase().includes('received');
      
      const replyMsg = `🛡️ *WandaTax Shield*\n\nI detected a ${isIncome ? 'Income' : 'Expense'} of *${amount.toLocaleString()} CFA* from your SMS.\n\nI've added this to your audit-ready ledger. ✅`;
      
      await sendWhatsApp(customerNumber, replyMsg);
      // NOTE: Here is where we add the Supabase 'insert' logic next.
      return res.status(200).send('OK');
    }

    // B. MANUAL LOGGING (Fallback)
    if (!isNaN(parseFloat(textContent))) {
       const amount = parseFloat(textContent.replace(/[^0-9]/g, ''));
       await sendWhatsApp(customerNumber, `I see you logged *${amount.toLocaleString()} CFA*. What category is this? (Feature coming soon!)`);
       return res.status(200).send('OK');
    }

    // C. DEFAULT GREETING
    await sendWhatsApp(customerNumber, "Welcome to *WandaTax* 🇨🇲. Forward a MoMo/Orange SMS or type an amount to log it.");
    return res.status(200).send('OK');
  }
}

// --- HELPER FUNCTION: Send WhatsApp Message ---
async function sendWhatsApp(to, text) {
  const url = `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: to,
        type: "text",
        text: { body: text }
      })
    });
    const data = await response.json();
    console.log("WhatsApp API Response:", data);
  } catch (error) {
    console.error("Error sending WhatsApp:", error);
  }
}
