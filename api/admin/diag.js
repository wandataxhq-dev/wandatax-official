import { ensureAdminAccess } from '../../lib/admin.js';
import { hasSupabaseEnv, getSupabaseClient } from '../../lib/supabase.js';

async function checkSupabase() {
  if (!hasSupabaseEnv()) {
    return { ok: false, error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' };
  }

  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase.from('profiles').select('id').limit(1);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
}

async function checkWhatsAppApi() {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    return { ok: false, error: 'Missing WHATSAPP_TOKEN or PHONE_NUMBER_ID' };
  }

  try {
    const response = await fetch(`https://graph.facebook.com/v22.0/${phoneNumberId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    const body = await response.json();

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: body?.error?.message || 'Graph API request failed',
        code: body?.error?.code,
        type: body?.error?.type
      };
    }

    return {
      ok: true,
      phoneNumberId: body?.id || phoneNumberId,
      verifiedName: body?.verified_name || null,
      displayPhoneNumber: body?.display_phone_number || null
    };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).send('ok');
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!ensureAdminAccess(req, res)) {
    return;
  }

  const [supabase, whatsapp] = await Promise.all([checkSupabase(), checkWhatsAppApi()]);

  return res.status(200).json({
    timestamp: new Date().toISOString(),
    checks: {
      supabase,
      whatsapp
    },
    envPresent: {
      SUPABASE_URL: Boolean(process.env.SUPABASE_URL),
      SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      PHONE_NUMBER_ID: Boolean(process.env.PHONE_NUMBER_ID),
      WHATSAPP_TOKEN: Boolean(process.env.WHATSAPP_TOKEN),
      WHATSAPP_VERIFY_TOKEN: Boolean(process.env.WHATSAPP_VERIFY_TOKEN),
      ADMIN_API_KEY: Boolean(process.env.ADMIN_API_KEY)
    }
  });
}