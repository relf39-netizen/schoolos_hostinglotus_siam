
export const sendTelegramMessage = async (botToken?: string, chatId?: string, message?: string, options?: any) => {
  if (!botToken || !chatId || !message) {
    console.warn('Telegram notification skipped: Missing botToken, chatId, or message');
    return false;
  }

  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
        reply_markup: options ? {
          inline_keyboard: [[{ text: 'เปิดดูเอกสาร', url: options }]]
        } : undefined
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Telegram API Error:', errorData);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Telegram Network Error:', error);
    return false;
  }
};
