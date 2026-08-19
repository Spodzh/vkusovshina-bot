const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const TOKEN = '8752139780:AAEIbtDqq2F3FJ2TqFWcINLWg6Zml8UyAQI';
const SERVER_URL = 'https://vkusovshina-server.onrender.com';

const bot = new TelegramBot(TOKEN, { polling: true });

console.log('🤖 Бот запущен');

// Кэш меню (чтобы не запрашивать каждый раз)
let cachedMenu = null;
let cacheTime = 0;
const CACHE_TTL = 60000; // 1 минута

async function getMenu() {
    const now = Date.now();
    if (cachedMenu && (now - cacheTime) < CACHE_TTL) {
        return cachedMenu;
    }
    try {
        const start = Date.now();
        const response = await axios.get(`${SERVER_URL}/menu`);
        console.log(`⏱️ Запрос меню занял ${Date.now() - start} мс`);
        cachedMenu = response.data;
        cacheTime = now;
        return cachedMenu;
    } catch (e) {
        console.error('Ошибка получения меню:', e.message);
        return null;
    }
}

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

// /start и /help – как раньше
bot.onText(/\/start/, (msg) => {
    sendMainMenu(msg.chat.id, '👋 <b>Добро пожаловать в бот управления рестораном!</b>\nВыберите действие:');
});

bot.onText(/\/help/, (msg) => {
    sendMainMenu(msg.chat.id, '❓ <b>Справка</b>\nВсе действия доступны через кнопки ниже.');
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    if (!text || text.startsWith('/')) return;

    console.log(`📩 Получено сообщение: "${text}" от ${chatId}`);

    const startTime = Date.now();

    // ----- 1. МЕНЮ -----
    if (text === '📋 Меню') {
        try {
            const menu = await getMenu();
            if (!menu) {
                bot.sendMessage(chatId, '❌ Ошибка загрузки меню', { reply_markup: getMainKeyboard() });
                return;
            }
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
            console.error('Ошибка в меню:', e);
            bot.sendMessage(chatId, '❌ Ошибка загрузки меню', { reply_markup: getMainKeyboard() });
        }
        console.log(`⏱️ Команда "Меню" выполнена за ${Date.now() - startTime} мс`);
        return;
    }

    // ----- 2. ДОБАВИТЬ БЛЮДО -----
    if (text === '➕ Добавить блюдо') {
        bot.sendMessage(chatId,
            '✏️ <b>Добавление блюда</b>\n\nОтправьте блюдо в формате:\n\n<code>Название | Эмодзи | Цена | Описание</code>\n\nПример:\n<code>Пицца | 🍕 | 500 коп. | Вкусная пицца</code>\n\nДля отмены просто нажмите любую другую кнопку.',
            {
                parse_mode: 'HTML',
                reply_markup: getMainKeyboard()
            }
        );
        console.log(`⏱️ Команда "Добавить" выполнена за ${Date.now() - startTime} мс`);
        return;
    }

    // ----- 3. УДАЛИТЬ БЛЮДО -----
    if (text === '🗑️ Удалить блюдо') {
        try {
            const menu = await getMenu();
            if (!menu) {
                bot.sendMessage(chatId, '❌ Ошибка загрузки меню', { reply_markup: getMainKeyboard() });
                return;
            }
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
            console.error('Ошибка удаления:', e);
            bot.sendMessage(chatId, '❌ Ошибка загрузки меню', { reply_markup: getMainKeyboard() });
        }
        console.log(`⏱️ Команда "Удалить" выполнена за ${Date.now() - startTime} мс`);
        return;
    }

    // ----- 4. ОТКРЫТЬ/ЗАКРЫТЬ -----
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
            console.error('Ошибка статуса:', e);
            bot.sendMessage(chatId, '❌ Ошибка изменения статуса', { reply_markup: getMainKeyboard() });
        }
        console.log(`⏱️ Команда "Открыть/Закрыть" выполнена за ${Date.now() - startTime} мс`);
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
                reply_markup: getMainKeyboard()
            });
        } catch (e) {
            console.error('Ошибка статуса:', e);
            bot.sendMessage(chatId, '❌ Ошибка получения статуса', { reply_markup: getMainKeyboard() });
        }
        console.log(`⏱️ Команда "Статус" выполнена за ${Date.now() - startTime} мс`);
        return;
    }

    // ----- 6. СТИЛИ -----
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
        console.log(`⏱️ Команда "Стили" выполнена за ${Date.now() - startTime} мс`);
        return;
    }

    // ----- 7. ПОМОЩЬ -----
    if (text === '❓ Помощь') {
        const helpText = `
🤖 <b>Управление рестораном через бота</b>

<b>Доступные действия (кнопки снизу):</b>
• 📋 Меню – посмотреть текущее меню
• ➕ Добавить блюдо – добавить новое блюдо
• 🗑️ Удалить блюдо – удалить существующее
• 🔄 Открыть/Закрыть – переключить статус ресторана
• 📊 Статус – узнать текущий статус
• 🎨 Стили – изменить дизайн сайта

<b>Добавление блюда:</b>
Отправьте сообщение в формате:
<code>Название | Эмодзи | Цена | Описание</code>

<b>Подтверждение заказов:</b>
При поступлении заказа приходит кнопка "Подтвердить заказ".
        `;
        bot.sendMessage(chatId, helpText, {
            parse_mode: 'HTML',
            reply_markup: getMainKeyboard()
        });
        console.log(`⏱️ Команда "Помощь" выполнена за ${Date.now() - startTime} мс`);
        return;
    }

    // ----- 8. ОБРАБОТКА ДОБАВЛЕНИЯ БЛЮДА (содержит '|') -----
    if (text.includes('|')) {
        const parts = text.split('|').map(s => s.trim());
        if (parts.length === 4) {
            const [name, emoji, price, desc] = parts;
            try {
                const response = await axios.get(`${SERVER_URL}/menu`);
                const menu = response.data;
                if (menu.some(item => item.name.toLowerCase() === name.toLowerCase())) {
                    bot.sendMessage(chatId, `⚠️ Блюдо "${name}" уже существует. Используйте другое название.`, {
                        reply_markup: getMainKeyboard()
                    });
                    return;
                }
                menu.push({ name, emoji, price, desc });
                await axios.post(`${SERVER_URL}/admin/menu`, { menu });
                // Очищаем кэш меню
                cachedMenu = null;
                bot.sendMessage(chatId, `✅ Блюдо "${name}" добавлено!`, { reply_markup: getMainKeyboard() });
            } catch (e) {
                console.error('Ошибка добавления:', e);
                bot.sendMessage(chatId, '❌ Ошибка добавления блюда. Попробуйте позже.', { reply_markup: getMainKeyboard() });
            }
        } else {
            bot.sendMessage(chatId,
                '⚠️ Неверный формат. Используйте:\n<code>Название | Эмодзи | Цена | Описание</code>\n\nПример:\n<code>Пицца | 🍕 | 500 коп. | Вкусная пицца</code>',
                { parse_mode: 'HTML', reply_markup: getMainKeyboard() }
            );
        }
        console.log(`⏱️ Обработка добавления выполнена за ${Date.now() - startTime} мс`);
        return;
    }

    // Если сообщение не распознано
    bot.sendMessage(chatId, 'ℹ️ Используйте кнопки снизу для управления.', {
        reply_markup: getMainKeyboard()
    });
    console.log(`⏱️ Неизвестное сообщение обработано за ${Date.now() - startTime} мс`);
});

// ===== ОБРАБОТЧИК ИНЛАЙН-КНОПОК =====
bot.on('callback_query', async (callbackQuery) => {
    const data = callbackQuery.data;
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;
    const start = Date.now();

    // УДАЛЕНИЕ
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
            // Очищаем кэш
            cachedMenu = null;
            await bot.editMessageText(`✅ Блюдо "<b>${removed.name}</b>" удалено!`, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'HTML'
            });
            await bot.answerCallbackQuery(callbackQuery.id, { text: 'Блюдо удалено!' });
            sendMainMenu(chatId, '🏠 <b>Главное меню</b>\nВыберите действие:');
        } catch (e) {
            console.error('Ошибка удаления:', e);
            await bot.editMessageText('❌ Ошибка удаления блюда', { chat_id: chatId, message_id: messageId });
            await bot.answerCallbackQuery(callbackQuery.id, { text: 'Ошибка', show_alert: true });
            sendMainMenu(chatId, '🏠 Главное меню');
        }
        console.log(`⏱️ Удаление выполнено за ${Date.now() - start} мс`);
        return;
    }

    if (data === 'remove_cancel') {
        await bot.editMessageText('❌ Удаление отменено', { chat_id: chatId, message_id: messageId });
        await bot.answerCallbackQuery(callbackQuery.id);
        sendMainMenu(chatId, '🏠 Главное меню');
        console.log(`⏱️ Отмена удаления за ${Date.now() - start} мс`);
        return;
    }

    // СТИЛИ
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
            console.error('Ошибка установки стиля:', e);
            await bot.editMessageText('❌ Ошибка установки стиля', { chat_id: chatId, message_id: messageId });
            await bot.answerCallbackQuery(callbackQuery.id, { text: 'Ошибка', show_alert: true });
            sendMainMenu(chatId, '🏠 Главное меню');
        }
        console.log(`⏱️ Стиль установлен за ${Date.now() - start} мс`);
        return;
    }

    // ПОДТВЕРЖДЕНИЕ ЗАКАЗА
    if (data.startsWith('confirm_')) {
        const orderId = data.replace('confirm_', '');
        try {
            const response = await axios.post(`${SERVER_URL}/orders/confirm`, { id: orderId });
            if (response.status === 200) {
                await bot.editMessageText(`✅ Заказ #${orderId} подтверждён!`, { chat_id: chatId, message_id: messageId });
                await bot.answerCallbackQuery(callbackQuery.id, { text: 'Заказ подтверждён!' });
            } else {
                await bot.answerCallbackQuery(callbackQuery.id, { text: 'Ошибка подтверждения', show_alert: true });
            }
        } catch (error) {
            console.error('Ошибка подтверждения:', error);
            await bot.answerCallbackQuery(callbackQuery.id, { text: 'Сервер недоступен', show_alert: true });
        }
        console.log(`⏱️ Подтверждение заказа за ${Date.now() - start} мс`);
        return;
    }

    await bot.answerCallbackQuery(callbackQuery.id);
});

console.log('🤖 Бот запущен и готов к работе');
