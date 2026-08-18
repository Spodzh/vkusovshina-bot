const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const TOKEN = '8752139780:AAEIbtDqq2F3FJ2TqFWcINLWg6Zml8UyAQI';
const SERVER_URL = 'https://vkusovshina-server.onrender.com';

const bot = new TelegramBot(TOKEN, { polling: true });

// ===== ГЛАВНОЕ МЕНЮ (кнопки) =====
function getMainKeyboard() {
    return {
        inline_keyboard: [
            [
                { text: '📋 Меню', callback_data: 'show_menu' },
                { text: '➕ Добавить блюдо', callback_data: 'add_dish' }
            ],
            [
                { text: '🗑️ Удалить блюдо', callback_data: 'remove_dish' },
                { text: '🔄 Открыть/Закрыть', callback_data: 'toggle_status' }
            ],
            [
                { text: '📊 Статус', callback_data: 'show_status' },
                { text: '❓ Помощь', callback_data: 'show_help' }
            ]
        ]
    };
}

// ===== ОТПРАВКА ГЛАВНОГО МЕНЮ =====
function sendMainMenu(chatId, text = '🏠 <b>Главное меню</b>\nВыберите действие:') {
    bot.sendMessage(chatId, text, {
        parse_mode: 'HTML',
        reply_markup: getMainKeyboard()
    });
}

// ===== КОМАНДА /start =====
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    sendMainMenu(chatId, '👋 <b>Добро пожаловать в бот управления рестораном!</b>\nВыберите действие:');
});

// ===== КОМАНДА /help (тоже вызывает главное меню) =====
bot.onText(/\/help/, (msg) => {
    sendMainMenu(msg.chat.id, '❓ <b>Справка</b>\nВсе команды доступны через кнопки ниже.');
});

// ===== ОБРАБОТЧИК ВСЕХ КНОПОК =====
bot.on('callback_query', async (callbackQuery) => {
    const data = callbackQuery.data;
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;

    // ===== 1. ПОКАЗАТЬ МЕНЮ =====
    if (data === 'show_menu') {
        try {
            const response = await axios.get(`${SERVER_URL}/menu`);
            const menu = response.data;
            if (menu.length === 0) {
                await bot.editMessageText('📋 <b>Меню пусто</b>\nДобавьте блюда через кнопку "➕ Добавить блюдо".', {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [[{ text: '🔙 Назад', callback_data: 'back_to_main' }]]
                    }
                });
            } else {
                let text = '📋 <b>Текущее меню:</b>\n\n';
                menu.forEach((item, i) => {
                    text += `${i+1}. ${item.emoji} <b>${item.name}</b> — ${item.price}\n   ${item.desc || ''}\n`;
                });
                await bot.editMessageText(text, {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [[{ text: '🔙 Назад', callback_data: 'back_to_main' }]]
                    }
                });
            }
        } catch (e) {
            await bot.editMessageText('❌ Ошибка загрузки меню', {
                chat_id: chatId,
                message_id: messageId,
                reply_markup: { inline_keyboard: [[{ text: '🔙 Назад', callback_data: 'back_to_main' }]] }
            });
        }
        await bot.answerCallbackQuery(callbackQuery.id);
        return;
    }

    // ===== 2. ДОБАВИТЬ БЛЮДО (запрос данных) =====
    if (data === 'add_dish') {
        await bot.editMessageText(
            '✏️ <b>Добавление блюда</b>\n\nОтправьте блюдо в формате:\n\n<code>Название | Эмодзи | Цена | Описание</code>\n\nПример:\n<code>Пицца | 🍕 | 500 коп. | Вкусная пицца</code>\n\nДля отмены нажмите "Отмена".',
            {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [[{ text: '❌ Отмена', callback_data: 'back_to_main' }]]
                }
            }
        );
        // Сохраняем состояние, что пользователь в режиме добавления
        // (будем обрабатывать следующее текстовое сообщение)
        // Для простоты – будем ждать текст, который не начинается с '/'
        await bot.answerCallbackQuery(callbackQuery.id);
        return;
    }

    // ===== 3. УДАЛИТЬ БЛЮДО (показать список с кнопками) =====
    if (data === 'remove_dish') {
        try {
            const response = await axios.get(`${SERVER_URL}/menu`);
            const menu = response.data;
            if (menu.length === 0) {
                await bot.editMessageText('📋 Меню пусто, удалять нечего.', {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: {
                        inline_keyboard: [[{ text: '🔙 Назад', callback_data: 'back_to_main' }]]
                    }
                });
            } else {
                const buttons = menu.map((item, index) => [
                    { text: `${item.emoji} ${item.name}`, callback_data: `remove_${index}` }
                ]);
                buttons.push([{ text: '❌ Отмена', callback_data: 'back_to_main' }]);
                await bot.editMessageText('🗑️ <b>Выберите блюдо для удаления:</b>', {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'HTML',
                    reply_markup: { inline_keyboard: buttons }
                });
            }
        } catch (e) {
            await bot.editMessageText('❌ Ошибка загрузки меню', {
                chat_id: chatId,
                message_id: messageId,
                reply_markup: { inline_keyboard: [[{ text: '🔙 Назад', callback_data: 'back_to_main' }]] }
            });
        }
        await bot.answerCallbackQuery(callbackQuery.id);
        return;
    }

    // ===== 4. ПЕРЕКЛЮЧИТЬ СТАТУС =====
    if (data === 'toggle_status') {
        try {
            const statusRes = await axios.get(`${SERVER_URL}/status`);
            const currentStatus = statusRes.data.isOpen;
            const newStatus = !currentStatus;
            await axios.post(`${SERVER_URL}/admin/status`, { isOpen: newStatus });
            const statusText = newStatus ? '🟢 ОТКРЫТ' : '🔴 ЗАКРЫТ';
            await bot.editMessageText(`✅ Статус ресторана изменён на <b>${statusText}</b>`, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [[{ text: '🔙 Назад', callback_data: 'back_to_main' }]]
                }
            });
        } catch (e) {
            await bot.editMessageText('❌ Ошибка изменения статуса', {
                chat_id: chatId,
                message_id: messageId,
                reply_markup: { inline_keyboard: [[{ text: '🔙 Назад', callback_data: 'back_to_main' }]] }
            });
        }
        await bot.answerCallbackQuery(callbackQuery.id);
        return;
    }

    // ===== 5. ПОКАЗАТЬ СТАТУС =====
    if (data === 'show_status') {
        try {
            const response = await axios.get(`${SERVER_URL}/status`);
            const isOpen = response.data.isOpen;
            const statusText = isOpen ? '🟢 <b>Открыт</b>' : '🔴 <b>Закрыт</b>';
            await bot.editMessageText(`📊 <b>Текущий статус ресторана:</b>\n${statusText}`, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [[{ text: '🔙 Назад', callback_data: 'back_to_main' }]]
                }
            });
        } catch (e) {
            await bot.editMessageText('❌ Ошибка получения статуса', {
                chat_id: chatId,
                message_id: messageId,
                reply_markup: { inline_keyboard: [[{ text: '🔙 Назад', callback_data: 'back_to_main' }]] }
            });
        }
        await bot.answerCallbackQuery(callbackQuery.id);
        return;
    }

    // ===== 6. ПОМОЩЬ =====
    if (data === 'show_help') {
        const helpText = `
🤖 <b>Управление рестораном через бота</b>

<b>Доступные действия:</b>
• 📋 Меню – посмотреть текущее меню
• ➕ Добавить блюдо – добавить новое блюдо
• 🗑️ Удалить блюдо – удалить существующее
• 🔄 Открыть/Закрыть – переключить статус ресторана
• 📊 Статус – узнать текущий статус

<b>Добавление блюда:</b>
Отправьте сообщение в формате:
<code>Название | Эмодзи | Цена | Описание</code>

<b>Подтверждение заказов:</b>
При поступлении заказа приходит кнопка "Подтвердить заказ".

<b>Сайт ресторана:</b>
https://ваш-сайт
        `;
        await bot.editMessageText(helpText, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [[{ text: '🔙 Назад', callback_data: 'back_to_main' }]]
            }
        });
        await bot.answerCallbackQuery(callbackQuery.id);
        return;
    }

    // ===== 7. НАЗАД В ГЛАВНОЕ МЕНЮ =====
    if (data === 'back_to_main') {
        await bot.editMessageText('🏠 <b>Главное меню</b>\nВыберите действие:', {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'HTML',
            reply_markup: getMainKeyboard()
        });
        await bot.answerCallbackQuery(callbackQuery.id);
        return;
    }

    // ===== 8. УДАЛЕНИЕ КОНКРЕТНОГО БЛЮДА (по индексу) =====
    if (data.startsWith('remove_')) {
        const index = parseInt(data.replace('remove_', ''));
        if (isNaN(index) || index < 0) {
            await bot.answerCallbackQuery(callbackQuery.id, { text: 'Ошибка' });
            return;
        }

        try {
            const response = await axios.get(`${SERVER_URL}/menu`);
            const menu = response.data;
            if (index >= menu.length) {
                await bot.answerCallbackQuery(callbackQuery.id, { text: 'Блюдо не найдено' });
                return;
            }
            const removed = menu.splice(index, 1)[0];
            await axios.post(`${SERVER_URL}/admin/menu`, { menu });
            await bot.editMessageText(`✅ Блюдо "<b>${removed.name}</b>" удалено!`, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [[{ text: '🔙 Назад', callback_data: 'back_to_main' }]]
                }
            });
            await bot.answerCallbackQuery(callbackQuery.id, { text: 'Блюдо удалено!' });
        } catch (e) {
            console.error(e);
            await bot.editMessageText('❌ Ошибка удаления блюда', {
                chat_id: chatId,
                message_id: messageId,
                reply_markup: { inline_keyboard: [[{ text: '🔙 Назад', callback_data: 'back_to_main' }]] }
            });
            await bot.answerCallbackQuery(callbackQuery.id, { text: 'Ошибка', show_alert: true });
        }
        return;
    }

    // ===== 9. ПОДТВЕРЖДЕНИЕ ЗАКАЗА (из сообщения) =====
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
        return;
    }

    // Если ничего не подошло
    await bot.answerCallbackQuery(callbackQuery.id);
});

// ===== ОБРАБОТКА ТЕКСТОВЫХ СООБЩЕНИЙ (для добавления блюда) =====
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    // Игнорируем команды и пустые сообщения
    if (!text || text.startsWith('/')) return;

    // Проверяем, содержит ли сообщение '|' – значит это попытка добавить блюдо
    if (text.includes('|')) {
        const parts = text.split('|').map(s => s.trim());
        if (parts.length === 4) {
            const [name, emoji, price, desc] = parts;
            // Проверяем, что эмодзи – это один символ (или несколько), но для простоты пропускаем
            try {
                const response = await axios.get(`${SERVER_URL}/menu`);
                const menu = response.data;
                // Проверяем, нет ли уже такого блюда (по названию)
                if (menu.some(item => item.name.toLowerCase() === name.toLowerCase())) {
                    bot.sendMessage(chatId, `⚠️ Блюдо "${name}" уже существует. Используйте другое название.`);
                    return;
                }
                menu.push({ name, emoji, price, desc });
                await axios.post(`${SERVER_URL}/admin/menu`, { menu });
                bot.sendMessage(chatId, `✅ Блюдо "${name}" добавлено!`);
                // После добавления возвращаем главное меню
                sendMainMenu(chatId, '🏠 <b>Главное меню</b>\nВыберите действие:');
            } catch (e) {
                console.error(e);
                bot.sendMessage(chatId, '❌ Ошибка добавления блюда. Попробуйте позже.');
            }
        } else {
            bot.sendMessage(chatId, '⚠️ Неверный формат. Используйте:\n<code>Название | Эмодзи | Цена | Описание</code>\n\nПример:\n<code>Пицца | 🍕 | 500 коп. | Вкусная пицца</code>', { parse_mode: 'HTML' });
        }
    } else {
        // Если текст не содержит '|', просто напоминаем, что нужно для добавления
        bot.sendMessage(chatId, 'ℹ️ Чтобы добавить блюдо, используйте формат:\n<code>Название | Эмодзи | Цена | Описание</code>\n\nИли выберите действие через кнопки.', { parse_mode: 'HTML' });
    }
});

// ===== ПРИВЕТСТВИЕ ПРИ ЗАПУСКЕ =====
console.log('🤖 Бот запущен и слушает кнопки...');
