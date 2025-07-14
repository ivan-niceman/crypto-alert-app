# backend/config.py
import os
from dotenv import load_dotenv

# Загружаем переменные из .env файла
load_dotenv()

# Настройки сервера
# os.getenv() позволяет задать значение по умолчанию, если переменная не найдена
HOST = os.getenv('HOST', '0.0.0.0')
PORT = int(os.getenv('PORT', 5001))

# Настройки Telegram
# Здесь мы не задаем значения по умолчанию, т.к. без них бот бессмысленен
TELEGRAM_BOT_TOKEN = os.getenv('TELEGRAM_BOT_TOKEN')
TELEGRAM_CHAT_ID = os.getenv('TELEGRAM_CHAT_ID')

# Настройки CORS
# Для продакшена НИКОГДА не используйте '*'.
# Переменная должна содержать URL вашего фронтенда, например: 'https://your-app-domain.com'
CORS_ALLOWED_ORIGINS = os.getenv('CORS_ALLOWED_ORIGINS', '*')

# Стартовый список символов (можно тоже вынести в .env, если нужно)
# INITIAL_SYMBOLS_STR = os.getenv('INITIAL_SYMBOLS', 'BTC,ETH,ADA,LINK,LTC,SOL,XRP,DOT,DOGE,TON,TRUMP')
# INITIAL_SYMBOLS = [symbol.strip() for symbol in INITIAL_SYMBOLS_STR.split(',')]