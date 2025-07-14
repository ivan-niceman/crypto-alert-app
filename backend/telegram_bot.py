import socketio
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, BotCommand
from telegram.ext import Application, CommandHandler, CallbackQueryHandler, MessageHandler, filters, ContextTypes, ConversationHandler

# Состояния для диалога
SELECTING_COIN, TYPING_PRICE = range(2)

async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user = update.effective_user
    await update.message.reply_html(
        f"Привет, {user.mention_html()}! Я бот для отслеживания цен.\n\n"
        f"Используй меню команд (кнопка / слева), чтобы управлять алертами."
    )

async def alert_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    get_symbols_func = context.bot_data.get('get_symbols_func')
    symbol_list = get_symbols_func() if get_symbols_func else []
    
    if not symbol_list:
        await update.message.reply_text("Список отслеживаемых криптовалют в данный момент пуст.")
        return ConversationHandler.END

    keyboard = []
    row = []
    for symbol in symbol_list:
        row.append(InlineKeyboardButton(symbol, callback_data=f"set_alert_coin_{symbol}"))
        if len(row) == 3:
            keyboard.append(row)
            row = []
    if row: keyboard.append(row)
    keyboard.append([InlineKeyboardButton("Отмена", callback_data="cancel_dialog")])
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    await update.message.reply_text('Выберите криптовалюту для установки алерта:', reply_markup=reply_markup)
    return SELECTING_COIN

async def select_coin_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    if query.data == 'cancel_dialog':
        await query.edit_message_text(text='Действие отменено.')
        context.user_data.clear()
        return ConversationHandler.END
    selected_coin = query.data.split('_')[-1]
    context.user_data['selected_coin'] = selected_coin
    await query.edit_message_text(text=f"Выбрана монета: {selected_coin}\n\nТеперь введите целевую цену в USDT (или /cancel):")
    return TYPING_PRICE

async def receive_price_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    user_input = update.message.text
    selected_coin = context.user_data.get('selected_coin')
    sio_server = context.bot_data.get('socketio_server')
    if not selected_coin or not sio_server:
        await update.message.reply_text("Что-то пошло не так. Начните снова с /alert.")
        return ConversationHandler.END
    try:
        target_price = float(user_input.replace(',', '.'))
        if target_price <= 0: raise ValueError("Price must be positive")
        pair = f"{selected_coin}/USDT"
        await sio_server.emit('add_alert_from_bot', {'pair': pair, 'price': target_price})
        await update.message.reply_text(f"✅ Установлен алерт для {pair} на цену {target_price} USDT.")
        context.user_data.clear()
        return ConversationHandler.END
    except ValueError:
        await update.message.reply_text("Неверный формат. Введите цену в виде числа (или /cancel).")
        return TYPING_PRICE

async def cancel_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text('Действие отменено.')
    context.user_data.clear()
    return ConversationHandler.END

def setup_telegram_bot(token: str, get_symbols_func, socketio_instance: socketio.AsyncServer) -> Application:
    """Создает, настраивает и возвращает экземпляр Telegram Application."""
    if not token:
        print("!!! TELEGRAM_BOT_TOKEN is not set. Bot will not work. !!!")
        return None

    application = Application.builder().token(token).build()
    
    application.bot_data['get_symbols_func'] = get_symbols_func
    application.bot_data['socketio_server'] = socketio_instance
    
    conv_handler = ConversationHandler(
        entry_points=[CommandHandler('alert', alert_command)],
        states={
            SELECTING_COIN: [
                CallbackQueryHandler(select_coin_callback, pattern='^set_alert_coin_'),
                CallbackQueryHandler(cancel_command, pattern='^cancel_dialog$')
            ],
            TYPING_PRICE: [MessageHandler(filters.TEXT & ~filters.COMMAND, receive_price_message)],
        },
        fallbacks=[CommandHandler('cancel', cancel_command)],
        per_message=False
    )
    application.add_handler(CommandHandler("start", start_command))
    application.add_handler(conv_handler)
    
    return application