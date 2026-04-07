import { ensureAdminAccess } from '../../lib/admin.js';
import { hasSupabaseEnv, getSupabaseClient } from '../../lib/supabase.js';

function getUtcRangeForDate(dateInput) {
  const datePart = dateInput || new Date().toISOString().slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    return null;
  }

  const start = `${datePart}T00:00:00.000Z`;
  const end = `${datePart}T23:59:59.999Z`;
  return { datePart, start, end };
}

function summarize(entries) {
  let incomeCfa = 0;
  let expenseCfa = 0;

  for (const entry of entries) {
    const amount = Number(entry.amount_cfa || 0);
    if (entry.entry_type === 'INCOME') incomeCfa += amount;
    if (entry.entry_type === 'EXPENSE') expenseCfa += amount;
  }

  return {
    transactionCount: entries.length,
    incomeCfa,
    expenseCfa,
    netCfa: incomeCfa - expenseCfa
  };
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

  const range = getUtcRangeForDate(req.query.date);
  if (!range) {
    return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
  }

  const supabase = getSupabaseClient();

  let query = supabase
    .from('ledger_entries')
    .select('id, profile_id, entry_type, amount_cfa, source_text, created_at')
    .gte('created_at', range.start)
    .lte('created_at', range.end)
    .order('created_at', { ascending: false });

  const phone = req.query.phone ? String(req.query.phone) : '';
  if (phone) {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, phone_number')
      .eq('phone_number', phone)
      .maybeSingle();

    if (profileError) {
      return res.status(500).json({ error: profileError.message });
    }

    if (!profile) {
      return res.status(200).json({
        date: range.datePart,
        filter: { phone },
        summary: { transactionCount: 0, incomeCfa: 0, expenseCfa: 0, netCfa: 0 },
        transactions: []
      });
    }

    query = query.eq('profile_id', profile.id);
  }

  const { data: entries, error } = await query;

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.status(200).json({
    date: range.datePart,
    filter: phone ? { phone } : null,
    summary: summarize(entries || []),
    transactions: entries || []
  });
}