const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

// ТОКЕН ТВОЕГО БОТА (не меняй)
const TOKEN = '8752139780:AAEIbtDqq2F3FJ2TqFWcINLWg6Zml8UyAQI';

// АДРЕС ТВОЕГО СЕРВЕРА (не меняй)
const SERVER_URL = 'https://vkusovshina-server.onrender.com';

// Создаём бота
const bot = new TelegramBot(TOKEN, { polling: true });

// Обработка нажатия на кнопку "Подтвердить заказ"
bot.on('callback_query', async (callbackQuery) => {
    const data = callbackQuery.data; // например, "confirm_abc123"
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;

    if (data.startsWith('confirm_')) {
        // Извлекаем ID заказа
        const orderId = data.replace('confirm_', '');

        try {
            // Отправляем запрос на сервер, чтобы подтвердить заказ
            const response = await axios.post(`${SERVER_URL}/orders/confirm`, { id: orderId });

            if (response.status === 200) {
                // Меняем текст сообщения в Telegram
                await bot.editMessageText(
                    `✅ Заказ #${orderId} подтверждён!`,
                    { chat_id: chatId, message_id: messageId }
                );
                // Показываем всплывающее уведомление
                await bot.answerCallbackQuery(callbackQuery.id, { text: 'Заказ подтверждён!' });
            } else {
                await bot.answerCallbackQuery(callbackQuery.id, { text: 'Ошибка подтверждения', show_alert: true });
            }
        } catch (error) {
            console.error('Ошибка:', error);
            await bot.answerCallbackQuery(callbackQuery.id, { text: 'Сервер недоступен', show_alert: true });
        }
    }
});

console.log('🤖 Бот запущен и слушает кнопки...');
