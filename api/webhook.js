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
    // 1. IMMEDIATE ACKNOWLEDGMENT (Prevents Meta from retrying and causing loops)
    res.status(200).send('EVENT_RECEIVED');

    try {
      const value = req.body?.entry?.[0]?.changes?.[0]?.value;
      const message = value?.messages?.[0];
      
      // CRITICAL: Only process incoming TEXT messages from users (ignore bot's own status updates)
      if (!message || message.type !== 'text') return;

      const from = message.from;
      const text = (message.text?.body || "").trim();
      const lowerText = text.toLowerCase();

      console.log(`⭐ Processing message from ${from}: "${text}"`);

      // 2. NORMALIZE NUMBER (Handle the Cameroon 6)
      let normalizedFrom = from.replace(/\D/g, '');
      if (normalizedFrom.startsWith('237') && !normalizedFrom.startsWith('2376')) {
        normalizedFrom = normalizedFrom.replace('237', '2376');
      }
      console.log(`🔍 Normalized number to: ${normalizedFrom}`);

      // 3. DATABASE CHECK (With Fail-Safe)
      let profile = null;
      try {
        let { data } = await supabase.from('profiles').select('*').eq('phone_number', normalizedFrom).maybeSingle();
        profile = data;

        if (!profile) {
          console.log(`🆕 Creating profile for ${normalizedFrom}`);
          const { data: newP } = await supabase.from('profiles').insert([{ phone_number: normalizedFrom, onboarding_step: 'START' }]).select().single();
          profile = newP;
        }
      } catch (dbErr) {
        console.error("❌ Supabase Error:", dbErr.message);
        // If DB fails, we still want to try sending the welcome message
      }

      // 4. TRIGGER WORDS
      const triggers = ['start', 'register', 'taxes'];
      const isTrigger = triggers.includes(lowerText);

      // 5. THE "KIND ASK" & LANGUAGE FLOW
      if (!profile || !profile.preferred_language) {
        if (text === '1' || lowerText.includes('eng')) {
          await supabase.from('profiles').update({ preferred_language: 'EN', onboarding_step: 'ASK_NIU' }).eq('phone_number', normalizedFrom);
          return await sendReply(normalizedFrom, translations.EN.niu_check);
        } else if (isTrigger) {
          return await sendReply(normalizedFrom, translations.EN.welcome_prompt);
        } else {
          return await sendReply(normalizedFrom, translations.EN.kind_ask);
        }
      }

      // 6. ONBOARDING STEPS
      const step = profile.onboarding_step;
      if (step === 'ASK_NIU') {
        if (lowerText.includes('yes') || text === '1') {
          await supabase.from('profiles').update({ onboarding_step: 'AWAITING_NIU_NUMBER' }).eq('phone_number', normalizedFrom);
          return await sendReply(normalizedFrom, translations.EN.ask_number);
        } else {
          await supabase.from('profiles').update({ onboarding_step: 'AWAITING_CNI_PHOTO' }).eq('phone_number', normalizedFrom);
          return await sendReply(normalizedFrom, translations.EN.ask_cni);
        }
      }

    } catch (err) {
      console.error("🔥 Global Catch:", err.message);
    }
  }
}

async function sendReply(to, text) {
  // Always ensure the outgoing 'to' has the correct prefix
  let cleanNumber = to.replace(/\D/g, '');
  if (!cleanNumber.startsWith('237')) cleanNumber = '237' + cleanNumber;
  if (cleanNumber.startsWith('237') && !cleanNumber.startsWith('2376')) cleanNumber = cleanNumber.replace('237', '2376');
  
  console.log(`📡 Outgoing Reply to +${cleanNumber}`);

  try {
    const response = await fetch(`https://graph.facebook.com/v22.0/${process.env.PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: "whatsapp", to: `+${cleanNumber}`, type: "text", text: { body: text } })
    });
    const result = await response.json();
    console.log(`✅ WhatsApp API Response:`, JSON.stringify(result));
  } catch (fetchErr) {
    console.error("❌ Fetch Error:", fetchErr.message);
  }
}
