import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const translations = {
  EN: {
    welcome: "Hey there, before we get to work on sorting out your taxes, which language do you prefer? / Avant de commencer à gérer vos impôts, quelle langue préférez-vous? \n\n1. English \n2. Français",
    niu_check: "Perfect! Let’s get you ready for your Attestation of Tax Conformity (ACF). Do you already have a National Identifier Number (NIU)? \n\n(Note: Your NIU is NOT your ID card number. It is a unique 'tax birth certificate' issued by the Directorate General of Taxation (DGI).)",
    ask_number: "Great! Please send me your 14-digit National Identifier Number (NIU) so I can verify your profile.",
    ask_cni: "No worries, I'll help you get one. To start your registration with the Directorate General of Taxation (DGI), please send me a clear photo of your National Identity Card (CNI).",
    logged: (amount) => `✅ WandaTax: ${amount} CFA logged.`
  },
  FR: {
    welcome: "Hey there, before we get to work on sorting out your taxes, which language do you prefer? / Avant de commencer à gérer vos impôts, quelle langue préférez-vous? \n\n1. English \n2. Français",
    niu_check: "Parfait ! Préparons votre Attestation de Conformité Fiscale (ACF). Avez-vous déjà un Numéro d'Identifiant Unique (NIU) ? \n\n(Note : Votre NIU n'est PAS le numéro de votre carte d'identité. C'est un 'acte de naissance fiscal' unique délivré par la Direction Générale des Impôts (DGI).)",
    ask_number: "Super ! Veuillez m'envoyer votre Numéro d'Identifiant Unique (NIU) à 14 chiffres pour que je puisse vérifier votre profil.",
    ask_cni: "Pas de soucis, je vais vous aider à en obtenir un. Pour commencer votre enregistrement auprès de la Direction Générale des Impôts (DGI), veuillez m'envoyer une photo claire de votre Carte Nationale d'Identité (CNI).",
    logged: (amount) => `✅ WandaTax : ${amount} CFA enregistré.`
  }
};

export default async function handler(req, res) {
  if (req.method === 'GET') return res.status(200).send(req.query['hub.challenge']);

  if (req.method === 'POST') {
    res.status(200).send('EVENT_RECEIVED');

    try {
      const value = req.body?.entry?.[0]?.changes?.[0]?.value;
      const message = value?.messages?.[0];
      if (!message) return;

      const from = message.from; // This is currently "23770791352"
      const text = (message.text?.body || "").trim();
      
      console.log(`📩 Webhook Log - From: ${from} | Text: ${text}`);

      // 1. FORCE THE "6" INTO THE NUMBER FOR CAMEROON
      let normalizedFrom = from.replace(/\D/g, '');
      if (normalizedFrom.startsWith('237') && !normalizedFrom.startsWith('2376')) {
        normalizedFrom = normalizedFrom.replace('237', '2376');
      }

      // 2. Fetch/Create Profile using Normalized Number
      let { data: profile } = await supabase.from('profiles').select('*').eq('phone_number', normalizedFrom).maybeSingle();

      if (!profile) {
        const { data: newP } = await supabase.from('profiles').insert([{ phone_number: normalizedFrom, onboarding_step: 'START' }]).select().single();
        profile = newP;
      }

      // 3. Language Selection Logic
      if (!profile.preferred_language) {
        if (text === '1' || text.toLowerCase().includes('eng')) {
          await supabase.from('profiles').update({ preferred_language: 'EN', onboarding_step: 'ASK_NIU' }).eq('phone_number', normalizedFrom);
          return await sendReply(normalizedFrom, translations.EN.niu_check);
        } else if (text === '2' || text.toLowerCase().includes('fra')) {
          await supabase.from('profiles').update({ preferred_language: 'FR', onboarding_step: 'ASK_NIU' }).eq('phone_number', normalizedFrom);
          return await sendReply(normalizedFrom, translations.FR.niu_check);
        } else {
          return await sendReply(normalizedFrom, translations.EN.welcome);
        }
      }

      const lang = profile.preferred_language;
      const step = profile.onboarding_step;

      // 4. NIU Branching
      if (step === 'ASK_NIU') {
        if (text.toLowerCase().includes('yes') || text.toLowerCase().includes('oui') || text === '1') {
          await supabase.from('profiles').update({ onboarding_step: 'AWAITING_NIU_NUMBER' }).eq('phone_number', normalizedFrom);
          return await sendReply(normalizedFrom, translations[lang].ask_number);
        } else {
          await supabase.from('profiles').update({ onboarding_step: 'AWAITING_CNI_PHOTO' }).eq('phone_number', normalizedFrom);
          return await sendReply(normalizedFrom, translations[lang].ask_cni);
        }
      }

      // 5. Amount Logging
      const amount = parseInt(text.replace(/\D/g, '')) || 0;
      if (amount > 0) {
        await supabase.from('transactions').insert([{ phone_number: normalizedFrom, amount, raw_text: text }]);
        return await sendReply(normalizedFrom, translations[lang].logged(amount));
      }

    } catch (err) {
      console.error("🔥 Webhook Crash:", err.message);
    }
  }
}

async function sendReply(to, text) {
  // Ensure the reply goes to the EXACT format Meta expects: +2376...
  let cleanNumber = to.replace(/\D/g, '');
  if (!cleanNumber.startsWith('237')) cleanNumber = '237' + cleanNumber;
  if (cleanNumber.startsWith('237') && !cleanNumber.startsWith('2376')) {
    cleanNumber = cleanNumber.replace('237', '2376');
  }
  const finalRecipient = `+${cleanNumber}`;

  console.log(`📡 Attempting reply to: ${finalRecipient}`);

  return fetch(`https://graph.facebook.com/v22.0/${process.env.PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: "whatsapp", to: finalRecipient, type: "text", text: { body: text } })
  });
}
