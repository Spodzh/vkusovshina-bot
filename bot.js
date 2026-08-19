const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const TOKEN = '8752139780:AAEIbtDqq2F3FJ2TqFWcINLWg6Zml8UyAQI';
const SERVER_URL = 'https://vkusovshina-server.onrender.com';

const bot = new TelegramBot(TOKEN, { polling: true });

// Хранилище состояний пользователей для поэтапного добавления блюда
const userStates = {};

function getMainKeyboard() {
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

function sendMainMenu(chatId, text = '🏠 <b>Главное меню</b>\nВыберите действие:') {
    bot.sendMessage(chatId, text, {
        parse_mode: 'HTML',
        reply_markup: getMainKeyboard()
    });
}

// ===== /start =====
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    sendMainMenu(chatId, '👋 <b>Добро пожаловать в бот управления рестораном!</b>\nВыберите действие:');
});

// ===== /help =====
bot.onText(/\/help/, (msg) => {
    sendMainMenu(msg.chat.id, '❓ <b>Справка</b>\nВсе действия доступны через кнопки ниже.');
});

// ===== Обработка текстовых сообщений =====
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (!text) return;

    // Если команда, пропускаем (они обрабатываются отдельно)
    if (text.startsWith('/')) return;

    // Проверяем состояние – если пользователь в процессе добавления блюда
    if (userStates[chatId]) {
        const state = userStates[chatId];
        // Добавляем полученные данные в зависимости от шага
        if (state.step === 'name') {
            state.name = text;
            state.step = 'emoji';
            await bot.sendMessage(chatId, '✏️ Теперь отправьте <b>эмодзи</b> для блюда (например, 🍕):', {
                parse_mode: 'HTML',
                reply_markup: getMainKeyboard()
            });
            return;
        } else if (state.step === 'emoji') {
            state.emoji = text;
            state.step = 'price';
            await bot.sendMessage(chatId, '✏️ Теперь отправьте <b>цену</b> (например, 500 коп.):', {
                parse_mode: 'HTML',
                reply_markup: getMainKeyboard()
            });
            return;
        } else if (state.step === 'price') {
            state.price = text;
            state.step = 'desc';
            await bot.sendMessage(chatId, '✏️ Теперь отправьте <b>описание</b> (например, "Вкусная пицца с сыром"):', {
                parse_mode: 'HTML',
                reply_markup: getMainKeyboard()
            });
            return;
        } else if (state.step === 'desc') {
            state.desc = text;
            // Все данные собраны, сохраняем блюдо
            try {
                const response = await axios.get(`${SERVER_URL}/menu`);
                const menu = response.data;
                // Проверяем уникальность названия
                if (menu.some(item => item.name.toLowerCase() === state.name.toLowerCase())) {
                    await bot.sendMessage(chatId, `⚠️ Блюдо "${state.name}" уже существует. Попробуйте снова.`, {
                        reply_markup: getMainKeyboard()
                    });
                    delete userStates[chatId];
                    return;
                }
                menu.push({ name: state.name, emoji: state.emoji, price: state.price, desc: state.desc });
                await axios.post(`${SERVER_URL}/admin/menu`, { menu });
                await bot.sendMessage(chatId, `✅ Блюдо "${state.name}" добавлено!`, {
                    reply_markup: getMainKeyboard()
                });
                delete userStates[chatId];
                sendMainMenu(chatId, '🏠 <b>Главное меню</b>\nВыберите действие:');
            } catch (e) {
                console.error(e);
                await bot.sendMessage(chatId, '❌ Ошибка добавления блюда. Попробуйте позже.', {
                    reply_markup: getMainKeyboard()
                });
                delete userStates[chatId];
            }
            return;
        }
        // Если что-то пошло не так, сбрасываем состояние
        delete userStates[chatId];
        sendMainMenu(chatId, '⚠️ Что-то пошло не так. Попробуйте снова.');
        return;
    }

    // ----- Остальные кнопки -----
    if (text === '📋 Меню') {
        try {
            const response = await axios.get(`${SERVER_URL}/menu`);
            const menu = response.data;
            if (menu.length === 0) {
                await bot.sendMessage(chatId, '📋 <b>Меню пусто</b>', { parse_mode: 'HTML', reply_markup: getMainKeyboard() });
            } else {
                let menuText = '📋 <b>Текущее меню:</b>\n\n';
                menu.forEach((item, i) => {
                    menuText += `${i+1}. ${item.emoji} <b>${item.name}</b> — ${item.price}\n   ${item.desc || ''}\n`;
                });
                await bot.sendMessage(chatId, menuText, { parse_mode: 'HTML', reply_markup: getMainKeyboard() });
            }
        } catch (e) {
            await bot.sendMessage(chatId, '❌ Ошибка загрузки меню', { reply_markup: getMainKeyboard() });
        }
        return;
    }

    if (text === '➕ Добавить блюдо') {
        // Начинаем поэтапное добавление
        userStates[chatId] = { step: 'name' };
        await bot.sendMessage(chatId, '✏️ Введите <b>название</b> блюда:', {
            parse_mode: 'HTML',
            reply_markup: getMainKeyboard()
        });
        return;
    }

    if (text === '🗑️ Удалить блюдо') {
        try {
            const response = await axios.get(`${SERVER_URL}/menu`);
            const menu = response.data;
            if (menu.length === 0) {
                await bot.sendMessage(chatId, '📋 Меню пусто, удалять нечего.', { reply_markup: getMainKeyboard() });
            } else {
                const buttons = menu.map((item, index) => [
                    { text: `${item.emoji} ${item.name}`, callback_data: `remove_${index}` }
                ]);
                buttons.push([{ text: '❌ Отмена', callback_data: 'remove_cancel' }]);
                await bot.sendMessage(chatId, '🗑️ <b>Выберите блюдо для удаления:</b>', {
                    parse_mode: 'HTML',
                    reply_markup: { inline_keyboard: buttons }
                });
            }
        } catch (e) {
            await bot.sendMessage(chatId, '❌ Ошибка загрузки меню', { reply_markup: getMainKeyboard() });
        }
        return;
    }

    if (text === '🔄 Открыть/Закрыть') {
        try {
            const statusRes = await axios.get(`${SERVER_URL}/status`);
            const currentStatus = statusRes.data.isOpen;
            const newStatus = !currentStatus;
            await axios.post(`${SERVER_URL}/admin/status`, { isOpen: newStatus });
            const statusText = newStatus ? '🟢 ОТКРЫТ' : '🔴 ЗАКРЫТ';
            await bot.sendMessage(chatId, `✅ Статус ресторана изменён на <b>${statusText}</b>`, {
                parse_mode: 'HTML',
                reply_markup: getMainKeyboard()
            });
        } catch (e) {
            await bot.sendMessage(chatId, '❌ Ошибка изменения статуса', { reply_markup: getMainKeyboard() });
        }
        return;
    }

    if (text === '📊 Статус') {
        try {
            const response = await axios.get(`${SERVER_URL}/status`);
            const isOpen = response.data.isOpen;
            const statusText = isOpen ? '🟢 <b>Открыт</b>' : '🔴 <b>Закрыт</b>';
            await bot.sendMessage(chatId, `📊 <b>Текущий статус ресторана:</b>\n${statusText}`, {
                parse_mode: 'HTML',
                reply_markup: getMainKeyboard()
            });
        } catch (e) {
            await bot.sendMessage(chatId, '❌ Ошибка получения статуса', { reply_markup: getMainKeyboard() });
        }
        return;
    }

    if (text === '🎨 Стили') {
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
        await bot.sendMessage(chatId, '🎨 <b>Выберите стиль для сайта:</b>', {
            parse_mode: 'HTML',
            reply_markup: styleButtons
        });
        return;
    }

    if (text === '❓ Помощь') {
        const helpText = `
🤖 <b>Управление рестораном через бота</b>

<b>Доступные действия (кнопки снизу):</b>
• 📋 Меню – посмотреть текущее меню
• ➕ Добавить блюдо – добавить новое блюдо (поэтапно)
• 🗑️ Удалить блюдо – удалить существующее
• 🔄 Открыть/Закрыть – переключить статус ресторана
• 📊 Статус – узнать текущий статус
• 🎨 Стили – изменить дизайн сайта

<b>Добавление блюда:</b>
После нажатия кнопки "➕ Добавить блюдо" следуйте инструкциям бота.
        `;
        await bot.sendMessage(chatId, helpText, { parse_mode: 'HTML', reply_markup: getMainKeyboard() });
        return;
    }

    // Если сообщение не распознано
    await bot.sendMessage(chatId, 'ℹ️ Используйте кнопки снизу для управления.', {
        reply_markup: getMainKeyboard()
    });
});

// ===== Обработка инлайн-кнопок =====
bot.on('callback_query', async (callbackQuery) => {
    const data = callbackQuery.data;
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;

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
            sendMainMenu(chatId, '🏠 <b>Главное меню</b>\nВыберите действие:');
        } catch (e) {
            console.error(e);
            await bot.editMessageText('❌ Ошибка удаления блюда', { chat_id: chatId, message_id: messageId });
            await bot.answerCallbackQuery(callbackQuery.id, { text: 'Ошибка', show_alert: true });
            sendMainMenu(chatId, '🏠 Главное меню');
        }
        return;
    }

    if (data === 'remove_cancel') {
        await bot.editMessageText('❌ Удаление отменено', { chat_id: chatId, message_id: messageId });
        await bot.answerCallbackQuery(callbackQuery.id);
        sendMainMenu(chatId, '🏠 Главное меню');
        return;
    }

    // ----- ВЫБОР СТИЛЯ -----
    if (data.startsWith('style_')) {
        const style = data.replace('style_', '');
        if (style === 'cancel') {
            await bot.editMessageText('❌ Выбор стиля отменён', { chat_id: chatId, message_id: messageId });
            await bot.answerCallbackQuery(callbackQuery.id);
            sendMainMenu(chatId, '🏠 Главное меню');
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
                `✅ Стиль изменён на <b>${styleNames[style] || style}</b>\nОбновите сайт, чтобы увидеть изменения.`,
                {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'HTML'
                }
            );
            await bot.answerCallbackQuery(callbackQuery.id, { text: `Стиль ${styleNames[style] || style} установлен!` });
            sendMainMenu(chatId, '🏠 <b>Главное меню</b>\nВыберите действие:');
        } catch (e) {
            console.error(e);
            await bot.editMessageText('❌ Ошибка установки стиля', { chat_id: chatId, message_id: messageId });
            await bot.answerCallbackQuery(callbackQuery.id, { text: 'Ошибка', show_alert: true });
            sendMainMenu(chatId, '🏠 Главное меню');
        }
        return;
    }

    // ----- ПОДТВЕРЖДЕНИЕ ЗАКАЗА -----
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

console.log('🤖 Бот запущен с поэтапным добавлением блюд и постоянной клавиатурой...');
