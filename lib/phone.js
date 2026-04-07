export function normalizePhoneNumber(rawPhoneNumber) {
  let normalized = String(rawPhoneNumber || '').replace(/\D/g, '');

  if (normalized.startsWith('237') && !normalized.startsWith('2376')) {
    normalized = normalized.replace('237', '2376');
  }

  return normalized;
}