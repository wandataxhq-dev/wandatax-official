export function ensureAdminAccess(req, res) {
  const expectedKey = process.env.ADMIN_API_KEY;
  const providedKey = req.headers['x-api-key'];

  if (!expectedKey) {
    res.status(500).json({ error: 'ADMIN_API_KEY is not configured.' });
    return false;
  }

  if (!providedKey || providedKey !== expectedKey) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }

  return true;
}