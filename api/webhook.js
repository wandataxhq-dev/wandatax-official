import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const translations = {
  EN: {
    kind_ask: "Hey there! 👋 I'm your WandaTax assistant. I help Cameroonians get their NIU and ACF easily. Would you like to start your tax compliance journey now? (Reply with 'Start', 'Register', or 'Taxes')",
    welcome_prompt: "Hey there, before we get to work on sorting out your taxes, which language do you prefer? \n\n1. English \n2. Français",
    niu_check: "Perfect! Let’s get you ready for your ACF. Do you already have a National Identifier Number (NIU)?",
    ask_number: "Great! Please send me your 14-digit NIU.",
    ask_cni: "No worries, please send me a clear photo of your CNI.",
    logged: (amount) => `✅ WandaTax: ${amount} CFA logged.`
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
      
      // 1. NORMALIZE
      let normalizedFrom = from.replace(/\D/g, '');
      if (normalizedFrom.startsWith('237') && !normalizedFrom.startsWith('2376')) {
        normalizedFrom = normalizedFrom.replace('237', '2376');
      }
      console.log(`🔍 Normalized: ${normalizedFrom}`);

      // 2. DATABASE (Silent Failure Mode)
      let profile = null;
      try {
        const { data } = await supabase.from('profiles').select('*').eq('phone_number', normalizedFrom).maybeSingle();
        profile = data;
        
        if (!profile) {
          const { data: newP } = await supabase.from('profiles').insert([{ phone_number: normalizedFrom, onboarding_step: 'START' }]).select().single();
          profile = newP;
        }
      } catch (dbErr) {
        console.error("⚠️ DB Error (Ignoring to send reply):", dbErr.message);
      }

      // 3. FORCE REPLY LOGIC
      // If DB failed or no language, send the Kind Ask or Welcome
      const lowerText = text.toLowerCase();
      const triggers = ['start', 'register', 'taxes'];

      if (!profile || !profile.preferred_language) {
        if (text === '1' || lowerText.includes('eng')) {
          // Try to update DB, but don't wait for it to send reply
          supabase.from('profiles').update({ preferred_language: 'EN', onboarding_step: 'ASK_NIU' }).eq('phone_number', normalizedFrom).then();
          return await sendReply(normalizedFrom, translations.EN.niu_check);
        } 
        
        if (triggers.includes(lowerText)) {
          return await sendReply(normalizedFrom, translations.EN.welcome_prompt);
        } else {
          return await sendReply(normalizedFrom, translations.EN.kind_ask);
        }
      }

      // 4. ONBOARDING (If language exists)
      if (profile.onboarding_step === 'ASK_NIU') {
        return await sendReply(normalizedFrom, translations.EN.ask_number);
      }

    } catch (err) {
      console.error("🔥 Global Catch:", err.message);
    }
  }
}

async function sendReply(to, text) {
  console.log(`📡 Sending to +${to}...`);
  try {
    const response = await fetch(`https://graph.facebook.com/v22.0/${process.env.PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: "whatsapp", to: `+${to}`, type: "text", text: { body: text } })
    });
    const result = await response.json();
    console.log(`✅ Meta API Status:`, result.messaging_product ? "SUCCESS" : "FAILED", JSON.stringify(result));
  } catch (e) {
    console.error("❌ Fetch failed:", e.message);
  }
}
