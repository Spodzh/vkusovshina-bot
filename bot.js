const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const TOKEN = '8752139780:AAEIbtDqq2F3FJ2TqFWcINLWg6Zml8UyAQI';
const SERVER_URL = 'https://vkusovshina-server.onrender.com';

const bot = new TelegramBot(TOKEN, { polling: true });

// ===== КОМАНДЫ ДЛЯ УПРАВЛЕНИЯ =====

// Команда /status – показать статус ресторана
bot.onText(/\/status/, async (msg) => {
    const chatId = msg.chat.id;
    try {
        const response = await axios.get(`${SERVER_URL}/status`);
        const isOpen = response.data.isOpen;
        const statusText = isOpen ? '🟢 Открыт' : '🔴 Закрыт';
        bot.sendMessage(chatId, `Статус ресторана: ${statusText}`);
    } catch (e) {
        bot.sendMessage(chatId, '❌ Не удалось получить статус');
    }
});

// Команда /menu – показать текущее меню
bot.onText(/\/menu/, async (msg) => {
    const chatId = msg.chat.id;
    try {
        const response = await axios.get(`${SERVER_URL}/menu`);
        const menu = response.data;
        if (menu.length === 0) {
            bot.sendMessage(chatId, '📋 Меню пусто');
            return;
        }
        let text = '📋 Текущее меню:\n\n';
        menu.forEach((item, i) => {
            text += `${i+1}. ${item.emoji} ${item.name} — ${item.price}\n`;
        });
        bot.sendMessage(chatId, text);
    } catch (e) {
        bot.sendMessage(chatId, '❌ Не удалось загрузить меню');
    }
});

// Команда /add – добавить блюдо (бот спросит данные)
bot.onText(/\/add/, async (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, '✏️ Введите новое блюдо в формате:\n\n`Название | Эмодзи | Цена | Описание`\n\nПример: `Пицца | 🍕 | 500 коп. | Вкусная пицца с сыром`', { parse_mode: 'Markdown' });
});

// Обработка текстовых сообщений (для добавления блюда)
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    // Проверяем, не является ли сообщение командой
    if (text && text.startsWith('/')) return;

    // Проверяем формат добавления блюда (содержит '|')
    if (text && text.includes('|')) {
        const parts = text.split('|').map(s => s.trim());
        if (parts.length === 4) {
            const [name, emoji, price, desc] = parts;
            // Проверяем, что эмодзи – это один символ (или несколько)
            // Добавляем блюдо
            try {
                const response = await axios.get(`${SERVER_URL}/menu`);
                const menu = response.data;
                menu.push({ name, emoji, price, desc });
                await axios.post(`${SERVER_URL}/admin/menu`, { menu });
                bot.sendMessage(chatId, `✅ Блюдо "${name}" добавлено!`);
            } catch (e) {
                bot.sendMessage(chatId, '❌ Ошибка добавления блюда');
                console.error(e);
            }
        } else {
            bot.sendMessage(chatId, '⚠️ Неверный формат. Используйте:\n`Название | Эмодзи | Цена | Описание`', { parse_mode: 'Markdown' });
        }
    }
});

// Команда /remove – удалить блюдо (бот покажет список с кнопками)
bot.onText(/\/remove/, async (msg) => {
    const chatId = msg.chat.id;
    try {
        const response = await axios.get(`${SERVER_URL}/menu`);
        const menu = response.data;
        if (menu.length === 0) {
            bot.sendMessage(chatId, '📋 Меню пусто, удалять нечего');
            return;
        }
        // Создаём клавиатуру с кнопками для каждого блюда
        const buttons = menu.map((item, index) => [
            { text: `${item.emoji} ${item.name}`, callback_data: `remove_${index}` }
        ]);
        // Добавляем кнопку "Отмена"
        buttons.push([{ text: '❌ Отмена', callback_data: 'remove_cancel' }]);

        const inlineKeyboard = {
            inline_keyboard: buttons
        };

        bot.sendMessage(chatId, '🗑️ Выберите блюдо для удаления:', { reply_markup: inlineKeyboard });
    } catch (e) {
        bot.sendMessage(chatId, '❌ Не удалось загрузить меню');
    }
});

// Обработка нажатий на кнопки (удаление, подтверждение заказа)
bot.on('callback_query', async (callbackQuery) => {
    const data = callbackQuery.data;
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;

    // ===== УДАЛЕНИЕ БЛЮДА =====
    if (data.startsWith('remove_')) {
        const index = parseInt(data.replace('remove_', ''));
        if (isNaN(index) || index < 0) {
            await bot.answerCallbackQuery(callbackQuery.id, { text: 'Ошибка' });
            return;
        }

        // Получаем меню
        try {
            const response = await axios.get(`${SERVER_URL}/menu`);
            const menu = response.data;
            if (index >= menu.length) {
                await bot.answerCallbackQuery(callbackQuery.id, { text: 'Блюдо не найдено' });
                return;
            }
            const removed = menu.splice(index, 1)[0];
            await axios.post(`${SERVER_URL}/admin/menu`, { menu });
            // Обновляем сообщение
            await bot.editMessageText(`✅ Блюдо "${removed.name}" удалено!`, { chat_id: chatId, message_id: messageId });
            await bot.answerCallbackQuery(callbackQuery.id, { text: 'Блюдо удалено!' });
        } catch (e) {
            console.error(e);
            await bot.answerCallbackQuery(callbackQuery.id, { text: 'Ошибка', show_alert: true });
        }
        return;
    }

    if (data === 'remove_cancel') {
        await bot.editMessageText('❌ Удаление отменено', { chat_id: chatId, message_id: messageId });
        await bot.answerCallbackQuery(callbackQuery.id);
        return;
    }

    // ===== ПОДТВЕРЖДЕНИЕ ЗАКАЗА =====
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
            console.error(error);
            await bot.answerCallbackQuery(callbackQuery.id, { text: 'Сервер недоступен', show_alert: true });
        }
    }
});

// ===== КНОПКА ОТКРЫТЬ/ЗАКРЫТЬ РЕСТОРАН =====
// Создаём инлайн-кнопку для переключения статуса
bot.onText(/\/toggle/, async (msg) => {
    const chatId = msg.chat.id;
    try {
        const statusRes = await axios.get(`${SERVER_URL}/status`);
        const currentStatus = statusRes.data.isOpen;
        const newStatus = !currentStatus;
        await axios.post(`${SERVER_URL}/admin/status`, { isOpen: newStatus });
        const statusText = newStatus ? '🟢 ОТКРЫТ' : '🔴 ЗАКРЫТ';
        bot.sendMessage(chatId, `✅ Ресторан теперь ${statusText}`);
    } catch (e) {
        bot.sendMessage(chatId, '❌ Ошибка переключения статуса');
        console.error(e);
    }
});

// Команда /help – список всех команд
bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    const text = `🤖 <b>Команды бота:</b>
/status — показать статус ресторана
/toggle — открыть/закрыть ресторан
/menu — показать текущее меню
/add — добавить блюдо
/remove — удалить блюдо
/help — эта справка

<b>Добавление блюда:</b>
Напишите: Название | Эмодзи | Цена | Описание
Пример: Пицца | 🍕 | 500 коп. | Вкусная пицца`;
    bot.sendMessage(chatId, text, { parse_mode: 'HTML' });
});

console.log('🤖 Бот запущен и слушает команды...');
