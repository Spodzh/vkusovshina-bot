const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const TOKEN = '8752139780:AAEIbtDqq2F3FJ2TqFWcINLWg6Zml8UyAQI';
const SERVER_URL = 'https://vkusovshina-server.onrender.com';

const bot = new TelegramBot(TOKEN, { polling: true });

console.log('Бот запущен и слушает...');

// Главная клавиатура (всегда снизу)
const mainKeyboard = {
    keyboard: [
        ['📋 Меню', '➕ Добавить блюдо'],
        ['🗑️ Удалить блюдо', '🔄 Открыть/Закрыть'],
        ['📊 Статус', '❓ Помощь']
    ],
    resize_keyboard: true,
    one_time_keyboard: false
};

// Отправка главного меню с клавиатурой
function sendMainMenu(chatId, text) {
    bot.sendMessage(chatId, text || '🏠 <b>Главное меню</b>\nВыберите действие:', {
        parse_mode: 'HTML',
        reply_markup: mainKeyboard
    });
}

// Команда /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    sendMainMenu(chatId, '👋 <b>Добро пожаловать в бот управления рестораном!</b>');
});

// Команда /help
bot.onText(/\/help/, (msg) => {
    sendMainMenu(msg.chat.id, '❓ <b>Справка</b>\nВсе действия доступны через кнопки ниже.');
});

// Обработка текстовых сообщений
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    // Игнорируем команды
    if (text && text.startsWith('/')) return;

    // Если сообщение содержит '|' — пытаемся добавить блюдо
    if (text && text.includes('|')) {
        const parts = text.split('|').map(s => s.trim());
        if (parts.length === 4) {
            const [name, emoji, price, desc] = parts;
            try {
                const response = await axios.get(`${SERVER_URL}/menu`);
                const menu = response.data;
                if (menu.some(item => item.name.toLowerCase() === name.toLowerCase())) {
                    bot.sendMessage(chatId, `⚠️ Блюдо "${name}" уже существует.`, { reply_markup: mainKeyboard });
                    return;
                }
                menu.push({ name, emoji, price, desc });
                await axios.post(`${SERVER_URL}/admin/menu`, { menu });
                bot.sendMessage(chatId, `✅ Блюдо "${name}" добавлено!`, { reply_markup: mainKeyboard });
            } catch (e) {
                console.error('Ошибка добавления:', e);
                bot.sendMessage(chatId, '❌ Ошибка добавления блюда.', { reply_markup: mainKeyboard });
            }
            return;
        } else {
            bot.sendMessage(chatId, '⚠️ Неверный формат. Используйте: Название | Эмодзи | Цена | Описание', {
                reply_markup: mainKeyboard
            });
            return;
        }
    }

    // Обработка кнопок
    switch (text) {
        case '📋 Меню':
            try {
                const response = await axios.get(`${SERVER_URL}/menu`);
                const menu = response.data;
                if (menu.length === 0) {
                    bot.sendMessage(chatId, '📋 Меню пусто.', { reply_markup: mainKeyboard });
                } else {
                    let menuText = '📋 <b>Меню:</b>\n\n';
                    menu.forEach((item, i) => {
                        menuText += `${i+1}. ${item.emoji} <b>${item.name}</b> — ${item.price}\n   ${item.desc || ''}\n`;
                    });
                    bot.sendMessage(chatId, menuText, { parse_mode: 'HTML', reply_markup: mainKeyboard });
                }
            } catch (e) {
                bot.sendMessage(chatId, '❌ Ошибка загрузки меню.', { reply_markup: mainKeyboard });
            }
            break;

        case '➕ Добавить блюдо':
            bot.sendMessage(chatId, '✏️ Отправьте блюдо в формате:\n<code>Название | Эмодзи | Цена | Описание</code>', {
                parse_mode: 'HTML',
                reply_markup: mainKeyboard
            });
            break;

        case '🗑️ Удалить блюдо':
            try {
                const response = await axios.get(`${SERVER_URL}/menu`);
                const menu = response.data;
                if (menu.length === 0) {
                    bot.sendMessage(chatId, '📋 Меню пусто.', { reply_markup: mainKeyboard });
                } else {
                    const buttons = menu.map((item, index) => ([
                        { text: `${item.emoji} ${item.name}`, callback_data: `remove_${index}` }
                    ]));
                    buttons.push([{ text: '❌ Отмена', callback_data: 'remove_cancel' }]);
                    bot.sendMessage(chatId, '🗑️ Выберите блюдо для удаления:', {
                        reply_markup: { inline_keyboard: buttons }
                    });
                }
            } catch (e) {
                bot.sendMessage(chatId, '❌ Ошибка загрузки меню.', { reply_markup: mainKeyboard });
            }
            break;

        case '🔄 Открыть/Закрыть':
            try {
                const statusRes = await axios.get(`${SERVER_URL}/status`);
                const newStatus = !statusRes.data.isOpen;
                await axios.post(`${SERVER_URL}/admin/status`, { isOpen: newStatus });
                bot.sendMessage(chatId, `✅ Ресторан теперь ${newStatus ? 'ОТКРЫТ' : 'ЗАКРЫТ'}`, {
                    reply_markup: mainKeyboard
                });
            } catch (e) {
                bot.sendMessage(chatId, '❌ Ошибка изменения статуса.', { reply_markup: mainKeyboard });
            }
            break;

        case '📊 Статус':
            try {
                const response = await axios.get(`${SERVER_URL}/status`);
                const isOpen = response.data.isOpen;
                bot.sendMessage(chatId, `📊 Статус: ${isOpen ? '🟢 ОТКРЫТ' : '🔴 ЗАКРЫТ'}`, {
                    reply_markup: mainKeyboard
                });
            } catch (e) {
                bot.sendMessage(chatId, '❌ Ошибка получения статуса.', { reply_markup: mainKeyboard });
            }
            break;

        case '❓ Помощь':
            bot.sendMessage(chatId, '🤖 <b>Помощь</b>\n\nКнопки снизу управляют рестораном.\nДобавление блюда: введите название, эмодзи, цену и описание через "|".', {
                parse_mode: 'HTML',
                reply_markup: mainKeyboard
            });
            break;

        default:
            // Если текст не распознан
            bot.sendMessage(chatId, 'ℹ️ Используйте кнопки снизу.', { reply_markup: mainKeyboard });
    }
});

// Обработка инлайн-кнопок (удаление блюда, подтверждение заказа)
bot.on('callback_query', async (callbackQuery) => {
    const data = callbackQuery.data;
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;

    if (data.startsWith('remove_')) {
        const index = parseInt(data.replace('remove_', ''));
        try {
            const response = await axios.get(`${SERVER_URL}/menu`);
            const menu = response.data;
            if (index >= menu.length) {
                await bot.answerCallbackQuery(callbackQuery.id, { text: 'Блюдо не найдено' });
                return;
            }
            const removed = menu.splice(index, 1)[0];
            await axios.post(`${SERVER_URL}/admin/menu`, { menu });
            await bot.editMessageText(`✅ Блюдо "${removed.name}" удалено!`, {
                chat_id: chatId,
                message_id: messageId
            });
            await bot.answerCallbackQuery(callbackQuery.id, { text: 'Удалено!' });
            // Показываем главное меню с клавиатурой
            sendMainMenu(chatId, '🏠 Главное меню');
        } catch (e) {
            await bot.editMessageText('❌ Ошибка удаления', { chat_id: chatId, message_id: messageId });
            await bot.answerCallbackQuery(callbackQuery.id, { text: 'Ошибка', show_alert: true });
        }
        return;
    }

    if (data === 'remove_cancel') {
        await bot.editMessageText('❌ Отменено', { chat_id: chatId, message_id: messageId });
        await bot.answerCallbackQuery(callbackQuery.id);
        sendMainMenu(chatId, '🏠 Главное меню');
        return;
    }

    if (data.startsWith('confirm_')) {
        const orderId = data.replace('confirm_', '');
        try {
            await axios.post(`${SERVER_URL}/orders/confirm`, { id: orderId });
            await bot.editMessageText(`✅ Заказ #${orderId} подтверждён!`, {
                chat_id: chatId,
                message_id: messageId
            });
            await bot.answerCallbackQuery(callbackQuery.id, { text: 'Подтверждено!' });
        } catch (e) {
            await bot.answerCallbackQuery(callbackQuery.id, { text: 'Ошибка', show_alert: true });
        }
        return;
    }
});

console.log('Бот готов, клавиатура настроена.');
