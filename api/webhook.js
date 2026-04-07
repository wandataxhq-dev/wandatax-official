import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// 🌍 Translation Dictionary
const content = {
  EN: {
    niu_explanation: "Hey there, let’s get you ready for your Attestation of Tax Conformity (ACF). Do you already have a National Identifier Number (NIU)? \n\nJust a heads up: Your NIU is NOT your ID card number. Think of it as your 'tax birth certificate'—it’s a unique number given to you by the Directorate General of Taxation (DGI) that identifies you for business.",
    ask_language: "Hey there, before we get to work on sorting out your taxes, which language do you prefer? / Avant de commencer à gérer vos impôts, quelle langue préférez-vous? \n\n1. English \n2. Français",
    error: "Oops, something went wrong. Let's try that again."
  },
  FR: {
    niu_explanation: "Hey there, préparons votre Attestation de Conformité Fiscale (ACF). Avez-vous déjà un Numéro d'Identifiant Unique (NIU) ? \n\nNotez bien : Votre NIU n'est PAS le numéro de votre carte d'identité. C'est comme un 'acte de naissance fiscal'—un numéro unique délivré par la Direction Générale des Impôts (DGI) pour vous identifier.",
  }
};

export default async function handler(req, res) {
  if (req.method === 'GET') return res.status(200).send(req.query['hub.challenge']);

  if (req.method === 'POST') {
    try {
      const value = req.body?.entry?.[0]?.changes?.[0]?.value;
      const message = value?.messages?.[0];
      if (!message) return res.status(200).send('OK');

      const from = message.from;
      const text = message.text?.body || "";

      // 1. Check User Profile in Supabase
      let { data: profile } = await supabase.from('profiles').select('*').eq('phone_number', from).single();

      // 2. New User / Language Selection
      if (!profile || !profile.preferred_language) {
        if (!profile) {
          await supabase.from('profiles').insert([{ phone_number: from, onboarding_step: 'AWAITING_LANGUAGE' }]);
        }
        
        // Handle incoming language choice
        if (text.includes('1') || text.toLowerCase().includes('eng')) {
          await supabase.from('profiles').update({ preferred_language: 'EN', onboarding_step: 'ASK_NIU' }).eq('phone_number', from);
          return sendReply(from, content.EN.niu_explanation);
        } else if (text.includes('2') || text.toLowerCase().includes('fra')) {
          await supabase.from('profiles').update({ preferred_language: 'FR', onboarding_step: 'ASK_NIU' }).eq('phone_number', from);
          return sendReply(from, content.FR.niu_explanation);
        } else {
          return sendReply(from, content.EN.ask_language); // Default bilingual prompt
        }
      }

      // 3. Logic for existing users (Transactions or Onboarding)
      const lang = profile.preferred_language || 'EN';
      
      // If the user is just logging a transaction:
      const amount = parseInt(text.replace(/\D/g, '')) || 0;
      if (amount > 0) {
        await supabase.from('transactions').insert([{ phone_number: from, amount, raw_text: text }]);
        const reply = lang === 'EN' 
          ? `✅ WandaTax: ${amount} CFA logged to Supabase.` 
          : `✅ WandaTax : ${amount} CFA enregistré dans Supabase.`;
        return sendReply(from, reply);
      }

      return res.status(200).send('OK');
    } catch (err) {
      console.error(err);
      return res.status(200).send('Error');
    }
  }
}

async function sendReply(to, text) {
  // Format number for Cameroon (+2376...)
  let cleanNumber = to.replace(/\D/g, '');
  if (!cleanNumber.startsWith('237')) cleanNumber = '237' + cleanNumber;
  if (cleanNumber.startsWith('237') && !cleanNumber.startsWith('2376')) cleanNumber = cleanNumber.replace('237', '2376');

  return fetch(`https://graph.facebook.com/v22.0/${process.env.PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: "whatsapp", to: `+${cleanNumber}`, type: "text", text: { body: text } })
  });
}
