export async function parseMessage(message) {
  const text = message.text?.body || "";
  
  // REGEX: Detects amounts in MoMo or Orange Money SMS
  const momoRegex = /(?:Confirmed|Transfer of|received)\s?([\d,.]+)\s?FCFA/i;
  const match = text.match(momoRegex);

  if (match) {
    const amount = match[1].replace(/,/g, '');
    const type = text.toLowerCase().includes('received') ? 'Income' : 'Expense';
    return {
      amount: amount,
      type: type,
      replyText: `🛡️ *WandaTax Shield*\n\nDetected ${type}: *${amount} CFA*.\nSuccessfully logged to your audit-ready ledger.`
    };
  }

  return { replyText: "Welcome back! Forward a MoMo SMS or type an amount to log a sale." };
}
