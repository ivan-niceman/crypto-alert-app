from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, CommandHandler, CallbackQueryHandler, MessageHandler, filters, ContextTypes, ConversationHandler

# Состояния для диалога
SELECTING_COIN, TYPING_PRICE = range(2)

# --- Обработчики команд и сообщений (теперь это обычные функции, а не async) ---

def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user = update.effective_user
    update.message.reply_html(
        f"Привет, {user.mention_html()}! Я бот для отслеживания цен.\n\n"
        f"Используй команду /alert, чтобы установить новое уведомление.\n"
        f"Твой Chat ID: `{user.id}`"
    )

def alert_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    symbol_list = context.bot_data.get('symbol_list', [])
    if not symbol_list:
        update.message.reply_text("Список криптовалют пуст.")
        return ConversationHandler.END

    keyboard = [
        [InlineKeyboardButton(symbol, callback_data=f"set_alert_coin_{symbol}")]
        for symbol in symbol_list
    ]
    # Пример группировки по 3 в ряд
    keyboard_grouped = [keyboard[i:i + 3] for i in range(0, len(keyboard), 3)]
    
    reply_markup = InlineKeyboardMarkup(keyboard_grouped)
    update.message.reply_text('Выберите криптовалюту:', reply_markup=reply_markup)
    return SELECTING_COIN

def select_coin_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    query.answer()
    selected_coin = query.data.split('_')[-1]
    context.user_data['selected_coin'] = selected_coin
    query.edit_message_text(text=f"Выбрана монета: {selected_coin}\n\nВведите целевую цену в USDT:")
    return TYPING_PRICE

def receive_price_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    user_input = update.message.text
    selected_coin = context.user_data.get('selected_coin')
    socketio_server = context.bot_data.get('socketio_server')

    if not selected_coin or not socketio_server:
        update.message.reply_text("Ошибка. Начните снова с /alert.")
        return ConversationHandler.END
    try:
        target_price = float(user_input.replace(',', '.'))
        if target_price <= 0: raise ValueError("Price must be positive")
        
        pair = f"{selected_coin}/USDT"
        socketio_server.emit('add_alert_from_bot', {'pair': pair, 'price': target_price})
        update.message.reply_text(f"✅ Установлен алерт для {pair} на цену {target_price} USDT.")
        
        context.user_data.clear()
        return ConversationHandler.END
    except ValueError:
        update.message.reply_text("Неверный формат. Введите цену в виде числа.")
        return TYPING_PRICE

def cancel_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    update.message.reply_text('Действие отменено.')
    context.user_data.clear()
    return ConversationHandler.END

# --- Главная функция для настройки ---
def setup_telegram_bot(token: str, symbol_list: list, socketio_instance):
    if not token:
        print("!!! TELEGRAM_BOT_TOKEN is not set. !!!")
        return None

    application = Application.builder().token(token).build()
    
    application.bot_data['symbol_list'] = symbol_list
    application.bot_data['socketio_server'] = socketio_instance
    
    conv_handler = ConversationHandler(
        entry_points=[CommandHandler('alert', alert_command)],
        states={
            SELECTING_COIN: [CallbackQueryHandler(select_coin_callback, pattern='^set_alert_coin_')],
            TYPING_PRICE: [MessageHandler(filters.TEXT & ~filters.COMMAND, receive_price_message)],
        },
        fallbacks=[CommandHandler('cancel', cancel_command)],
        per_message=False
    )
    application.add_handler(CommandHandler("start", start_command))
    application.add_handler(conv_handler)
    
    return application