import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  // 1. GET: Meta Webhook Verification
  if (req.method === 'GET') {
    return res.status(200).send(req.query['hub.challenge']);
  }

  // 2. POST: Receiving WhatsApp Data
  if (req.method === 'POST') {
    try {
      // Navigate the Meta JSON tree carefully
      const value = req.body?.entry?.[0]?.changes?.[0]?.value;
      const message = value?.messages?.[0];

      if (!message) {
        console.log("No message found in payload");
        return res.status(200).send('No Message');
      }

      const from = message.from;
      const text = message.text?.body || "";
      
      // Clean amount extraction: "Total 5000" -> 5000
      const amount = parseInt(text.replace(/\D/g, '')) || 0;

      console.log(`Processing: ${amount} CFA from ${from}`);

      // Sync to Supabase
      const { error: dbError } = await supabase
        .from('transactions')
        .insert([{ 
          phone_number: from, 
          amount: amount, 
          raw_text: text 
        }]);

      if (dbError) throw new Error(`Supabase Insert Failed: ${dbError.message}`);

      // Reply via WhatsApp
      const whatsappResult = await fetch(
        `https://graph.facebook.com/v22.0/${process.env.PHONE_NUMBER_ID}/messages`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: from,
            text: { body: `✅ WandaTax: ${amount} CFA logged to Supabase.` },
          }),
        }
      );

      if (!whatsappResult.ok) {
        const errData = await whatsappResult.json();
        console.error("Meta API Error:", JSON.stringify(errData));
      }

      return res.status(200).send('OK');

    } catch (err) {
      console.error("System Crash:", err.message);
      return res.status(200).send('Error but caught'); // Keep 200 so Meta doesn't retry
    }
  }

  return res.status(405).end();
}
