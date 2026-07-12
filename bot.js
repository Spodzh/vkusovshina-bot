const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const express = require('express');

// ТОКЕН ТВОЕГО БОТА
const TOKEN = '8752139780:AAEIbtDqq2F3FJ2TqFWcINLWg6Zml8UyAQI';

// АДРЕС ТВОЕГО СЕРВЕРА
const SERVER_URL = 'https://vkusovshina-server.onrender.com';

// Создаём бота
const bot = new TelegramBot(TOKEN, { polling: true });

// Обработка нажатия на кнопку "Подтвердить заказ"
bot.on('callback_query', async (callbackQuery) => {
    const data = callbackQuery.data;
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;

    if (data.startsWith('confirm_')) {
        const orderId = data.replace('confirm_', '');
        try {
            const response = await axios.post(`${SERVER_URL}/orders/confirm`, { id: orderId });
            if (response.status === 200) {
                await bot.editMessageText(
                    `✅ Заказ #${orderId} подтверждён!`,
                    { chat_id: chatId, message_id: messageId }
                );
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

// ===== МИНИМАЛЬНЫЙ ВЕБ-СЕРВЕР ДЛЯ RENDER =====
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Бот Вкусовщины работает');
});

app.listen(port, () => {
    console.log(`✅ Веб-сервер для Render запущен на порту ${port}`);
});
