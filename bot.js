const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const TOKEN = '8752139780:AAEIbtDqq2F3FJ2TqFWcINLWg6Zml8UyAQI';
const SERVER_URL = 'https://vkusovshina-server.onrender.com';

const bot = new TelegramBot(TOKEN, { polling: true });

// ===== ВЛАДЕЛЕЦ (замени на свой user_id) =====
// Чтобы узнать свой ID, напишите боту /myid
const OWNER_ID = 7892506421; // <-- ВСТАВЬ СВОЙ ID (из /myid)

// ===== СОСТОЯНИЕ ДЛЯ ПОЭТАПНОГО ДОБАВЛЕНИЯ =====
const userStates = {};

// ===== КЛАВИАТУРЫ =====
function getAdminKeyboard() {
    return {
        keyboard: [
            ['📋 Меню', '➕ Добавить блюдо'],
            ['🗑️ Удалить блюдо', '🔄 Открыть/Закрыть'],
            ['📊 Статус', '🎨 Стили'],
            ['❓ Помощь']
        ],
        resize_keyboard: true,
        one_time_keyboard: false
    };
}

function getUserKeyboard() {
    return {
        keyboard: [
            ['📋 Меню', '📊 Статус'],
            ['🎨 Стили', '❓ Помощь']
        ],
        resize_keyboard: true,
        one_time_keyboard: false
    };
}

function getKeyboardForUser(userId) {
    return isAdmin(userId) ? getAdminKeyboard() : getUserKeyboard();
}

// ===== АДМИНКА =====
let admins = [];

async function loadAdmins() {
    try {
        const response = await axios.get(`${SERVER_URL}/admins`);
        admins = response.data.admins || [];
        console.log('✅ Список админов загружен:', admins);
    } catch (e) {
        console.error('❌ Ошибка загрузки админов:', e);
        admins = [];
    }
}

function isAdmin(userId) {
    return userId === OWNER_ID || admins.includes(userId);
}

// ===== ОТПРАВКА ГЛАВНОГО МЕНЮ =====
function sendMainMenu(chatId, text = '🏠 <b>Главное меню</b>\nВыберите действие:') {
    const userId = chatId; // в Telegram chatId == userId для личных сообщений
    bot.sendMessage(chatId, text, {
        parse_mode: 'HTML',
        reply_markup: getKeyboardForUser(userId)
    });
}

// ===== КОМАНДЫ ДЛЯ ВЛАДЕЛЬЦА =====
bot.onText(/\/addadmin (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    if (chatId !== OWNER_ID) {
        bot.sendMessage(chatId, '⛔ У вас нет прав на эту команду.');
        return;
    }
    const userId = parseInt(match[1].trim());
    if (isNaN(userId)) {
        bot.sendMessage(chatId, '❌ Неверный ID. Используйте: /addadmin 123456789');
        return;
    }
    try {
        await axios.post(`${SERVER_URL}/admin/admins`, { userId });
        await loadAdmins();
        bot.sendMessage(chatId, `✅ Пользователь ${userId} теперь админ.`);
    } catch (e) {
        bot.sendMessage(chatId, `❌ Ошибка: ${e.response?.data?.error || e.message}`);
    }
});

bot.onText(/\/removeadmin (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    if (chatId !== OWNER_ID) {
        bot.sendMessage(chatId, '⛔ У вас нет прав на эту команду.');
        return;
    }
    const userId = parseInt(match[1].trim());
    if (isNaN(userId)) {
        bot.sendMessage(chatId, '❌ Неверный ID. Используйте: /removeadmin 123456789');
        return;
    }
    if (userId === OWNER_ID) {
        bot.sendMessage(chatId, '❌ Нельзя удалить владельца.');
        return;
    }
    try {
        await axios.delete(`${SERVER_URL}/admin/admins`, { data: { userId } });
        await loadAdmins();
        bot.sendMessage(chatId, `✅ Пользователь ${userId} больше не админ.`);
    } catch (e) {
        bot.sendMessage(chatId, `❌ Ошибка: ${e.response?.data?.error || e.message}`);
    }
});

bot.onText(/\/myid/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, `Ваш ID: <code>${chatId}</code>`, { parse_mode: 'HTML' });
});

// ===== ОБРАБОТЧИК ТЕКСТОВЫХ СООБЩЕНИЙ =====
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const userId = chatId;

    if (!text || text.startsWith('/')) return;

    // ===== ПОЭТАПНОЕ ДОБАВЛЕНИЕ БЛЮДА =====
    if (userStates[chatId] && userStates[chatId].step) {
        const state = userStates[chatId];
        let step = state.step;
        let dish = state.dish || {};

        if (step === 'name') {
            dish.name = text;
            state.step = 'emoji';
            state.dish = dish;
            bot.sendMessage(chatId, '✏️ Теперь введите <b>эмодзи</b> блюда (например: 🍕):', { parse_mode: 'HTML', reply_markup: getKeyboardForUser(userId) });
            return;
        } else if (step === 'emoji') {
            dish.emoji = text;
            state.step = 'price';
            state.dish = dish;
            bot.sendMessage(chatId, '✏️ Введите <b>цену</b> блюда (например: 500 коп.):', { parse_mode: 'HTML', reply_markup: getKeyboardForUser(userId) });
            return;
        } else if (step === 'price') {
            dish.price = text;
            state.step = 'desc';
            state.dish = dish;
            bot.sendMessage(chatId, '✏️ Введите <b>описание</b> блюда:', { parse_mode: 'HTML', reply_markup: getKeyboardForUser(userId) });
            return;
        } else if (step === 'desc') {
            dish.desc = text;
            state.step = 'confirm';
            state.dish = dish;
            // Показываем итог и просим подтверждение
            const confirmText = `
📋 <b>Новое блюдо:</b>
Название: ${dish.name}
Эмодзи: ${dish.emoji}
Цена: ${dish.price}
Описание: ${dish.desc}

Подтвердить добавление?
            `;
            bot.sendMessage(chatId, confirmText, {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '✅ Да, добавить', callback_data: 'confirm_add' }],
                        [{ text: '❌ Отмена', callback_data: 'cancel_add' }]
                    ]
                }
            });
            return;
        }
        return;
    }

    // ===== ОБЫЧНЫЕ КОМАНДЫ (кнопки) =====

    // ----- 1. МЕНЮ -----
    if (text === '📋 Меню') {
        try {
            const response = await axios.get(`${SERVER_URL}/menu`);
            const menu = response.data;
            if (menu.length === 0) {
                bot.sendMessage(chatId, '📋 Меню пусто', { reply_markup: getKeyboardForUser(userId) });
            } else {
                let menuText = '📋 <b>Текущее меню:</b>\n\n';
                menu.forEach((item, i) => {
                    menuText += `${i+1}. ${item.emoji} <b>${item.name}</b> — ${item.price}\n   ${item.desc || ''}\n`;
                });
                bot.sendMessage(chatId, menuText, { parse_mode: 'HTML', reply_markup: getKeyboardForUser(userId) });
            }
        } catch (e) {
            bot.sendMessage(chatId, '❌ Ошибка загрузки меню', { reply_markup: getKeyboardForUser(userId) });
        }
        return;
    }

    // ----- 2. ДОБАВИТЬ БЛЮДО (только для админов) -----
    if (text === '➕ Добавить блюдо') {
        if (!isAdmin(userId)) {
            bot.sendMessage(chatId, '⛔ У вас нет прав на это действие.', { reply_markup: getKeyboardForUser(userId) });
            return;
        }
        // Запускаем поэтапное добавление
        userStates[chatId] = { step: 'name', dish: {} };
        bot.sendMessage(chatId, '✏️ Введите <b>название</b> блюда:', { parse_mode: 'HTML', reply_markup: getKeyboardForUser(userId) });
        return;
    }

    // ----- 3. УДАЛИТЬ БЛЮДО (только для админов) -----
    if (text === '🗑️ Удалить блюдо') {
        if (!isAdmin(userId)) {
            bot.sendMessage(chatId, '⛔ У вас нет прав на это действие.', { reply_markup: getKeyboardForUser(userId) });
            return;
        }
        try {
            const response = await axios.get(`${SERVER_URL}/menu`);
            const menu = response.data;
            if (menu.length === 0) {
                bot.sendMessage(chatId, '📋 Меню пусто, удалять нечего.', { reply_markup: getKeyboardForUser(userId) });
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
            bot.sendMessage(chatId, '❌ Ошибка загрузки меню', { reply_markup: getKeyboardForUser(userId) });
        }
        return;
    }

    // ----- 4. ПЕРЕКЛЮЧИТЬ СТАТУС (только для админов) -----
    if (text === '🔄 Открыть/Закрыть') {
        if (!isAdmin(userId)) {
            bot.sendMessage(chatId, '⛔ У вас нет прав на это действие.', { reply_markup: getKeyboardForUser(userId) });
            return;
        }
        try {
            const statusRes = await axios.get(`${SERVER_URL}/status`);
            const currentStatus = statusRes.data.isOpen;
            const newStatus = !currentStatus;
            await axios.post(`${SERVER_URL}/admin/status`, { isOpen: newStatus });
            const statusText = newStatus ? '🟢 ОТКРЫТ' : '🔴 ЗАКРЫТ';
            bot.sendMessage(chatId, `✅ Статус ресторана изменён на <b>${statusText}</b>`, {
                parse_mode: 'HTML',
                reply_markup: getKeyboardForUser(userId)
            });
        } catch (e) {
            bot.sendMessage(chatId, '❌ Ошибка изменения статуса', { reply_markup: getKeyboardForUser(userId) });
        }
        return;
    }

    // ----- 5. СТАТУС -----
    if (text === '📊 Статус') {
        try {
            const response = await axios.get(`${SERVER_URL}/status`);
            const isOpen = response.data.isOpen;
            const statusText = isOpen ? '🟢 <b>Открыт</b>' : '🔴 <b>Закрыт</b>';
            bot.sendMessage(chatId, `📊 <b>Текущий статус ресторана:</b>\n${statusText}`, {
                parse_mode: 'HTML',
                reply_markup: getKeyboardForUser(userId)
            });
        } catch (e) {
            bot.sendMessage(chatId, '❌ Ошибка получения статуса', { reply_markup: getKeyboardForUser(userId) });
        }
        return;
    }

    // ----- 6. СТИЛИ (только для админов) -----
    if (text === '🎨 Стили') {
        if (!isAdmin(userId)) {
            bot.sendMessage(chatId, '⛔ У вас нет прав на это действие.', { reply_markup: getKeyboardForUser(userId) });
            return;
        }
        const styleButtons = {
            inline_keyboard: [
                [{ text: '🌿 Лёгкий и воздушный', callback_data: 'style_light' }],
                [{ text: '🔥 Яркий и дерзкий', callback_data: 'style_modern' }],
                [{ text: '🇫🇷 Классический французский', callback_data: 'style_french' }],
                [{ text: '🇯🇵 Минималистичный японский', callback_data: 'style_japanese' }],
                [{ text: '🌱 Эко-стиль', callback_data: 'style_eco' }],
                [{ text: '⚫ Классический (премиум)', callback_data: 'style_classic' }],
                [{ text: '❌ Отмена', callback_data: 'style_cancel' }]
            ]
        };
        bot.sendMessage(chatId, '🎨 <b>Выберите стиль для сайта:</b>', {
            parse_mode: 'HTML',
            reply_markup: styleButtons
        });
        return;
    }

    // ----- 7. ПОМОЩЬ -----
    if (text === '❓ Помощь') {
        const helpText = `
🤖 <b>Управление рестораном</b>

<b>Для всех пользователей:</b>
• 📋 Меню – посмотреть меню
• 📊 Статус – узнать, открыт ли ресторан
• 🎨 Стили – изменить дизайн сайта (если есть права)
• ❓ Помощь – эта справка

<b>Для админов (дополнительно):</b>
• ➕ Добавить блюдо – добавить новое блюдо
• 🗑️ Удалить блюдо – удалить существующее
• 🔄 Открыть/Закрыть – переключить статус ресторана

<b>Владелец:</b>
• /addadmin <id> – дать права админа
• /removeadmin <id> – забрать права админа
• /myid – показать свой ID
        `;
        bot.sendMessage(chatId, helpText, {
            parse_mode: 'HTML',
            reply_markup: getKeyboardForUser(userId)
        });
        return;
    }

    // Если ничего не подошло
    bot.sendMessage(chatId, 'ℹ️ Используйте кнопки снизу или команды.', { reply_markup: getKeyboardForUser(userId) });
});

// ===== ОБРАБОТЧИК ИНЛАЙН-КНОПОК =====
bot.on('callback_query', async (callbackQuery) => {
    const data = callbackQuery.data;
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;
    const userId = chatId;

    // ----- ПОДТВЕРЖДЕНИЕ ДОБАВЛЕНИЯ БЛЮДА -----
    if (data === 'confirm_add') {
        const state = userStates[chatId];
        if (!state || !state.dish) {
            await bot.answerCallbackQuery(callbackQuery.id, { text: 'Ошибка: нет данных' });
            return;
        }
        const dish = state.dish;
        try {
            const response = await axios.get(`${SERVER_URL}/menu`);
            const menu = response.data;
            if (menu.some(item => item.name.toLowerCase() === dish.name.toLowerCase())) {
                await bot.editMessageText(`⚠️ Блюдо "${dish.name}" уже существует.`, {
                    chat_id: chatId,
                    message_id: messageId
                });
                await bot.answerCallbackQuery(callbackQuery.id, { text: 'Блюдо уже есть' });
                delete userStates[chatId];
                sendMainMenu(chatId);
                return;
            }
            menu.push(dish);
            await axios.post(`${SERVER_URL}/admin/menu`, { menu });
            await bot.editMessageText(`✅ Блюдо "${dish.name}" добавлено!`, {
                chat_id: chatId,
                message_id: messageId
            });
            await bot.answerCallbackQuery(callbackQuery.id, { text: 'Блюдо добавлено!' });
            delete userStates[chatId];
            sendMainMenu(chatId, '🏠 Главное меню');
        } catch (e) {
            console.error(e);
            await bot.editMessageText('❌ Ошибка добавления блюда', {
                chat_id: chatId,
                message_id: messageId
            });
            await bot.answerCallbackQuery(callbackQuery.id, { text: 'Ошибка', show_alert: true });
            delete userStates[chatId];
            sendMainMenu(chatId);
        }
        return;
    }

    if (data === 'cancel_add') {
        await bot.editMessageText('❌ Добавление отменено', {
            chat_id: chatId,
            message_id: messageId
        });
        await bot.answerCallbackQuery(callbackQuery.id);
        delete userStates[chatId];
        sendMainMenu(chatId);
        return;
    }

    // ----- УДАЛЕНИЕ БЛЮДА -----
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
            await bot.editMessageText('❌ Ошибка удаления блюда', {
                chat_id: chatId,
                message_id: messageId
            });
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

    // ----- ВЫБОР СТИЛЯ (только для админов) -----
    if (data.startsWith('style_')) {
        const style = data.replace('style_', '');
        if (style === 'cancel') {
            await bot.editMessageText('❌ Выбор стиля отменён', {
                chat_id: chatId,
                message_id: messageId
            });
            await bot.answerCallbackQuery(callbackQuery.id);
            sendMainMenu(chatId);
            return;
        }

        // Проверка на админа
        if (!isAdmin(userId)) {
            await bot.editMessageText('⛔ У вас нет прав на это действие.', {
                chat_id: chatId,
                message_id: messageId
            });
            await bot.answerCallbackQuery(callbackQuery.id, { text: 'Нет прав' });
            sendMainMenu(chatId);
            return;
        }

        try {
            await axios.post(`${SERVER_URL}/admin/style`, { style });
            const styleNames = {
                light: '🌿 Лёгкий и воздушный',
                modern: '🔥 Яркий и дерзкий',
                french: '🇫🇷 Классический французский',
                japanese: '🇯🇵 Минималистичный японский',
                eco: '🌱 Эко-стиль',
                classic: '⚫ Классический (премиум)'
            };
            await bot.editMessageText(
                `✅ Стиль изменён на <b>${styleNames[style] || style}</b>\nОбновите сайт.`,
                {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'HTML'
                }
            );
            await bot.answerCallbackQuery(callbackQuery.id, { text: `Стиль ${styleNames[style] || style} установлен!` });
            sendMainMenu(chatId);
        } catch (e) {
            console.error(e);
            await bot.editMessageText('❌ Ошибка установки стиля', {
                chat_id: chatId,
                message_id: messageId
            });
            await bot.answerCallbackQuery(callbackQuery.id, { text: 'Ошибка', show_alert: true });
            sendMainMenu(chatId);
        }
        return;
    }

    // ----- ПОДТВЕРЖДЕНИЕ ЗАКАЗА (без изменений) -----
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

// ===== ЗАГРУЗКА АДМИНОВ ПРИ СТАРТЕ =====
loadAdmins().then(() => {
    console.log('🤖 Бот запущен с админкой и поэтапным добавлением блюд...');
});

// ===== ПЕРИОДИЧЕСКОЕ ОБНОВЛЕНИЕ АДМИНОВ =====
setInterval(loadAdmins, 5 * 60 * 1000); // каждые 5 минут
