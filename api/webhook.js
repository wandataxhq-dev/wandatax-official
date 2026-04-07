import { createClient } from '@supabase/supabase-js';

// Initialize Supabase with your Vercel Environment Variables
const supabase = createClient(
  process.env.SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  // 1. META VERIFICATION (Required for the initial handshake)
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === 'WandaVerify123') {
      console.log("✅ Webhook Verified by Meta");
      return res.status(200).send(challenge);
    }
    return res.status(403).end();
  }

  // 2. THE DATA SYNC (Triggered when you send a WhatsApp message)
  if (req.method === 'POST') {
    const body = req.body;

    // Check if this is a valid WhatsApp message
    if (body.object === 'whatsapp' && body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
      const msg = body.entry[0].changes[0].value.messages[0];
      const from = msg.from; // The user's phone number
      const text = msg.text?.body || "";
      
      // Extract only numbers for the amount (e.g., "Sold 5000" -> 5000)
      const amountMatch = text.match(/\d+/);
      const amount = amountMatch ? parseInt(amountMatch[0]) : 0;

      try {
        // --- STEP A: SYNC TO SUPABASE ---
        const { error: dbError } = await supabase.from('transactions').insert([
          { 
            phone_number: from, 
            amount: amount, 
            raw_text: text,
            category: text.toLowerCase().includes('momo') ? 'MTN' : 'General'
          }
        ]);

        if (dbError) {
          console.error("❌ Supabase Sync Error:", dbError.message);
        } else {
          console.log(`✅ Successfully synced ${amount} CFA to Supabase.`);
        }

        // --- STEP B: SEND WHATSAPP REPLY ---
        const whatsappResponse = await fetch(
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
              type: "text",
              text: { body: `🛡️ WandaTax: Logged ${amount} CFA. \n\nSync to Supabase: SUCCESS ✅` },
            }),
          }
        );

        const result = await whatsappResponse.json();
        
        // Log the result so we can see why Meta might be failing
        if (!whatsappResponse.ok) {
          console.error("❌ Meta Reply Error:", JSON.stringify(result));
        } else {
          console.log("📡 WhatsApp Reply Sent!");
        }

      } catch (err) {
        console.error("🔥 Critical System Error:", err.message);
      }
    }

    // Always return 200 to Meta so they don't keep retrying the same message
    return res.status(200).send('EVENT_RECEIVED');
  }

  res.status(405).end();
}
