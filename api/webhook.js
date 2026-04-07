import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  // 1. Immediate Verification (GET)
  if (req.method === 'GET') {
    return res.status(200).send(req.query['hub.challenge']);
  }

  if (req.method === 'POST') {
    // 🔥 CRITICAL: Tell Meta immediately that we received the message to stop the loop
    res.status(200).send('EVENT_RECEIVED');

    try {
      const value = req.body?.entry?.[0]?.changes?.[0]?.value;
      const message = value?.messages?.[0];
      
      if (!message) return;

      const from = message.from;
      const text = message.text?.body || "";
      const msgId = message.id; // Unique ID from Meta

      // 2. Fetch or Create Profile
      let { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('phone_number', from)
        .maybeSingle(); // Use maybeSingle to avoid 406 errors

      if (profileError) {
        console.error("Supabase Profile Error:", profileError.message);
        return;
      }

      // 3. New User Flow
      if (!profile || !profile.preferred_language) {
        if (!profile) {
          await supabase.from('profiles').insert([{ phone_number: from, onboarding_step: 'AWAITING_LANGUAGE' }]);
        }
        
        const langChoice = text.trim();
        if (langChoice === '1' || langChoice.toLowerCase().includes('eng')) {
          await supabase.from('profiles').update({ preferred_language: 'EN', onboarding_step: 'ASK_NIU' }).eq('phone_number', from);
          return sendReply(from, "Hey there, let’s get you ready for your Attestation of Tax Conformity (ACF). Do you already have a National Identifier Number (NIU)? \n\nNote: Your NIU is NOT your ID card number. It is a 'tax birth certificate' from the Directorate General of Taxation (DGI).");
        } else if (langChoice === '2' || langChoice.toLowerCase().includes('fra')) {
          await supabase.from('profiles').update({ preferred_language: 'FR', onboarding_step: 'ASK_NIU' }).eq('phone_number', from);
          return sendReply(from, "Hey there, préparons votre Attestation de Conformité Fiscale (ACF). Avez-vous déjà un Numéro d'Identifiant Unique (NIU) ? \n\nNote : Votre NIU n'est PAS le numéro de votre carte d'identité. C'est un 'acte de naissance fiscal' de la Direction Générale des Impôts (DGI).");
        } else {
          return sendReply(from, "Hey there, before we get to work on sorting out your taxes, which language do you prefer? / Avant de commencer à gérer vos impôts, quelle langue préférez-vous? \n\n1. English \n2. Français");
        }
      }

      // 4. Regular Transaction Logging
      const amount = parseInt(text.replace(/\D/g, '')) || 0;
      if (amount > 0) {
        await supabase.from('transactions').insert([{ phone_number: from, amount, raw_text: text }]);
        const reply = profile.preferred_language === 'EN' 
          ? `✅ WandaTax: ${amount} CFA logged.` 
          : `✅ WandaTax : ${amount} CFA enregistré.`;
        return sendReply(from, reply);
      }

    } catch (err) {
      console.error("Global Error:", err.message);
    }
    return;
  }

  res.status(405).end();
}

async function sendReply(to, text) {
  let cleanNumber = to.replace(/\D/g, '');
  if (!cleanNumber.startsWith('237')) cleanNumber = '237' + cleanNumber;
  if (cleanNumber.startsWith('237') && !cleanNumber.startsWith('2376')) cleanNumber = cleanNumber.replace('237', '2376');

  await fetch(`https://graph.facebook.com/v22.0/${process.env.PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: "whatsapp", to: `+${cleanNumber}`, type: "text", text: { body: text } })
  });
}
