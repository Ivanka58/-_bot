const TelegramBot = require('node-telegram-bot-api');

// Замените 'YOUR_BOT_TOKEN' на токен вашего бота
const token = '8223748927:AAEl6go9g_QGX1rw11j5XlpXVbjUSAcBwi8';

// Создаем экземпляр бота
const bot = new TelegramBot(token, { polling: true });

// Объект для хранения планов (ключ - ID чата, значение - массив планов)
const plans = {};

// Объект для хранения состояний пользователей (какой запрос они ожидают)
const userStates = {};

// Объект для хранения информации об отправленных приветствиях и предварительных напоминаниях
const sentReminders = {};

// ID пользователя, которому нужно отправлять сообщения "Я жив"
const ownerId = 6749286679; // Замените на ваш User ID

// Функция для добавления плана
function addPlan(chatId, time, task) {
    if (!plans[chatId]) {
        plans[chatId] = [];
    }
    plans[chatId].push({ time: time, task: task });
}

// Функция для удаления плана
function deletePlan(chatId, index) {
    if (plans[chatId] && plans[chatId][index]) {
        plans[chatId].splice(index, 1);
        return true;
    }
    return false;
}

// Функция для отправки напоминания
function sendReminder(chatId, time, task) {
    bot.sendMessage(chatId, `Напоминание! В ${time} - ${task}`);
}

// Функция для отправки предварительных напоминаний
function sendPreReminders(chatId, plan) {
    const now = new Date();
    now.setHours(now.getHours() + 3); // ВРЕМЕННОЕ РЕШЕНИЕ ДЛЯ ЧАСОВОГО ПОЯСА

    const [hours, minutes] = plan.time.split(':').map(Number);
    const taskTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0);

    const timeLeft = taskTime.getTime() - now.getTime();

    if (timeLeft > 0) {
        const reminderKey = `${chatId}-${plan.time}-${plan.task}`; // Уникальный ключ для напоминания

        if (!sentReminders[reminderKey]) {
            sentReminders[reminderKey] = {};
        }

        // Исправленные условия: проверяем, что время еще не прошло и что напоминание еще не отправлено
        if (timeLeft <= 60 * 60 * 1000 && timeLeft > 30 * 60 * 1000 && !sentReminders[reminderKey].hour) { // За час
            bot.sendMessage(chatId, `Через час: ${plan.task} в ${plan.time}`);
            sentReminders[reminderKey].hour = true;
        }
        if (timeLeft <= 30 * 60 * 1000 && timeLeft > 10 * 60 * 1000 && !sentReminders[reminderKey].halfHour) { // За полчаса
            bot.sendMessage(chatId, `Через полчаса: ${plan.task} в ${plan.time}`);
            sentReminders[reminderKey].halfHour = true;
        }
        if (timeLeft <= 10 * 60 * 1000 && timeLeft > 0 && !sentReminders[reminderKey].tenMinutes) { // За 10 минут
            bot.sendMessage(chatId, `Через 10 минут: ${plan.task} в ${plan.time}`);
            sentReminders[reminderKey].tenMinutes = true;
        }
    }
}

// Функция для проверки и отправки напоминаний
function checkReminders() {
    const now = new Date();
    now.setHours(now.getHours() + 3); // ВРЕМЕННОЕ РЕШЕНИЕ ДЛЯ ЧАСОВОГО ПОЯСА

    const currentHour = String(now.getHours()).padStart(2, '0');
    const currentMinute = String(now.getMinutes()).padStart(2, '0');
    const currentTime = `${currentHour}:${currentMinute}`;

    for (const chatId in plans) {
        if (plans.hasOwnProperty(chatId)) {
            // Используем цикл for, чтобы можно было удалять элементы во время итерации
            for (let i = 0; i < plans[chatId].length; i++) {
                const plan = plans[chatId][i];
                if (plan.time === currentTime) {
                    sendReminder(chatId, plan.time, plan.task);
                    // Удаляем задачу из списка после отправки напоминания
                    plans[chatId].splice(i, 1);
                    i--; // Уменьшаем индекс, чтобы не пропустить следующий элемент
                } else {
                    sendPreReminders(chatId, plan); // Отправляем предварительные напоминания
                }
            }
        }
    }
}

// Отправка сообщения "Я жив" каждые 30 минут
function sendIAmAlive() {
    bot.sendMessage(ownerId, 'Я жив!');
}

setInterval(sendIAmAlive, 10 * 30 * 1000); // 30 минут

// Запускаем проверку напоминаний каждую минуту
setInterval(checkReminders, 60 * 1000); // 60000 миллисекунд = 1 минута

// Обработчик команды /addplan
bot.onText(/\/addplan/, (msg) => {
    const chatId = msg.chat.id;
    userStates[chatId] = 'waiting_for_plan';
    bot.sendMessage(chatId, 'Напишите ваш план в формате <время> <задача> (например, 10:00 Встреча)');
});

// Обработчик команды /deleteplan
bot.onText(/\/deleteplan/, (msg) => {
    const chatId = msg.chat.id;
    if (plans[chatId] && plans[chatId].length > 0) {
        let message = 'Ваши планы:\n';
        plans[chatId].forEach((plan, index) => {
            message += `${index + 1}. ${plan.time} - ${plan.task}\n`;
        });
        bot.sendMessage(chatId, message + '\nНапишите номер задачи, которую хотите удалить:');
        userStates[chatId] = 'waiting_for_delete_number';
    } else {
        bot.sendMessage(chatId, 'У вас пока нет планов.');
    }
});

// Обработчик текстовых сообщений (для получения плана и номера для удаления)
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (userStates[chatId] === 'waiting_for_plan') {
        // Разбираем текст на время и задачу
        const parts = text.split(' ');
        const time = parts[0];
        const task = parts.slice(1).join(' ');

        // Проверяем, что время указано в правильном формате (например, "10:00")
        if (!/^\d{2}:\d{2}$/.test(time)) {
            bot.sendMessage(chatId, 'Неверный формат времени. Используйте формат ЧЧ:ММ (например, 10:00).');
            delete userStates[chatId];
            return;
        }

        if (!task) {
            bot.sendMessage(chatId, 'Пожалуйста, укажите задачу.');
            delete userStates[chatId];
            return;
        }

        addPlan(chatId, time, task);
        bot.sendMessage(chatId, `План добавлен: ${time} - ${task}`);
        delete userStates[chatId];

    } else if (userStates[chatId] === 'waiting_for_delete_number') {
        const index = parseInt(text) - 1; // Индекс плана (начинается с 1)

        if (isNaN(index) || index < 0) {
            bot.sendMessage(chatId, 'Неверный номер плана.');
        } else {
            if (deletePlan(chatId, index)) {
                bot.sendMessage(chatId, 'План удален.');
            } else {
                bot.sendMessage(chatId, 'План с таким номером не найден.');
            }
        }
        delete userStates[chatId];
    }
});

// Обработчик команды /listplans
bot.onText(/\/listplans/, (msg) => {
    const chatId = msg.chat.id;
    if (plans[chatId] && plans[chatId].length > 0) {
        let message = 'Ваши планы:\n';
        plans[chatId].forEach((plan, index) => {
            message += `${index + 1}. ${plan.time} - ${plan.task}\n`;
        });
        bot.sendMessage(chatId, message);
    } else {
        bot.sendMessage(chatId, 'У вас пока нет планов.');
    }
});

// Обработчик команды /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const helpText = `Привет! Я бот-напоминалка.\n\n` +
        `**Список команд:**\n` +
        `/start - Начать работу с ботом\n` +
        `/addplan - Добавить новый план\n` +
        `/listplans - Показать список всех планов\n` +
        `/deleteplan - Удалить план\n`;
    bot.sendMessage(chatId, helpText, { parse_mode: 'Markdown' });
});

// Обработчик команды /help (если хотите отдельную команду помощи)
bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    const helpText = `**Список команд:**\n` +
        `/start - Начать работу с ботом\n` +
        `/addplan - Добавить новый план\n` +
        `/listplans - Показать список всех планов\n` +
        `/deleteplan - Удалить план\n`;
    bot.sendMessage(chatId, helpText, { parse_mode: 'Markdown' });
});

console.log('Бот запущен...');
