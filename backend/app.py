# backend/app.py

import logging
import os
import json
import asyncio
import websockets
import requests
from dotenv import load_dotenv

from aiohttp import web
import socketio

from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, BotCommand
from telegram.ext import Application, CommandHandler, CallbackQueryHandler, MessageHandler, filters, ContextTypes, ConversationHandler

# --- Настройка логирования ---
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logging.getLogger('httpx').setLevel(logging.WARNING)
logging.getLogger('aiohttp.access').setLevel(logging.WARNING)
logger = logging.getLogger(__name__)

load_dotenv()

# --- Конфигурация ---
TELEGRAM_BOT_TOKEN = os.getenv('TELEGRAM_BOT_TOKEN')
ADMIN_CHAT_ID = os.getenv('TELEGRAM_CHAT_ID') 

MY_FAVORITE_SYMBOLS = [
    'BTC', 'ETH', 'ADA', 'LINK', 'LTC', 'SOL', 'XRP', 'DOT', 'DOGE', 'TON', 'TRUMP']
latest_prices = {}

# --- Инициализация Socket.IO для aiohttp ---
sio = socketio.AsyncServer(async_mode='aiohttp', cors_allowed_origins='*')
app = web.Application()
sio.attach(app)

# --- Состояния для диалога с ботом ---
SELECTING_COIN, TYPING_PRICE = range(2)


# --- Функции-помощники и для бота ---
def pre_fetch_initial_prices():
    """Делает один HTTP-запрос к Binance для получения начальных цен."""
    print("Pre-fetching initial prices from Binance...")
    try:
        response = requests.get('https://api.binance.com/api/v3/ticker/price', timeout=10)
        response.raise_for_status()
        binance_data = response.json()
        if isinstance(binance_data, list):
            for item in binance_data:
                if 'symbol' in item and item['symbol'].endswith('USDT'):
                    base_symbol = item['symbol'][:-4]
                    if base_symbol in MY_FAVORITE_SYMBOLS:
                        try:
                            latest_prices[base_symbol] = float(item['price'])
                        except (ValueError, TypeError):
                            continue
            print(f"Pre-fetched {len(latest_prices)} prices successfully.")
    except Exception as e:
        print(f"!!! Could not pre-fetch initial prices: {e}")

async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user = update.effective_user
    await update.message.reply_html(
        f"Привет, {user.mention_html()}! Я бот для отслеживания цен.\n\n"
        f"Используй меню команд (кнопка слева), чтобы установить уведомление!"
    )

async def alert_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    keyboard = []
    row = []
    symbol_list = context.bot_data.get('symbol_list', [])
    for symbol in symbol_list:
        row.append(InlineKeyboardButton(symbol, callback_data=f"set_alert_coin_{symbol}"))
        if len(row) == 3:
            keyboard.append(row)
            row = []
    if row: keyboard.append(row)
    keyboard.append([InlineKeyboardButton("Отмена", callback_data="cancel_dialog")])
    reply_markup = InlineKeyboardMarkup(keyboard)
    await update.message.reply_text('Выберите криптовалюту для установки уведомления:', reply_markup=reply_markup)
    return SELECTING_COIN

async def select_coin_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    if query.data == 'cancel_dialog':
        await query.edit_message_text(text='Действие отменено.')
        return ConversationHandler.END
    selected_coin = query.data.split('_')[-1]
    context.user_data['selected_coin'] = selected_coin
    await query.edit_message_text(text=f"Выбрана монета: {selected_coin}\n\nТеперь введите целевую цену в USDT (или /cancel):")
    return TYPING_PRICE

async def receive_price_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    user_input = update.message.text
    selected_coin = context.user_data.get('selected_coin')
    if not selected_coin:
        await update.message.reply_text("Что-то пошло не так. Начните снова с /alert.")
        return ConversationHandler.END
    try:
        target_price = float(user_input.replace(',', '.'))
        if target_price <= 0: raise ValueError("Price must be positive")
        pair = f"{selected_coin}/USDT"
        await sio.emit('add_alert_from_bot', {'pair': pair, 'price': target_price})
        await update.message.reply_text(f"✅ Установлено уведомление для {pair} на цену {target_price} USDT.")
        context.user_data.clear()
        return ConversationHandler.END
    except ValueError:
        await update.message.reply_text("Неверный формат. Введите цену в виде числа (или /cancel).")
        return TYPING_PRICE

async def cancel_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text('Действие отменено.')
    context.user_data.clear()
    return ConversationHandler.END

# --- Логика для Binance WebSocket ---
async def binance_websocket_client():
    streams = [f"{symbol.lower()}usdt@ticker" for symbol in MY_FAVORITE_SYMBOLS]
    binance_ws_url = f"wss://stream.binance.com:9443/stream?streams={'/'.join(streams)}"
    print(f"Connecting to Binance WebSocket (TICKER): {binance_ws_url}")
    while True:
        try:
            async with websockets.connect(binance_ws_url) as websocket:
                print(">>> Successfully connected to Binance WebSocket (TICKER).")
                while True:
                    message = json.loads(await websocket.recv())

                    if 'data' in message and 's' in message['data'] and 'c' in message['data'] and 'P' in message['data']:
                        data = message['data']
                        full_symbol, price_str, price_change_percent_str = data['s'], data['c'], data['P']
                        base_symbol = full_symbol[:-4] if full_symbol.endswith('USDT') else full_symbol

                        if base_symbol in latest_prices:
                            try:
                                price = float(price_str)
                                price_change_percent = float(price_change_percent_str)
                                previous_price = latest_prices.get(base_symbol)
                                latest_prices[base_symbol] = price

                                if price != previous_price:
                                    payload = {'symbol': base_symbol, 'price': price, 'previousPrice': previous_price, 'priceChangePercent': price_change_percent}
                                    await sio.emit('price_update', payload)
                            except (ValueError, TypeError): continue
        except Exception as e:
            print(f"!!! Error with Binance WebSocket: {e}. Reconnecting in 10 seconds...")
            await asyncio.sleep(10)

# --- ГЛАВНАЯ АСИНХРОННАЯ ЗАДАЧА ---
async def main_async_tasks(app_instance):
    if not TELEGRAM_BOT_TOKEN:
        print("!!! TELEGRAM_BOT_TOKEN is not set. Bot will not work. !!!")
        # Если нет токена, запускаем только клиент Binance
        await binance_websocket_client()
        return

    ptb_app = Application.builder().token(TELEGRAM_BOT_TOKEN).build()
    ptb_app.bot_data['symbol_list'] = MY_FAVORITE_SYMBOLS
    ptb_app.bot_data['socketio_server'] = sio
    
    conv_handler = ConversationHandler(
        entry_points=[CommandHandler('alert', alert_command)],
        states={
            SELECTING_COIN: [CallbackQueryHandler(select_coin_callback, pattern='^set_alert_coin_')],
            TYPING_PRICE: [MessageHandler(filters.TEXT & ~filters.COMMAND, receive_price_message)],
        },
        fallbacks=[CommandHandler('cancel', cancel_command)],
        per_message=False
    )
    ptb_app.add_handler(CommandHandler("start", start_command))
    ptb_app.add_handler(conv_handler)
    
    app_instance['ptb_app'] = ptb_app

    async with ptb_app:
        await ptb_app.initialize()
        
        commands = [
            BotCommand("start", "🚀 Перезапустить бота"),
            BotCommand("alert", "🔔 Установить новое уведомление"),
            BotCommand("cancel", "❌ Отменить текущее действие"),
        ]
        await ptb_app.bot.set_my_commands(commands)
        print("Bot commands menu has been set.")
        
        await ptb_app.start()
        if ADMIN_CHAT_ID:
            await ptb_app.bot.send_message(chat_id=ADMIN_CHAT_ID, text="Добро пожаловать в бот CryptoAlert!")
            print(f"Startup message sent to ADMIN_CHAT_ID: {ADMIN_CHAT_ID}")
        
        await ptb_app.updater.start_polling()
        print("Telegram bot has been initialized and is running in polling mode.")
        
        await binance_websocket_client()

# --- Socket.IO события ---
@sio.event
async def connect(sid, environ, auth=None):
    print(f'>>> Frontend Client connected: {sid}')
    if latest_prices:
        initial_data = [{'symbol': symbol, 'price': price, 'previousPrice': None} for symbol, price in latest_prices.items()]
        await sio.emit('initial_prices', {'cryptos': initial_data}, to=sid)
        print(f"Sent initial_prices to {sid}")

@sio.event
async def disconnect(sid):
    print(f'>>> Frontend Client disconnected: {sid}')

@sio.event
async def send_telegram_alert(sid, data):
    message = data.get('message')
    if not message: return
    
    ptb_app = app.get('ptb_app')
    if ptb_app and ADMIN_CHAT_ID:
        try:
            asyncio.create_task(ptb_app.bot.send_message(chat_id=ADMIN_CHAT_ID, text=message))
            print(f"Alert scheduled to be sent to ADMIN_CHAT_ID: '{message[:40]}...'")
        except Exception as e:
            print(f"Failed to send alert to ADMIN_CHAT_ID: {e}")
    else:
        print("Telegram bot not ready or ADMIN_CHAT_ID not set, can't send alert.")

# --- Запуск приложения ---
async def start_background_tasks(app_instance):
    app_instance['main_task'] = asyncio.create_task(main_async_tasks(app_instance))

async def cleanup_background_tasks(app_instance):
    print("Stopping background tasks...")
    app_instance['main_task'].cancel()
    try:
        await app_instance['main_task']
    except asyncio.CancelledError:
        print("Background tasks were successfully cancelled.")

if __name__ == '__main__':
    pre_fetch_initial_prices()
    
    app.on_startup.append(start_background_tasks)
    app.on_cleanup.append(cleanup_background_tasks)
    
    print("Starting aiohttp server on http://localhost:5001")
    web.run_app(app, host='0.0.0.0', port=5001)