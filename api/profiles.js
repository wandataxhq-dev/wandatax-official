import { ensureAdminAccess } from '../lib/admin.js';
import { hasSupabaseEnv, getSupabaseClient } from '../lib/supabase.js';
import { normalizePhoneNumber } from '../lib/phone.js';

function extractPhone(req) {
  const queryPhone = req.query.phone ? String(req.query.phone) : '';
  return normalizePhoneNumber(queryPhone);
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

  if (!hasSupabaseEnv()) {
    return res.status(500).json({ error: 'Supabase environment is not configured.' });
  }

  const phone = extractPhone(req);
  if (!phone) {
    return res.status(400).json({ error: 'Missing phone query parameter.' });
  }

  const supabase = getSupabaseClient();

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('phone_number', phone)
    .maybeSingle();

  if (profileError) {
    return res.status(500).json({ error: profileError.message });
  }

  if (!profile) {
    return res.status(404).json({ error: 'Profile not found.' });
  }

  const { data: entries, error: entriesError } = await supabase
    .from('ledger_entries')
    .select('id, entry_type, amount_cfa, source_text, created_at')
    .eq('profile_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(20);

  if (entriesError) {
    return res.status(500).json({ error: entriesError.message });
  }

  return res.status(200).json({
    profile,
    recentTransactions: entries || []
  });
}