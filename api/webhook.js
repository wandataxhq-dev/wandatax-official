import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const translations = {
  EN: {
    kind_ask: "Hey there! 👋 I'm your WandaTax assistant. I help Cameroonians get their NIU and ACF easily. Would you like to start your tax compliance journey now? (Reply with 'Start', 'Register', or 'Taxes')",
    welcome_prompt: "Hey there, before we get to work on sorting out your taxes, which language do you prefer? / Avant de commencer à gérer vos impôts, quelle langue préférez-vous? \n\n1. English \n2. Français",
    niu_check: "Perfect! Let’s get you ready for your Attestation of Tax Conformity (ACF). Do you already have a National Identifier Number (NIU)? \n\n(Note: Your NIU is NOT your ID card number. It is a unique 'tax birth certificate' issued by the DGI.)",
    ask_number: "Great! Please send me your 14-digit NIU so I can verify your profile.",
    ask_cni: "No worries, I'll help you get one. To start your registration with the DGI, please send me a clear photo of your CNI.",
    logged: (amount) => `✅ WandaTax: ${amount} CFA logged.`
  },
  FR: {
    kind_ask: "Hey there ! 👋 Je suis votre assistant WandaTax. J'aide les Camerounais à obtenir leur NIU et leur ACF facilement. Souhaitez-vous commencer ? (Répondez 'Start', 'Register' ou 'Taxes')",
    welcome_prompt: "Hey there, before we get to work on sorting out your taxes, which language do you prefer? / Avant de commencer à gérer vos impôts, quelle langue préférez-vous? \n\n1. English \n2. Français",
    niu_check: "Parfait ! Préparons votre Attestation de Conformité Fiscale (ACF). Avez-vous déjà un Numéro d'Identifiant Unique (NIU) ? \n\n(Note : Votre NIU n'est PAS le numéro de votre carte d'identité. C'est un 'acte de naissance fiscal' unique délivré par la DGI.)",
    ask_number: "Super ! Veuillez m'envoyer votre NIU à 14 chiffres pour que je puisse vérifier votre profil.",
    ask_cni: "Pas de soucis, je vais vous aider à en obtenir un. Pour commencer votre enregistrement auprès de la DGI, veuillez m'envoyer une photo claire de votre CNI.",
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

      const from = message.from;
      const text = (message.text?.body || "").trim();
      const lowerText = text.toLowerCase();

      // 1. Normalize Number (Injecting the '6' for Cameroon if missing)
      let normalizedFrom = from.replace(/\D/g, '');
      if (normalizedFrom.startsWith('237') && !normalizedFrom.startsWith('2376')) {
        normalizedFrom = normalizedFrom.replace('237', '2376');
      }

      // 2. Fetch or Create Profile using Normalized Number
      let { data: profile } = await supabase.from('profiles').select('*').eq('phone_number', normalizedFrom).maybeSingle();

      if (!profile) {
        const { data: newP } = await supabase.from('profiles').insert([{ phone_number: normalizedFrom, onboarding_step: 'START' }]).select().single();
        profile = newP;
      }

      const triggers = ['start', 'register', 'taxes'];
      const isTrigger = triggers.includes(lowerText);

      // 3. Logic: Check for Language
      if (!profile.preferred_language) {
        if (text === '1' || lowerText.includes('eng')) {
          await supabase.from('profiles').update({ preferred_language: 'EN', onboarding_step: 'ASK_NIU' }).eq('phone_number', normalizedFrom);
          return await sendReply(normalizedFrom, translations.EN.niu_check);
        } else if (text === '2' || lowerText.includes('fra')) {
          await supabase.from('profiles').update({ preferred_language: 'FR', onboarding_step: 'ASK_NIU' }).eq('phone_number', normalizedFrom);
          return await sendReply(normalizedFrom, translations.FR.niu_check);
        } else if (isTrigger) {
          return await sendReply(normalizedFrom, translations.EN.welcome_prompt);
        } else {
          return await sendReply(normalizedFrom, translations.EN.kind_ask);
        }
      }

      // 4. Logic: Step-by-Step Onboarding
      const lang = profile.preferred_language;
      const step = profile.onboarding_step;

      if (step === 'ASK_NIU') {
        const hasNIU = lowerText.includes('yes') || lowerText.includes('oui') || text === '1';
        if (hasNIU) {
          await supabase.from('profiles').update({ onboarding_step: 'AWAITING_NIU_NUMBER' }).eq('phone_number', normalizedFrom);
          return await sendReply(normalizedFrom, translations[lang].ask_number);
        } else {
          await supabase.from('profiles').update({ onboarding_step: 'AWAITING_CNI_PHOTO' }).eq('phone_number', normalizedFrom);
          return await sendReply(normalizedFrom, translations[lang].ask_cni);
        }
      }

      // 5. Amount Logging (Fallthrough)
      const amount = parseInt(text.replace(/\D/g, '')) || 0;
      if (amount > 0 && message.type === 'text') {
        await supabase.from('transactions').insert([{ phone_number: normalizedFrom, amount, raw_text: text }]);
        return await sendReply(normalizedFrom, translations[lang].logged(amount));
      }

    } catch (err) {
      console.error("Webhook Error:", err.message);
    }
    return;
  }
}

async function sendReply(to, text) {
  let cleanNumber = to.replace(/\D/g, '');
  if (!cleanNumber.startsWith('237')) cleanNumber = '237' + cleanNumber;
  if (cleanNumber.startsWith('237') && !cleanNumber.startsWith('2376')) cleanNumber = cleanNumber.replace('237', '2376');
  
  return fetch(`https://graph.facebook.com/v22.0/${process.env.PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: "whatsapp", to: `+${cleanNumber}`, type: "text", text: { body: text } })
  });
}
