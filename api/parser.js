export async function parseMessage(message) {
  const text = (message?.text?.body || '').trim();
  const lowerText = text.toLowerCase();

  // Detect amounts from mobile money style SMS text.
  const momoRegex = /(?:confirmed|transfer of|sent|received)\s?([\d,.]+)\s?fcfa/i;
  const momoMatch = text.match(momoRegex);

  if (momoMatch) {
    const amount = Number(momoMatch[1].replace(/,/g, ''));
    const type = lowerText.includes('received') ? 'INCOME' : 'EXPENSE';
    return {
      amountCfa: amount,
      type,
      replyText: `WandaTax Shield\n\nDetected ${type.toLowerCase()}: ${amount} CFA.\nLogged to your ledger.`
    };
  }

  // Accept direct amount inputs such as "12500" or "12,500".
  const amountOnlyMatch = text.match(/^([\d,.]{3,})$/);
  if (amountOnlyMatch) {
    const amount = Number(amountOnlyMatch[1].replace(/,/g, ''));
    return {
      amountCfa: amount,
      type: 'INCOME',
      replyText: `WandaTax Shield\n\nRecorded income: ${amount} CFA.`
    };
  }

  const commandMatch = text.match(/^(income|expense)\s+([\d,.]+)$/i);
  if (commandMatch) {
    const amount = Number(commandMatch[2].replace(/,/g, ''));
    const type = commandMatch[1].toUpperCase();
    return {
      amountCfa: amount,
      type,
      replyText: `WandaTax Shield\n\nRecorded ${type.toLowerCase()}: ${amount} CFA.`
    };
  }

  return {
    replyText: 'Welcome back. Send a MoMo SMS, or type "income 12000" / "expense 3500".'
  };
}
