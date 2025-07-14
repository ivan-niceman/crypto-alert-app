import asyncio
import json
import websockets

class BinanceWsClient:
    def __init__(self, get_symbols_func, sio_server, latest_prices_ref: dict):
        """
        Инициализирует клиент.
        :param get_symbols_func: Функция, возвращающая актуальный список символов.
        :param sio_server: Экземпляр сервера Socket.IO.
        :param latest_prices_ref: Ссылка на глобальный словарь с ценами для синхронизации.
        """
        self._get_symbols = get_symbols_func
        self._sio = sio_server
        self._latest_prices = latest_prices_ref # Используем переданный словарь

    def _build_ws_url(self) -> str | None:
        """Формирует URL для мульти-стрима Binance."""
        symbols = self._get_symbols()
        if not symbols:
            return None
        # Используем @ticker для получения и цены, и процентов
        streams = [f"{symbol.lower()}usdt@ticker" for symbol in symbols]
        return f"wss://stream.binance.com:9443/stream?streams={'/'.join(streams)}"

    async def run(self):
        """Основной метод для запуска и автоматического переподключения клиента."""
        while True:
            ws_url = self._build_ws_url()
            if not ws_url:
                print("Symbol list is empty, Binance client is paused.")
                await asyncio.sleep(15)
                continue

            print(f"Connecting to Binance WebSocket: {ws_url}")
            try:
                async with websockets.connect(ws_url) as websocket:
                    print(">>> Successfully connected to Binance WebSocket (TICKER).")
                    await self.listen_to_messages(websocket)
            except asyncio.CancelledError:
                print("Binance client task was cancelled.")
                break
            except Exception as e:
                print(f"!!! Error with Binance WebSocket: {e}. Reconnecting in 10 seconds...")
                await asyncio.sleep(10)

    async def listen_to_messages(self, websocket):
        """Бесконечно прослушивает сообщения из активного сокета."""
        while True:
            message = json.loads(await websocket.recv())
            await self._process_message(message)

    async def _process_message(self, message: dict):
        """Обрабатывает входящее сообщение и отправляет обновление на фронтенд."""
        if 'data' in message and 's' in message['data'] and 'c' in message['data'] and 'P' in message['data']:
            data = message['data']
            full_symbol, price_str, percent_str = data['s'], data['c'], data['P']
            base_symbol = full_symbol[:-4]
            
            if base_symbol in self._get_symbols():
                try:
                    price = float(price_str)
                    price_change_percent = float(percent_str)
                    previous_price = self._latest_prices.get(base_symbol)
                    self._latest_prices[base_symbol] = price
                    
                    if price != previous_price:
                        payload = {
                            'symbol': base_symbol, 'price': price,
                            'previousPrice': previous_price, 'priceChangePercent': price_change_percent
                        }
                        await self._sio.emit('price_update', payload)
                except (ValueError, TypeError):
                    pass