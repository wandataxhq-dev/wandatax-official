import { createClient } from '@supabase/supabase-js';

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  // 1. GET: Handle Meta Webhook Verification Handshake
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    // Ensure this matches the 'Verify Token' in your Meta Dashboard
    if (mode === 'subscribe' && token === 'WandaVerify123') {
      return res.status(200).send(challenge);
    }
    return res.status(403).end();
  }

  // 2. POST: Handle Incoming WhatsApp Messages
  if (req.method === 'POST') {
    try {
      const value = req.body?.entry?.[0]?.changes?.[0]?.value;
      const message = value?.messages?.[0];

      if (!message) {
        return res.status(200).send('No Message');
      }

      const from = message.from; // Incoming raw number
      const text = message.text?.body || "";
      
      // Extract amount (e.g., "Momo 5000" -> 5000)
      const amount = parseInt(text.replace(/\D/g, '')) || 0;

      // --- STEP A: SYNC TO SUPABASE ---
      const { error: dbError } = await supabase
        .from('transactions')
        .insert([{ 
          phone_number: from, 
          amount: amount, 
          raw_text: text 
        }]);

      if (dbError) {
        console.error("❌ Supabase Sync Error:", dbError.message);
      }

      // --- STEP B: FORMAT NUMBER FOR META REPLY ---
      // We force it to +237670791352 to match your whitelisted format
      let cleanNumber = from.replace(/\D/g, ''); 
      if (!cleanNumber.startsWith('237')) {
          cleanNumber = '237' + cleanNumber;
      }
      // Ensure the '6' is present after '237' if missing
      if (cleanNumber.startsWith('237') && !cleanNumber.startsWith('2376')) {
          cleanNumber = cleanNumber.replace('237', '2376');
      }
      const finalRecipient = `+${cleanNumber}`;

      // --- STEP C: SEND WHATSAPP CONFIRMATION ---
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
            to: finalRecipient,
            type: "text",
            text: { body: `✅ WandaTax: ${amount} CFA logged to Supabase.` },
          }),
        }
      );

      const result = await whatsappResult.json();
      
      if (!whatsappResult.ok) {
        console.error("❌ Meta API Error Detail:", JSON.stringify(result));
      } else {
        console.log(`📡 Reply successfully sent to ${finalRecipient}`);
      }

      return res.status(200).send('OK');

    } catch (err) {
      console.error("🔥 System Crash:", err.message);
      return res.status(200).send('Caught Error');
    }
  }

  return res.status(405).end();
}
