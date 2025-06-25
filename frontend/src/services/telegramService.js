// Импортируем наш глобальный сокет
import { socket } from '../socket.js';

const sendMessage = (message) => {
  // Проверяем, что сокет подключен
  if (socket && socket.connected) {
    // Отправляем событие 'send_telegram_alert' с данными
    socket.emit('send_telegram_alert', { message: message });
    console.log('Telegram notification event sent via WebSocket.');
  } else {
    console.error('Socket not connected. Cannot send Telegram notification.');
  }
};

export { sendMessage };
