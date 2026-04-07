import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).send(req.query['hub.challenge']);
  }

  if (req.method === 'POST') {
    const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg) return res.status(200).send('No message');

    const text = msg.text?.body || "";
    const from = msg.from;

    // 1. Extract Amount (CFA)
    const amount = parseFloat(text.replace(/[^0-9]/g, '')) || 0;

    try {
      // 2. Sync to Supabase
      const { error } = await supabase.from('transactions').insert([
        { 
          phone_number: from, 
          amount: amount, 
          raw_text: text,
          category: text.toLowerCase().includes('momo') ? 'MTN' : 'General'
        }
      ]);

      if (error) throw error;

      // 3. Send WhatsApp Confirmation
      await fetch(`https://graph.facebook.com/v22.0/${process.env.PHONE_NUMBER_ID}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: from,
          text: { body: `✅ WandaTax: Logged ${amount} CFA. Table Synced.` },
        }),
      });

    } catch (err) {
      console.error("Sync Error:", err.message);
    }

    return res.status(200).send('OK');
  }
}
