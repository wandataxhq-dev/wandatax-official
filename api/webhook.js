import { createClient } from '@supabase/supabase-js';
import { parseMessage } from './parser.js';
import { sendWhatsApp } from '../lib/whatsapp.js';

const REQUIRED_ENV_VARS = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'WHATSAPP_TOKEN',
  'PHONE_NUMBER_ID',
  'WHATSAPP_VERIFY_TOKEN'
];

const STEPS = {
  AWAITING_LANGUAGE: 'AWAITING_LANGUAGE',
  AWAITING_NIU_STATUS: 'AWAITING_NIU_STATUS',
  AWAITING_NIU_VALUE: 'AWAITING_NIU_VALUE',
  AWAITING_BUSINESS_NAME: 'AWAITING_BUSINESS_NAME',
  COMPLETE: 'COMPLETE'
};

const LANG = {
  EN: 'EN',
  FR: 'FR'
};

const translations = {
  EN: {
    startPrompt:
      "Hello. I am your WandaTax assistant. Reply with 'Start', 'Register', or 'Taxes' to begin.",
    welcomePrompt:
      'Before we continue, choose your language:\n\n1. English\n2. Francais',
    invalidLanguage: 'Please choose a language by sending 1 for English or 2 for Francais.',
    niuCheck: 'Great. Do you already have a National Identifier Number (NIU)? Reply Yes or No.',
    niuAsk: 'Please send your NIU now.',
    niuInvalid: 'That NIU format looks invalid. Please send letters/numbers only (8 to 20 characters).',
    noNiuAskBusiness:
      'No problem. I can help you prepare NIU registration. Send your business name to continue.',
    businessNameInvalid: 'Please send a valid business name (at least 2 characters).',
    completed:
      'Perfect. Your profile setup is complete. You can now send transaction messages like "income 12000".',
    helpText:
      'I am ready. Send a MoMo SMS, or type "income 12000" / "expense 3500" to log entries.'
  },
  FR: {
    startPrompt:
      "Bonjour. Je suis votre assistant WandaTax. Repondez avec 'Start', 'Register' ou 'Taxes' pour commencer.",
    welcomePrompt:
      'Avant de continuer, choisissez votre langue:\n\n1. English\n2. Francais',
    invalidLanguage: 'Choisissez la langue en envoyant 1 pour English ou 2 pour Francais.',
    niuCheck: 'Parfait. Avez-vous deja un Numero d\'Identification Unique (NIU) ? Repondez Oui ou Non.',
    niuAsk: 'Envoyez maintenant votre NIU.',
    niuInvalid:
      'Le format NIU semble invalide. Envoyez uniquement lettres/chiffres (8 a 20 caracteres).',
    noNiuAskBusiness:
      'Pas de souci. Je peux vous aider pour la demande de NIU. Envoyez le nom de votre entreprise.',
    businessNameInvalid: 'Envoyez un nom d\'entreprise valide (au moins 2 caracteres).',
    completed:
      'Parfait. Votre profil est configure. Vous pouvez envoyer des messages comme "income 12000".',
    helpText:
      'Je suis pret. Envoyez un SMS MoMo, ou "income 12000" / "expense 3500" pour enregistrer.'
  }
};

function hasRequiredEnvVars() {
  return REQUIRED_ENV_VARS.every((key) => Boolean(process.env[key]));
}

function getSupabaseClient() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function normalizePhoneNumber(rawPhoneNumber) {
  let normalized = String(rawPhoneNumber || '').replace(/\D/g, '');

  // Cameroon local numbers sometimes arrive without the expected 6 prefix.
  if (normalized.startsWith('237') && !normalized.startsWith('2376')) {
    normalized = normalized.replace('237', '2376');
  }

  return normalized;
}

function getIncomingText(message) {
  return (message?.text?.body || '').trim();
}

function isStartTrigger(text) {
  const triggerSet = new Set(['start', 'register', 'taxes']);
  return triggerSet.has(text.toLowerCase());
}

function pickLanguageFromText(text) {
  const value = text.toLowerCase();
  if (['1', 'en', 'eng', 'english'].includes(value)) return LANG.EN;
  if (['2', 'fr', 'fra', 'french', 'francais', 'français'].includes(value)) return LANG.FR;
  return null;
}

function parseYesNo(text) {
  const value = text.toLowerCase();
  if (['yes', 'y', 'oui', 'o'].includes(value)) return true;
  if (['no', 'n', 'non'].includes(value)) return false;
  return null;
}

function sanitizeNiu(text) {
  return text.replace(/\s+/g, '').toUpperCase();
}

function isValidNiu(text) {
  return /^[A-Z0-9]{8,20}$/.test(text);
}

function pickLanguageOrDefault(language) {
  return language === LANG.FR ? LANG.FR : LANG.EN;
}

async function markMessageProcessed(supabase, messageId, phoneNumber) {
  if (!messageId) return { duplicate: false };

  const { error } = await supabase
    .from('whatsapp_events')
    .insert({ whatsapp_message_id: messageId, phone_number: phoneNumber });

  if (!error) return { duplicate: false };

  if (error.code === '23505') return { duplicate: true };

  // If table does not exist yet, keep processing instead of failing.
  if (error.code === '42P01') return { duplicate: false };

  throw error;
}

async function getOrCreateProfile(supabase, phoneNumber, contactName) {
  const { data: existing, error: fetchError } = await supabase
    .from('profiles')
    .select('*')
    .eq('phone_number', phoneNumber)
    .maybeSingle();

  if (fetchError) throw fetchError;

  if (existing) {
    return existing;
  }

  const payload = {
    phone_number: phoneNumber,
    onboarding_step: STEPS.AWAITING_LANGUAGE,
    preferred_language: LANG.EN,
    full_name: contactName || null,
    has_niu: null,
    niu_value: null,
    business_name: null,
    last_message_at: new Date().toISOString()
  };

  const { data: created, error: createError } = await supabase
    .from('profiles')
    .insert(payload)
    .select('*')
    .single();

  if (createError) throw createError;
  return created;
}

async function updateProfile(supabase, phoneNumber, updates) {
  const { data, error } = await supabase
    .from('profiles')
    .update({ ...updates, last_message_at: new Date().toISOString() })
    .eq('phone_number', phoneNumber)
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

async function saveLedgerEntry(supabase, profileId, parsedResult, sourceText) {
  if (!parsedResult?.amountCfa || !parsedResult?.type) return;

  const payload = {
    profile_id: profileId,
    entry_type: parsedResult.type,
    amount_cfa: parsedResult.amountCfa,
    source_text: sourceText
  };

  const { error } = await supabase.from('ledger_entries').insert(payload);

  // If ledger table is absent, keep the bot alive.
  if (error && error.code !== '42P01') {
    throw error;
  }
}

async function handleConversationStep(supabase, profile, incomingText, phoneNumber) {
  const language = pickLanguageOrDefault(profile.preferred_language);
  const i18n = translations[language];

  if (profile.onboarding_step === STEPS.AWAITING_LANGUAGE) {
    const selectedLanguage = pickLanguageFromText(incomingText);
    if (!selectedLanguage) {
      await sendWhatsApp(phoneNumber, i18n.invalidLanguage);
      return;
    }

    const selectedI18n = translations[selectedLanguage];
    await updateProfile(supabase, phoneNumber, {
      preferred_language: selectedLanguage,
      onboarding_step: STEPS.AWAITING_NIU_STATUS
    });
    await sendWhatsApp(phoneNumber, selectedI18n.niuCheck);
    return;
  }

  if (profile.onboarding_step === STEPS.AWAITING_NIU_STATUS) {
    const answer = parseYesNo(incomingText);
    if (answer === null) {
      await sendWhatsApp(phoneNumber, i18n.niuCheck);
      return;
    }

    if (answer) {
      await updateProfile(supabase, phoneNumber, {
        has_niu: true,
        onboarding_step: STEPS.AWAITING_NIU_VALUE
      });
      await sendWhatsApp(phoneNumber, i18n.niuAsk);
      return;
    }

    await updateProfile(supabase, phoneNumber, {
      has_niu: false,
      onboarding_step: STEPS.AWAITING_BUSINESS_NAME
    });
    await sendWhatsApp(phoneNumber, i18n.noNiuAskBusiness);
    return;
  }

  if (profile.onboarding_step === STEPS.AWAITING_NIU_VALUE) {
    const niu = sanitizeNiu(incomingText);
    if (!isValidNiu(niu)) {
      await sendWhatsApp(phoneNumber, i18n.niuInvalid);
      return;
    }

    await updateProfile(supabase, phoneNumber, {
      niu_value: niu,
      onboarding_step: STEPS.COMPLETE
    });

    await sendWhatsApp(phoneNumber, i18n.completed);
    return;
  }

  if (profile.onboarding_step === STEPS.AWAITING_BUSINESS_NAME) {
    if (incomingText.length < 2) {
      await sendWhatsApp(phoneNumber, i18n.businessNameInvalid);
      return;
    }

    await updateProfile(supabase, phoneNumber, {
      business_name: incomingText,
      onboarding_step: STEPS.COMPLETE
    });

    await sendWhatsApp(phoneNumber, i18n.completed);
    return;
  }

  const parsed = await parseMessage({ text: { body: incomingText } });
  await saveLedgerEntry(supabase, profile.id, parsed, incomingText);
  await sendWhatsApp(phoneNumber, parsed.replyText || i18n.helpText);
}

async function handleWebhookMessage(reqBody) {
  const changeValue = reqBody?.entry?.[0]?.changes?.[0]?.value;
  const message = changeValue?.messages?.[0];

  if (!message || message.type !== 'text') {
    return;
  }

  const incomingText = getIncomingText(message);
  const normalizedFrom = normalizePhoneNumber(message.from);
  const messageId = message.id;
  const contactName = changeValue?.contacts?.[0]?.profile?.name || null;

  if (!normalizedFrom) {
    console.warn('Skipping message because phone number is missing.');
    return;
  }

  const supabase = getSupabaseClient();
  const dedupe = await markMessageProcessed(supabase, messageId, normalizedFrom);
  if (dedupe.duplicate) {
    console.log(`Duplicate message ignored: ${messageId}`);
    return;
  }

  if (isStartTrigger(incomingText)) {
    await getOrCreateProfile(supabase, normalizedFrom, contactName);
    await updateProfile(supabase, normalizedFrom, {
      onboarding_step: STEPS.AWAITING_LANGUAGE
    });

    await sendWhatsApp(normalizedFrom, translations.EN.welcomePrompt);
    return;
  }

  const profile = await getOrCreateProfile(supabase, normalizedFrom, contactName);

  if (!profile.onboarding_step) {
    await updateProfile(supabase, normalizedFrom, { onboarding_step: STEPS.AWAITING_LANGUAGE });
    await sendWhatsApp(normalizedFrom, translations.EN.welcomePrompt);
    return;
  }

  await handleConversationStep(supabase, profile, incomingText, normalizedFrom);
}

function handleWebhookVerification(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  return res.status(403).send('Forbidden');
}

export default async function handler(req, res) {
  if (!hasRequiredEnvVars()) {
    console.error('Missing required environment variables.');
    return res.status(500).json({ error: 'Server environment is not configured.' });
  }

  if (req.method === 'OPTIONS') {
    return res.status(200).send('ok');
  }

  if (req.method === 'GET') {
    return handleWebhookVerification(req, res);
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await handleWebhookMessage(req.body);
    return res.status(200).send('EVENT_RECEIVED');
  } catch (error) {
    console.error('Webhook processing error:', error?.message || error);
    return res.status(200).send('EVENT_RECEIVED');
  }
}