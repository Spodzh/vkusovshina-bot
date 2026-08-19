const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const TOKEN = '8752139780:AAEIbtDqq2F3FJ2TqFWcINLWg6Zml8UyAQI';
const SERVER_URL = 'https://vkusovshina-server.onrender.com';

// Настройки бота для избежания конфликтов
const bot = new TelegramBot(TOKEN, {
    polling: {
        autoStart: true,
        interval: 300, // пауза между запросами (мс)
        params: {
            timeout: 10 // таймаут long polling (сек)
        }
    }
});

// ===== КЛАВИАТУРА =====
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

// ===== ОТСЛЕЖИВАНИЕ СОСТОЯНИЙ ПОЛЬЗОВАТЕЛЕЙ (для поэтапного добавления) =====
const userStates = {};

// ===== /start =====
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    sendMainMenu(chatId, '👋 <b>Добро пожаловать в бот управления рестораном!</b>\nВыберите действие:');
});

// ===== /help =====
bot.onText(/\/help/, (msg) => {
    sendMainMenu(msg.chat.id, '❓ <b>Справка</b>\nВсе действия доступны через кнопки ниже.');
});

// ===== ОБРАБОТЧИК ТЕКСТОВЫХ СООБЩЕНИЙ =====
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (!text || text.startsWith('/')) return;

    // ----- ПОЭТАПНОЕ ДОБАВЛЕНИЕ: обработка состояний -----
    if (userStates[chatId] && userStates[chatId].step) {
        const state = userStates[chatId];
        try {
            // Получаем текущее меню с сервера
            const response = await axios.get(`${SERVER_URL}/menu`);
            const menu = response.data;

            if (state.step === 'name') {
                // Сохраняем название
                state.name = text.trim();
                state.step = 'emoji';
                bot.sendMessage(chatId, '✏️ Введите <b>эмодзи</b> для блюда (например, 🍕):', {
                    parse_mode: 'HTML',
                    reply_markup: getMainKeyboard()
                });
                return;
            }

            if (state.step === 'emoji') {
                state.emoji = text.trim();
                state.step = 'price';
                bot.sendMessage(chatId, '✏️ Введите <b>цену</b> (например, 500 коп.):', {
                    parse_mode: 'HTML',
                    reply_markup: getMainKeyboard()
                });
                return;
            }

            if (state.step === 'price') {
                state.price = text.trim();
                state.step = 'desc';
                bot.sendMessage(chatId, '✏️ Введите <b>описание</b> блюда (необязательно, можно пропустить, отправив "-"):', {
                    parse_mode: 'HTML',
                    reply_markup: getMainKeyboard()
                });
                return;
            }

            if (state.step === 'desc') {
                const desc = text.trim() === '-' ? '' : text.trim();
                // Добавляем блюдо
                const newDish = {
                    name: state.name,
                    emoji: state.emoji,
                    price: state.price,
                    desc: desc
                };
                // Проверяем, нет ли уже такого блюда
                if (menu.some(item => item.name.toLowerCase() === state.name.toLowerCase())) {
                    bot.sendMessage(chatId, `⚠️ Блюдо "${state.name}" уже существует.`, {
                        reply_markup: getMainKeyboard()
                    });
                    delete userStates[chatId];
                    sendMainMenu(chatId, '🏠 Главное меню');
                    return;
                }
                menu.push(newDish);
                await axios.post(`${SERVER_URL}/admin/menu`, { menu });
                bot.sendMessage(chatId, `✅ Блюдо "${state.name}" добавлено!`, {
                    reply_markup: getMainKeyboard()
                });
                delete userStates[chatId];
                sendMainMenu(chatId, '🏠 <b>Главное меню</b>\nВыберите действие:');
                return;
            }
        } catch (e) {
            console.error(e);
            bot.sendMessage(chatId, '❌ Ошибка добавления блюда. Попробуйте позже.', {
                reply_markup: getMainKeyboard()
            });
            delete userStates[chatId];
            sendMainMenu(chatId, '🏠 Главное меню');
        }
        return;
    }

    // ----- ОБЫЧНЫЕ КОМАНДЫ (кнопки) -----

    // 1. МЕНЮ
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

    // 2. ДОБАВИТЬ БЛЮДО (запуск поэтапного процесса)
    if (text === '➕ Добавить блюдо') {
        // Сбрасываем состояние, если оно было
        delete userStates[chatId];
        userStates[chatId] = { step: 'name' };
        bot.sendMessage(chatId, '✏️ Введите <b>название</b> блюда:', {
            parse_mode: 'HTML',
            reply_markup: getMainKeyboard()
        });
        return;
    }

    // 3. УДАЛИТЬ БЛЮДО
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

    // 4. ПЕРЕКЛЮЧИТЬ СТАТУС
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

    // 5. СТАТУС
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

    // 6. СТИЛИ
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
        bot.sendMessage(chatId, '🎨 <b>Выберите стиль для сайта:</b>', {
            parse_mode: 'HTML',
            reply_markup: styleButtons
        });
        return;
    }

    // 7. ПОМОЩЬ
    if (text === '❓ Помощь') {
        const helpText = `
🤖 <b>Управление рестораном через бота</b>

<b>Доступные действия (кнопки снизу):</b>
• 📋 Меню – посмотреть текущее меню
• ➕ Добавить блюдо – добавить новое блюдо (пошагово)
• 🗑️ Удалить блюдо – удалить существующее
• 🔄 Открыть/Закрыть – переключить статус ресторана
• 📊 Статус – узнать текущий статус
• 🎨 Стили – изменить дизайн сайта

<b>Добавление блюда:</b>
Нажмите "➕ Добавить блюдо" и следуйте инструкциям бота.
        `;
        bot.sendMessage(chatId, helpText, {
            parse_mode: 'HTML',
            reply_markup: getMainKeyboard()
        });
        return;
    }

    // Если сообщение не распознано
    bot.sendMessage(chatId, 'ℹ️ Используйте кнопки снизу для управления.', {
        reply_markup: getMainKeyboard()
    });
});

// ===== ОБРАБОТЧИК ИНЛАЙН-КНОПОК =====
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
            await bot.editMessageText('❌ Ошибка удаления блюда', {
                chat_id: chatId,
                message_id: messageId
            });
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
            await bot.editMessageText('❌ Выбор стиля отменён', {
                chat_id: chatId,
                message_id: messageId
            });
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
            await bot.editMessageText('❌ Ошибка установки стиля', {
                chat_id: chatId,
                message_id: messageId
            });
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
