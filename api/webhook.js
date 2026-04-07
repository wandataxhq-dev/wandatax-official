import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const translations = {
  EN: {
    kind_ask: "Hey there! 👋 I'm your WandaTax assistant. I help Cameroonians get their NIU and ACF easily. Would you like to start? (Reply 'Start', 'Register', or 'Taxes')",
    welcome_prompt: "Hey there, before we get to work on sorting out your taxes, which language do you prefer? / Avant de commencer à gérer vos impôts, quelle langue préférez-vous? \n\n1. English \n2. Français",
    niu_check: "Perfect! Let’s get you ready for your ACF. Do you already have a National Identifier Number (NIU)?"
  }
};

export default async function handler(req, res) {
  if (req.method === 'GET') return res.status(200).send(req.query['hub.challenge']);

  if (req.method === 'POST') {
    res.status(200).send('EVENT_RECEIVED');

    try {
      const value = req.body?.entry?.[0]?.changes?.[0]?.value;
      const message = value?.messages?.[0];
      if (!message || message.type !== 'text') return;

      const from = message.from;
      const text = (message.text?.body || "").trim();
      const lowerText = text.toLowerCase();
      
      // 1. NORMALIZE
      let normalizedFrom = from.replace(/\D/g, '');
      if (normalizedFrom.startsWith('237') && !normalizedFrom.startsWith('2376')) {
        normalizedFrom = normalizedFrom.replace('237', '2376');
      }
      console.log(`🔍 Normalized: ${normalizedFrom}`);

      // 2. IMMEDIATE REPLY (Don't wait for Supabase!)
      const triggers = ['start', 'register', 'taxes'];
      if (triggers.includes(lowerText)) {
        await sendReply(normalizedFrom, translations.EN.welcome_prompt);
      } else {
        await sendReply(normalizedFrom, translations.EN.kind_ask);
      }

      // 3. BACKGROUND DATABASE SYNC (Fire and Forget)
      console.log(`⏳ Attempting background DB sync...`);
      supabase.from('profiles').upsert(
        { phone_number: normalizedFrom, onboarding_step: 'START' },
        { onConflict: 'phone_number' }
      ).then(({ error }) => {
        if (error) console.error("❌ DB Background Error:", error.message);
        else console.log("✅ DB Sync Successful");
      });

    } catch (err) {
      console.error("🔥 Global Catch:", err.message);
    }
  }
}

async function sendReply(to, text) {
  console.log(`📡 Sending reply to +${to}`);
  try {
    const response = await fetch(`https://graph.facebook.com/v22.0/${process.env.PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`, 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({ 
        messaging_product: "whatsapp", 
        to: `+${to}`, 
        type: "text", 
        text: { body: text } 
      })
    });
    const result = await response.json();
    console.log(`✅ Meta API Result:`, JSON.stringify(result));
  } catch (e) {
    console.error("❌ WhatsApp Fetch failed:", e.message);
  }
}
