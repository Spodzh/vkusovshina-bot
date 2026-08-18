const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const TOKEN = '8752139780:AAEIbtDqq2F3FJ2TqFWcINLWg6Zml8UyAQI';
const SERVER_URL = 'https://vkusovshina-server.onrender.com';

const bot = new TelegramBot(TOKEN, { polling: true });

// ===== ПОСТОЯННАЯ КЛАВИАТУРА СНИЗУ =====
function getMainKeyboard() {
    return {
        keyboard: [
            ['📋 Меню', '➕ Добавить блюдо'],
            ['🗑️ Удалить блюдо', '🔄 Открыть/Закрыть'],
            ['📊 Статус', '❓ Помощь']
        ],
        resize_keyboard: true,
        one_time_keyboard: false
    };
}

// ===== СОСТОЯНИЯ ДЛЯ ПОШАГОВОГО ДОБАВЛЕНИЯ =====
// Временное хранилище данных пользователя (в памяти)
const userStates = {};

function getMainMenuText() {
    return '🏠 <b>Главное меню</b>\nВыберите действие:';
}

function sendMainMenu(chatId, text = getMainMenuText()) {
    bot.sendMessage(chatId, text, {
        parse_mode: 'HTML',
        reply_markup: getMainKeyboard()
    });
}

// ===== /start =====
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    // Очищаем состояние пользователя при старте
    delete userStates[chatId];
    sendMainMenu(chatId, '👋 <b>Добро пожаловать в бот управления рестораном!</b>\nВыберите действие:');
});

// ===== /help =====
bot.onText(/\/help/, (msg) => {
    sendMainMenu(msg.chat.id, '❓ <b>Справка</b>\nВсе действия доступны через кнопки ниже.');
});

// ===== ОБРАБОТЧИК ВСЕХ СООБЩЕНИЙ =====
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (!text || text.startsWith('/')) return;

    // ===== ЕСЛИ ПОЛЬЗОВАТЕЛЬ В ПРОЦЕССЕ ДОБАВЛЕНИЯ БЛЮДА =====
    if (userStates[chatId] && userStates[chatId].step) {
        await handleAddDishStep(chatId, text);
        return;
    }

    // ===== ОБЫЧНЫЕ КОМАНДЫ (кнопки) =====

    // 1. Меню
    if (text === '📋 Меню') {
        try {
            const response = await axios.get(`${SERVER_URL}/menu`);
            const menu = response.data;
            if (menu.length === 0) {
                bot.sendMessage(chatId, '📋 <b>Меню пусто</b>\nДобавьте блюда через "➕ Добавить блюдо".', {
                    parse_mode: 'HTML',
                    reply_markup: getMainKeyboard()
                });
            } else {
                let menuText = '📋 <b>Текущее меню:</b>\n\n';
                menu.forEach((item, i) => {
                    menuText += `${i+1}. ${item.emoji} <b>${item.name}</b> — ${item.price}\n   ${item.desc || ''}\n`;
                });
                bot.sendMessage(chatId, menuText, {
                    parse_mode: 'HTML',
                    reply_markup: getMainKeyboard()
                });
            }
        } catch (e) {
            bot.sendMessage(chatId, '❌ Ошибка загрузки меню', { reply_markup: getMainKeyboard() });
        }
        return;
    }

    // 2. Добавить блюдо (начало процесса)
    if (text === '➕ Добавить блюдо') {
        // Инициализируем состояние
        userStates[chatId] = { step: 'name' };
        bot.sendMessage(chatId, '✏️ <b>Шаг 1 из 4: Введите название блюда</b>\n\nНапример: Пицца "Маргарита"', {
            parse_mode: 'HTML',
            reply_markup: {
                keyboard: [['❌ Отмена']],
                resize_keyboard: true,
                one_time_keyboard: true
            }
        });
        return;
    }

    // 3. Удалить блюдо
    if (text === '🗑️ Удалить блюдо') {
        try {
            const response = await axios.get(`${SERVER_URL}/menu`);
            const menu = response.data;
            if (menu.length === 0) {
                bot.sendMessage(chatId, '📋 Меню пусто, удалять нечего.', { reply_markup: getMainKeyboard() });
            } else {
                const buttons = menu.map((item, index) => [
                    { text: `${item.emoji} ${item.name}`, callback_data: `remove_${index}` }
                ]);
                buttons.push([{ text: '❌ Отмена', callback_data: 'remove_cancel' }]);
                bot.sendMessage(chatId, '🗑️ <b>Выберите блюдо для удаления:</b>', {
                    parse_mode: 'HTML',
                    reply_markup: { inline_keyboard: buttons }
                });
            }
        } catch (e) {
            bot.sendMessage(chatId, '❌ Ошибка загрузки меню', { reply_markup: getMainKeyboard() });
        }
        return;
    }

    // 4. Переключить статус
    if (text === '🔄 Открыть/Закрыть') {
        try {
            const statusRes = await axios.get(`${SERVER_URL}/status`);
            const currentStatus = statusRes.data.isOpen;
            const newStatus = !currentStatus;
            await axios.post(`${SERVER_URL}/admin/status`, { isOpen: newStatus });
            const statusText = newStatus ? '🟢 ОТКРЫТ' : '🔴 ЗАКРЫТ';
            bot.sendMessage(chatId, `✅ Статус ресторана изменён на <b>${statusText}</b>`, {
                parse_mode: 'HTML',
                reply_markup: getMainKeyboard()
            });
        } catch (e) {
            bot.sendMessage(chatId, '❌ Ошибка изменения статуса', { reply_markup: getMainKeyboard() });
        }
        return;
    }

    // 5. Статус
    if (text === '📊 Статус') {
        try {
            const response = await axios.get(`${SERVER_URL}/status`);
            const isOpen = response.data.isOpen;
            const statusText = isOpen ? '🟢 <b>Открыт</b>' : '🔴 <b>Закрыт</b>';
            bot.sendMessage(chatId, `📊 <b>Текущий статус ресторана:</b>\n${statusText}`, {
                parse_mode: 'HTML',
                reply_markup: getMainKeyboard()
            });
        } catch (e) {
            bot.sendMessage(chatId, '❌ Ошибка получения статуса', { reply_markup: getMainKeyboard() });
        }
        return;
    }

    // 6. Помощь
    if (text === '❓ Помощь') {
        const helpText = `
🤖 <b>Управление рестораном через бота</b>

<b>Доступные действия (кнопки снизу):</b>
• 📋 Меню – посмотреть текущее меню
• ➕ Добавить блюдо – добавить новое блюдо (пошагово)
• 🗑️ Удалить блюдо – удалить существующее
• 🔄 Открыть/Закрыть – переключить статус ресторана
• 📊 Статус – узнать текущий статус

<b>Добавление блюда:</b>
Нажмите "➕ Добавить блюдо" и следуйте инструкциям.

<b>Подтверждение заказов:</b>
При поступлении заказа приходит кнопка "Подтвердить заказ".

<b>Сайт ресторана:</b>
https://ваш-сайт
        `;
        bot.sendMessage(chatId, helpText, {
            parse_mode: 'HTML',
            reply_markup: getMainKeyboard()
        });
        return;
    }

    // 7. Отмена (если пользователь написал "Отмена" или "❌ Отмена")
    if (text === '❌ Отмена' || text === 'Отмена') {
        if (userStates[chatId]) {
            delete userStates[chatId];
            sendMainMenu(chatId, '❌ Добавление блюда отменено.\n' + getMainMenuText());
        } else {
            sendMainMenu(chatId);
        }
        return;
    }

    // Если сообщение не распознано
    sendMainMenu(chatId, 'ℹ️ Используйте кнопки снизу для управления.');
});

// ===== ПОШАГОВОЕ ДОБАВЛЕНИЕ БЛЮДА =====
async function handleAddDishStep(chatId, text) {
    const state = userStates[chatId];
    if (!state || !state.step) return;

    // Если пользователь ввел "Отмена" или "❌ Отмена"
    if (text === '❌ Отмена' || text === 'Отмена') {
        delete userStates[chatId];
        sendMainMenu(chatId, '❌ Добавление блюда отменено.\n' + getMainMenuText());
        return;
    }

    // Шаг 1: Название
    if (state.step === 'name') {
        state.name = text.trim();
        state.step = 'emoji';
        bot.sendMessage(chatId, '✏️ <b>Шаг 2 из 4: Введите эмодзи для блюда</b>\n\nНапример: 🍕', {
            parse_mode: 'HTML',
            reply_markup: {
                keyboard: [['❌ Отмена']],
                resize_keyboard: true,
                one_time_keyboard: true
            }
        });
        return;
    }

    // Шаг 2: Эмодзи
    if (state.step === 'emoji') {
        // Проверяем, что это похоже на эмодзи (содержит не-буквенный символ)
        const emojiRegex = /[\u{1F000}-\u{1FFFF}]|[\u{2600}-\u{27BF}]|[\u{FE00}-\u{FEFF}]/u;
        if (!emojiRegex.test(text)) {
            bot.sendMessage(chatId, '⚠️ Пожалуйста, введите эмодзи (например: 🍕, 🍣, 🍔). Попробуйте снова:', {
                parse_mode: 'HTML',
                reply_markup: {
                    keyboard: [['❌ Отмена']],
                    resize_keyboard: true,
                    one_time_keyboard: true
                }
            });
            return;
        }
        state.emoji = text.trim();
        state.step = 'price';
        bot.sendMessage(chatId, '✏️ <b>Шаг 3 из 4: Введите цену блюда</b>\n\nНапример: 500 коп. или 5 руб.', {
            parse_mode: 'HTML',
            reply_markup: {
                keyboard: [['❌ Отмена']],
                resize_keyboard: true,
                one_time_keyboard: true
            }
        });
        return;
    }

    // Шаг 3: Цена
    if (state.step === 'price') {
        state.price = text.trim();
        state.step = 'desc';
        bot.sendMessage(chatId, '✏️ <b>Шаг 4 из 4: Введите описание блюда</b>\n\nНапример: Вкусная пицца с сыром и томатами\n\nИли отправьте "—" чтобы пропустить.', {
            parse_mode: 'HTML',
            reply_markup: {
                keyboard: [['❌ Отмена']],
                resize_keyboard: true,
                one_time_keyboard: true
            }
        });
        return;
    }

    // Шаг 4: Описание (финальный шаг)
    if (state.step === 'desc') {
        const desc = text.trim() === '—' ? '' : text.trim();
        const { name, emoji, price } = state;

        try {
            const response = await axios.get(`${SERVER_URL}/menu`);
            const menu = response.data;

            // Проверяем, нет ли уже такого блюда
            if (menu.some(item => item.name.toLowerCase() === name.toLowerCase())) {
                bot.sendMessage(chatId, `⚠️ Блюдо "${name}" уже существует. Используйте другое название.`, {
                    reply_markup: {
                        keyboard: [['❌ Отмена']],
                        resize_keyboard: true,
                        one_time_keyboard: true
                    }
                });
                return;
            }

            menu.push({ name, emoji, price, desc });
            await axios.post(`${SERVER_URL}/admin/menu`, { menu });

            // Успешно добавлено
            delete userStates[chatId];
            bot.sendMessage(chatId, `✅ <b>Блюдо "${name}" добавлено!</b>\n\n${emoji} ${name}\n💰 ${price}\n📝 ${desc || 'Нет описания'}`, {
                parse_mode: 'HTML'
            });
            sendMainMenu(chatId);

        } catch (e) {
            console.error(e);
            bot.sendMessage(chatId, '❌ Ошибка добавления блюда. Попробуйте позже.', { reply_markup: getMainKeyboard() });
            delete userStates[chatId];
        }
    }
}

// ===== ОБРАБОТЧИК ИНЛАЙН-КНОПОК =====
bot.on('callback_query', async (callbackQuery) => {
    const data = callbackQuery.data;
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;

    // Удаление блюда
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
                parse_mode: 'HTML'
            });
            await bot.answerCallbackQuery(callbackQuery.id, { text: 'Блюдо удалено!' });
            sendMainMenu(chatId);
        } catch (e) {
            console.error(e);
            await bot.editMessageText('❌ Ошибка удаления блюда', { chat_id: chatId, message_id: messageId });
            await bot.answerCallbackQuery(callbackQuery.id, { text: 'Ошибка', show_alert: true });
            sendMainMenu(chatId);
        }
        return;
    }

    if (data === 'remove_cancel') {
        await bot.editMessageText('❌ Удаление отменено', { chat_id: chatId, message_id: messageId });
        await bot.answerCallbackQuery(callbackQuery.id);
        sendMainMenu(chatId);
        return;
    }

    // Подтверждение заказа
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

    await bot.answerCallbackQuery(callbackQuery.id);
});

console.log('🤖 Бот запущен с пошаговым добавлением блюда...');
