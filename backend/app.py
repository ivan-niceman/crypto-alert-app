import logging
import asyncio
import requests

import aiohttp
from aiohttp import web
import socketio
import aiohttp_cors

from config import (
    HOST, PORT, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, CORS_ALLOWED_ORIGINS
)

from binance_client import BinanceWsClient
from telegram_bot import setup_telegram_bot

# --- Настройка логирования ---
logging.basicConfig(format='%(asctime)s - %(name)s - %(levelname)s - %(message)s', level=logging.INFO)
logging.getLogger('httpx').setLevel(logging.WARNING)
logging.getLogger('aiohttp.access').setLevel(logging.WARNING)

# --- Конфигурация ---
INITIAL_SYMBOLS = ['BTC', 'ETH', 'ADA', 'LINK', 'LTC', 'SOL', 'XRP', 'DOT', 'DOGE', 'TON', 'TRUMP']
# Интервал обновления в секундах (6 часов = 21600 секунд)
DATA_REFRESH_INTERVAL_SECONDS = 6 * 60 * 60

# --- Инициализация ---
sio = socketio.AsyncServer(async_mode='aiohttp', cors_allowed_origins=CORS_ALLOWED_ORIGINS)
app = web.Application()
sio.attach(app)

latest_prices = {}
current_symbols = list(INITIAL_SYMBOLS)
background_tasks = {}
valid_usdt_symbols = set()
coin_names = {}

# --- Функции-помощники ---
def update_app_data_from_binance(symbols_to_fetch):
    """
    Запрашивает exchangeInfo, все активы (для имен) и опционально цены.
    """
    global latest_prices, valid_usdt_symbols, coin_names
    print("Fetching all valid symbols and initial prices from Binance...")
    
    # Получаем все валидные символы
    try:
        info_response = requests.get('https://api.binance.com/api/v3/exchangeInfo', timeout=10)
        info_response.raise_for_status()
        info_data = info_response.json()
        
        # Фильтруем символы: только спот, торгуются к USDT и статус TRADING
        current_valid_symbols = {
            item['baseAsset'] 
            for item in info_data['symbols']
            if item.get('quoteAsset') == 'USDT' and item.get('status') == 'TRADING'
        }
        valid_usdt_symbols = current_valid_symbols
        print(f"Loaded {len(valid_usdt_symbols)} actively trading USDT pairs.")

    except Exception as e:
        print(f"!!! CRITICAL: Could not fetch exchange info from Binance: {e}")
        # В случае ошибки оставляем кэш пустым, валидация будет невозможна
        valid_usdt_symbols = set()

    # Получаем все активы и их полные имена
    try:
        response = requests.get('https://www.binance.com/bapi/asset/v2/public/asset/asset/get-all-asset', timeout=10)
        response.raise_for_status()
        assets_data = response.json()
        
        # Создаем словарь { "BTC": "Bitcoin", "ETH": "Ethereum", ... }
        temp_coin_names = {
            asset['assetCode']: asset['assetName']
            for asset in assets_data.get('data', [])
        }
        coin_names = temp_coin_names
        print(f"Loaded {len(coin_names)} full asset names.")
    except Exception as e:
        print(f"!!! Could not fetch asset names: {e}")
        coin_names = {}

    # Предзагружаем цены для нашего стартового списка
    if symbols_to_fetch:
        print(f"Pre-fetching initial prices for: {symbols_to_fetch}")
        try:
            prices_response = requests.get('https://api.binance.com/api/v3/ticker/price', timeout=10)
            prices_response.raise_for_status()
            prices_data = prices_response.json()
            
            fetched_prices = {
                item['symbol'][:-4]: float(item['price'])
                for item in prices_data
                if item['symbol'].endswith('USDT') and item['symbol'][:-4] in symbols_to_fetch
            }
            latest_prices = fetched_prices
            print(f"Pre-fetched {len(latest_prices)} initial prices.")
        except Exception as e:
            print(f"!!! Could not pre-fetch initial prices: {e}")

# --- Асинхронные задачи ---
async def run_telegram_bot_task(app_instance):
    if not TELEGRAM_BOT_TOKEN: return
    ptb_app = setup_telegram_bot(TELEGRAM_BOT_TOKEN, lambda: current_symbols, sio)
    app_instance['ptb_app'] = ptb_app
    async with ptb_app:
        await ptb_app.initialize()
        await ptb_app.start()
        await ptb_app.updater.start_polling()
        print("Telegram bot is running.")
        if TELEGRAM_CHAT_ID:
            await ptb_app.bot.send_message(chat_id=TELEGRAM_CHAT_ID, text="Привет! Добро пожаловать в бот CryptOn!")
        await ptb_app.updater.running

# async def main_background_tasks(app_instance):
#     binance_client = BinanceWsClient(get_symbols_func=lambda: current_symbols, sio_server=sio, latest_prices_ref=latest_prices)
    
#     binance_task = asyncio.create_task(binance_client.run())
#     updater_task = asyncio.create_task(periodic_data_updater())

#     background_tasks['binance'] = binance_task
#     background_tasks['updater'] = updater_task
    
#     tasks_to_run = [binance_task, updater_task]

#     if TELEGRAM_BOT_TOKEN:
#         telegram_task = asyncio.create_task(run_telegram_bot_task(app_instance))
#         background_tasks['telegram'] = telegram_task
#         tasks_to_run.append(telegram_task)
    
#     await asyncio.gather(*tasks_to_run)

async def main_background_tasks(app_instance):
    binance_task = asyncio.create_task(
        BinanceWsClient(
            get_symbols_func=lambda: current_symbols, 
            sio_server=sio, 
            latest_prices_ref=latest_prices
        ).run()
    )
    updater_task = asyncio.create_task(periodic_data_updater())

    # Сохраняем в словарь
    background_tasks['binance'] = binance_task
    background_tasks['updater'] = updater_task
    
    tasks_to_run = [binance_task, updater_task]

    if TELEGRAM_BOT_TOKEN:
        telegram_task = asyncio.create_task(run_telegram_bot_task(app_instance))
        background_tasks['telegram'] = telegram_task
        tasks_to_run.append(telegram_task)
    
    await asyncio.gather(*tasks_to_run)

async def periodic_data_updater():
    """
    Бесконечный цикл, который периодически обновляет данные с Binance.
    """
    while True:
        try:
            print(f"--- Running periodic data update. Next update in {DATA_REFRESH_INTERVAL_SECONDS / 3600} hours. ---")
            update_app_data_from_binance(symbols_to_fetch=[])
        except Exception as e:
            print(f"!!! ERROR during periodic data update: {e}")
        
        # "Спим" до следующего обновления
        await asyncio.sleep(DATA_REFRESH_INTERVAL_SECONDS)

# HTTP ЭНДПОИНТ ДЛЯ ВАЛИДАЦИИ
async def validate_symbol(request):
    """
    Проверяет, существует ли символ в нашем кэше валидных символов.
    """
    symbol = request.query.get('symbol', '').upper()
    if not symbol:
        return web.json_response({'valid': False, 'message': 'Symbol is required'}, status=400)
    
    if symbol in valid_usdt_symbols:
        full_name = coin_names.get(symbol, symbol)
        return web.json_response({'valid': True, 'name': full_name})
    else:
        return web.json_response({'valid': False, 'message': f'Symbol {symbol} not found.'}, status=404)

# --- Socket.IO события ---
@sio.event
async def connect(sid, environ, auth=None):
    print(f'>>> Frontend Client connected: {sid}')
    if latest_prices:
        prices_to_send = {s: p for s, p in latest_prices.items() if s in current_symbols}
        if prices_to_send:
            initial_data = [
                {
                    'symbol': s,
                    'price': p,
                    'name': coin_names.get(s, s) # Берем имя из кэша
                } for s, p in prices_to_send.items()
            ]
            await sio.emit('initial_prices', {'cryptos': initial_data}, to=sid)
            print(f"Sent initial_prices for {len(prices_to_send)} symbols to {sid}")

@sio.event
async def disconnect(sid):
    print(f'>>> Frontend Client disconnected: {sid}')

@sio.event
async def resubscribe(sid, data):
    global current_symbols

    new_symbols = data.get('symbols')
    if new_symbols is None or not isinstance(new_symbols, list):
        return

    # Не перезапускаем, если список не изменился
    if set(new_symbols) == set(current_symbols):
        return

    print(f"Received request to resubscribe with new symbols: {new_symbols}")
    current_symbols = new_symbols
    
    old_task = background_tasks.get('binance')
    if old_task and not old_task.done():
        old_task.cancel()
        print("Cancelled old Binance WS task.")

    def pre_fetch_prices(symbols_to_fetch):
        global latest_prices
        print(f"Pre-fetching prices for: {symbols_to_fetch}")
        try:
            prices_response = requests.get('https://api.binance.com/api/v3/ticker/price', timeout=10)
            prices_response.raise_for_status()
            prices_data = prices_response.json()
            
            # Обновляем цены только для тех символов, что есть в списке
            for item in prices_data:
                if item['symbol'].endswith('USDT'):
                    base_symbol = item['symbol'][:-4]
                    if base_symbol in symbols_to_fetch:
                        latest_prices[base_symbol] = float(item['price'])
            print(f"Updated/pre-fetched prices for {len(symbols_to_fetch)} symbols.")
        except Exception as e:
            print(f"!!! Could not pre-fetch prices: {e}")

    pre_fetch_prices(current_symbols)

    new_client = BinanceWsClient(get_symbols_func=lambda: current_symbols, sio_server=sio, latest_prices_ref=latest_prices)
    new_task = asyncio.create_task(new_client.run())
    background_tasks['binance'] = new_task
    print("New Binance WS task started.")

@sio.event
async def send_telegram_alert(sid, data):
    message = data.get('message')
    if not message: 
        print("Backend: Received 'send_telegram_alert' event WITHOUT a message.")
        return
    
    print(f"Backend: Received alert request. Message: '{message[:50]}...'")
    
    ptb_app = app.get('ptb_app')
    if ptb_app and TELEGRAM_CHAT_ID:
        try:
            # Создаем задачу для отправки, чтобы не блокировать обработчик
            asyncio.create_task(ptb_app.bot.send_message(chat_id=TELEGRAM_CHAT_ID, text=message))
            print("Backend: Alert message scheduled to be sent to Telegram.")
        except Exception as e:
            print(f"!!! BACKEND FAILED TO SEND TELEGRAM MESSAGE: {e}")
    else:
        if not ptb_app:
            print("!!! ERROR: Telegram bot instance ('ptb_app') not found in app context.")
        if not TELEGRAM_CHAT_ID:
            print("!!! ERROR: TELEGRAM_CHAT_ID is not set in .env file.")

# --- Запуск приложения ---
async def start_background_tasks(app_instance):
    app_instance['aiohttp_session'] = aiohttp.ClientSession()
    app_instance['main_task'] = asyncio.create_task(main_background_tasks(app_instance))

async def cleanup_background_tasks(app_instance):
    print("Stopping background tasks...")
    await app_instance['aiohttp_session'].close()

    for task in background_tasks.values():
        if task and not task.done():
            task.cancel()
    if 'main_task' in app_instance:
        app_instance['main_task'].cancel()
        try: await app_instance['main_task']
        except asyncio.CancelledError: pass
    print("Background tasks were successfully cancelled.")

if __name__ == '__main__':
    update_app_data_from_binance(INITIAL_SYMBOLS)
    cors = aiohttp_cors.setup(app, defaults={
        CORS_ALLOWED_ORIGINS: aiohttp_cors.ResourceOptions(
            allow_credentials=True,
            expose_headers="*",
            allow_headers="*",
            allow_methods="*",
        )
    })
    resource = cors.add(app.router.add_resource("/api/validate_symbol"))
    cors.add(resource.add_route("GET", validate_symbol))
    app.on_startup.append(start_background_tasks)
    app.on_cleanup.append(cleanup_background_tasks)
    print(f"Starting aiohttp server on http://{HOST}:{PORT}")
    web.run_app(app, host=HOST, port=PORT)