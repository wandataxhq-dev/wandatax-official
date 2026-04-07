import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === 'WandaVerify123') {
      return res.status(200).send(challenge);
    }
    return res.status(403).end();
  }

  if (req.method === 'POST') {
    const body = req.body;

    if (body.object === 'whatsapp' && body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
      const msg = body.entry[0].changes[0].value.messages[0];
      const from = msg.from; // User's phone number
      const text = msg.text?.body || "";

      // 1. Simple Regex to find numbers (CFA Amounts) in the message
      const amountMatch = text.match(/\d+(?:\.\d+)?/); 
      const detectedAmount = amountMatch ? parseFloat(amountMatch[0]) : 0;

      try {
        // 2. SAVE TO SUPABASE
        await supabase.from('transactions').insert([
          { 
            phone_number: from, 
            amount: detectedAmount, 
            raw_text: text,
            category: detectedAmount > 0 ? 'income' : 'query'
          }
        ]);

        // 3. REPLY VIA WHATSAPP
        const replyText = detectedAmount > 0 
          ? `🛡️ WandaTax Shield: Logged ${detectedAmount} XAF to your ledger. ✅`
          : `Welcome to WandaTax 🇨🇲. Forward a MoMo SMS or type an amount to log it.`;

        await fetch(`https://graph.facebook.com/v22.0/${process.env.PHONE_NUMBER_ID}/messages`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: from,
            type: "text",
            text: { body: replyText },
          }),
        });

      } catch (error) {
        console.error("Supabase/WhatsApp Error:", error);
      }
    }
    return res.status(200).send('EVENT_RECEIVED');
  }

  res.status(405).end();
}
