// src/App.jsx
import { useState, useEffect, useRef, useCallback } from 'react';
import io from 'socket.io-client';
import CryptoCard from '../CryptoCard/CryptoCard.jsx';
import { sendMessage as sendTelegramMessageViaBackend } from '../../services/telegramService.js';
import notificationSound from '../../assets/notification.mp3';

const MY_FAVORITE_SYMBOLS = [
  'BTC',
  'ETH',
  'ADA',
  'LINK',
  'LTC',
  'SOL',
  'XRP',
  'DOT',
  'DOGE',
  'TON',
  'TRUMP',
];
const ALERTS_STORAGE_KEY = 'cryptoAlerts';
const LAST_TRIGGERED_PRICES_STORAGE_KEY = 'lastTriggeredCryptoPrices';
const SOCKET_SERVER_URL = 'http://localhost:5001';

const MAX_ALERTS_PER_PAIR = 10;

// --- ГЛОБАЛЬНЫЙ СОКЕТ ---
const socket = io(SOCKET_SERVER_URL, {
  transports: ['websocket'],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 3000,
});

const loadInitialAlerts = () => {
  try {
    const savedAlerts = localStorage.getItem(ALERTS_STORAGE_KEY);
    if (!savedAlerts) return {};
    const parsed = JSON.parse(savedAlerts);
    const processedAlerts = {};
    for (const pair in parsed) {
      if (Object.prototype.hasOwnProperty.call(parsed, pair)) {
        processedAlerts[pair] = (parsed[pair] || [])
          .map((alert) => ({
            price: typeof alert === 'number' ? alert : alert.price,
          }))
          .sort((a, b) => a.price - b.price);
      }
    }
    return processedAlerts;
  } catch (e) {
    console.error('Error parsing alerts from localStorage:', e);
    localStorage.removeItem(ALERTS_STORAGE_KEY);
    return {};
  }
};

const loadInitialLastTriggeredPrices = () => {
  try {
    const savedPrices = localStorage.getItem(LAST_TRIGGERED_PRICES_STORAGE_KEY);
    return savedPrices ? JSON.parse(savedPrices) : {};
  } catch (e) {
    console.error('Error parsing last triggered prices from localStorage:', e);
    localStorage.removeItem(LAST_TRIGGERED_PRICES_STORAGE_KEY);
    return {};
  }
};

export default function App() {
  const [cryptos, setCryptos] = useState(() =>
    MY_FAVORITE_SYMBOLS.map((symbol) => ({
      id: symbol,
      name: symbol,
      symbol: symbol,
      price: null,
      previousPrice: null,
      priceChangePercent: 0,
      pair: `${symbol}/USDT`,
    })),
  );
  const [alerts, setAlerts] = useState(loadInitialAlerts);
  const [lastTriggeredPrices, setLastTriggeredPrices] = useState(
    loadInitialLastTriggeredPrices,
  );
  const [isConnected, setIsConnected] = useState(socket.connected);

  const audioRef = useRef(null);
  const triggeredAlertsRef = useRef({});

  // Функция для разблокировки аудио контекста
  const unlockAudio = useCallback(() => {
    if (audioRef.current && audioRef.current.paused) {
      // Пытаемся воспроизвести звук без звука, чтобы разблокировать контекст
      audioRef.current.muted = true;
      audioRef.current.play().catch(() => {});
      // Удаляем слушатель после первой попытки
      document.removeEventListener('click', unlockAudio);
    }
  }, []);

  // Удаляем проверку на количество алертов, оставляем только проверку на дубликаты
  const addAlert = useCallback((pair, targetPrice) => {
    const price = parseFloat(targetPrice);
    if (isNaN(price) || price <= 0) {
      console.error('Invalid price format');
      return;
    }
    setAlerts((prev) => {
      const currentAlerts = prev[pair] || [];
      // Оставляем только проверку на дубликаты
      if (currentAlerts.some((a) => a.price === price)) {
        return prev;
      }
      const newAlerts = [...currentAlerts, { price }].sort(
        (a, b) => a.price - b.price,
      );
      return { ...prev, [pair]: newAlerts };
    });
  }, []);

  const removeAlert = useCallback((pair, targetPriceToRemove) => {
    setAlerts((prev) => {
      const updatedAlerts = (prev[pair] || []).filter(
        (a) => a.price !== targetPriceToRemove,
      );
      delete triggeredAlertsRef.current[`${pair}-${targetPriceToRemove}`];
      if (updatedAlerts.length === 0) {
        const { [pair]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [pair]: updatedAlerts };
    });
  }, []);

  // const playNotificationSound = useCallback(() => {
  //   audioRef.current
  //     ?.play()
  //     .catch((e) => console.error('Audio playback error:', e));
  // }, []);

  // Функция для воспроизведения звука уведомления
  const playNotificationSound = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.muted = false; // Включаем звук
      audioRef.current.currentTime = 0; // Перематываем на начало
      audioRef.current
        .play()
        .catch((e) => console.error('Audio playback error:', e));
    }
  }, []);

  useEffect(() => {
    // audioRef.current = new Audio(notificationSound);
    // audioRef.current.volume = 0.3;
    // const unlockAudio = () => {
    //   if (!audioRef.current) return;
    //   audioRef.current
    //     .play()
    //     .then(() => {
    //       audioRef.current.pause();
    //       audioRef.current.currentTime = 0;
    //       setIsAudioUnlocked(true);
    //       document.removeEventListener('click', unlockAudio);
    //     })
    //     .catch(() => {});
    // };

    // Создаем аудио элемент один раз
    if (!audioRef.current) {
      audioRef.current = new Audio(notificationSound);
      audioRef.current.volume = 0.3;
    }
    document.addEventListener('click', unlockAudio);

    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);

    const onInitialPrices = (data) => {
      if (data?.cryptos) {
        setCryptos((currentList) =>
          currentList.map((existingCrypto) => {
            const newInfo = data.cryptos.find(
              (c) => c.symbol === existingCrypto.symbol,
            );
            return newInfo
              ? {
                  ...existingCrypto,
                  price: newInfo.price,
                  previousPrice: newInfo.price,
                }
              : existingCrypto;
          }),
        );
      }
    };

    const onPriceUpdate = (update) => {
      setCryptos((prevCryptos) =>
        prevCryptos.map((crypto) => {
          if (crypto.symbol === update.symbol) {
            return {
              ...crypto,
              price: update.price,
              previousPrice: crypto.price,
              priceChangePercent: update.priceChangePercent,
            };
          }
          return crypto;
        }),
      );
    };

    const onAddAlertFromBot = (data) => {
      if (data?.pair && data.price) addAlert(data.pair, data.price);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('initial_prices', onInitialPrices);
    socket.on('price_update', onPriceUpdate);
    socket.on('add_alert_from_bot', onAddAlertFromBot);

    return () => {
      document.removeEventListener('click', unlockAudio);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('initial_prices', onInitialPrices);
      socket.off('price_update', onPriceUpdate);
      socket.off('add_alert_from_bot', onAddAlertFromBot);
    };
  }, [addAlert, unlockAudio]);

  useEffect(() => {
    localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(alerts));
  }, [alerts]);
  useEffect(() => {
    localStorage.setItem(
      LAST_TRIGGERED_PRICES_STORAGE_KEY,
      JSON.stringify(lastTriggeredPrices),
    );
  }, [lastTriggeredPrices]);

  useEffect(() => {
    cryptos.forEach((crypto) => {
      const { price: currentPrice, previousPrice, pair: pairKey } = crypto;
      if (
        currentPrice === null ||
        previousPrice === null ||
        currentPrice === previousPrice
      )
        return;
      const pairAlerts = alerts[pairKey] || [];

      pairAlerts.forEach((targetAlert) => {
        const targetPrice = targetAlert.price;
        const alertId = `${pairKey}-${targetPrice}`;
        if (triggeredAlertsRef.current[alertId]) return;

        const minPrice = Math.min(previousPrice, currentPrice);
        const maxPrice = Math.max(previousPrice, currentPrice);

        if (targetPrice >= minPrice && targetPrice <= maxPrice) {
          const movementDir = currentPrice > previousPrice ? '📈' : '📉';
          const movementText =
            currentPrice > previousPrice ? 'поднялась выше' : 'опустилась ниже';
          const message = `${pairKey} ${movementDir} ${movementText} ${targetPrice.toFixed(
            5,
          )} USDT. (Сейчас: ${currentPrice.toFixed(5)} USDT)`;

          console.log(
            `АЛЕРТ СРАБОТАЛ! ${pairKey} ${movementText} ${targetPrice.toFixed(
              5,
            )}`,
          );
          playNotificationSound();
          sendTelegramMessageViaBackend(message);
          triggeredAlertsRef.current[alertId] = true;
          setLastTriggeredPrices((prev) => ({
            ...prev,
            [pairKey]: targetPrice,
          }));
          removeAlert(pairKey, targetPrice);
        }
      });
    });
  }, [
    cryptos,
    alerts,
    removeAlert,
    playNotificationSound,
    setLastTriggeredPrices,
  ]);

  const hasReceivedData = cryptos.some((c) => c.price !== null);

  return (
    <div className="App">
      <h1 className="title">
        Курсы криптовалют (Binance)
        <span
          className="connection-indicator"
          style={{ backgroundColor: isConnected ? '#27ae60' : '#ff2d2d' }}
        ></span>
      </h1>

      <ul
        className="crypto-list"
        style={{ opacity: hasReceivedData ? '1' : '.5' }}
      >
        {cryptos.map((crypto) => (
          <CryptoCard
            key={crypto.id}
            name={crypto.name}
            symbol={crypto.symbol}
            pair={crypto.pair}
            price={crypto.price}
            previousPrice={crypto.previousPrice}
            priceChangePercent={crypto.priceChangePercent}
            targetPrices={alerts[crypto.pair] || []}
            alertsLimit={MAX_ALERTS_PER_PAIR}
            onAddAlert={addAlert}
            onRemoveAlert={removeAlert}
            lastTriggeredPrice={lastTriggeredPrices[crypto.pair]}
          />
        ))}
      </ul>
    </div>
  );
}
