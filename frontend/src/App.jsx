// src/App.jsx
import { useState, useEffect, useRef, useCallback } from 'react';
import io from 'socket.io-client';
import CryptoCard from './components/CryptoCard.jsx';
import './App.css';
import { sendMessage as sendTelegramMessageViaBackend } from './services/telegramService.js';
import notificationSound from './assets/notification.mp3';

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
      pair: `${symbol}/USDT`,
    })),
  );
  const [alerts, setAlerts] = useState(loadInitialAlerts);
  const [lastTriggeredPrices, setLastTriggeredPrices] = useState(
    loadInitialLastTriggeredPrices,
  );
  const [isConnected, setIsConnected] = useState(socket.connected);

  const hasReceivedData = cryptos.some((c) => c.price !== null);

  const audioRef = useRef(null);
  const [isAudioUnlocked, setIsAudioUnlocked] = useState(false);
  const previousPricesForAlertsRef = useRef({});
  const triggeredAlertsRef = useRef({});

  const unlockAudio = useCallback(() => {
    if (isAudioUnlocked || !audioRef.current) return;
    audioRef.current
      .play()
      .then(() => {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        setIsAudioUnlocked(true);
        console.log('Audio context unlocked by user interaction.');
        document.removeEventListener('click', unlockAudio);
      })
      .catch(() => {
        // Ошибка может возникнуть, если пользователь еще не кликал. Это нормально.
      });
  }, [isAudioUnlocked]);

  const addAlert = useCallback((pair, targetPrice) => {
    const price = parseFloat(targetPrice);
    if (isNaN(price) || price <= 0) {
      console.error('Invalid price received from bot or form:', price);
      return;
    }
    setAlerts((prev) => {
      const currentAlertsForPair = prev[pair] || [];
      if (!currentAlertsForPair.some((alert) => alert.price === price)) {
        const newAlert = { price };
        return {
          ...prev,
          [pair]: [...currentAlertsForPair, newAlert].sort(
            (a, b) => a.price - b.price,
          ),
        };
      }
      return prev;
    });
  }, []);

  // Эффект для подписки на события сокета и аудио
  useEffect(() => {
    audioRef.current = new Audio(notificationSound);
    audioRef.current.volume = 0.3;
    document.addEventListener('click', unlockAudio);

    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);

    const onInitialPrices = (data) => {
      if (data && data.cryptos && Array.isArray(data.cryptos)) {
        setCryptos((currentList) =>
          currentList.map((existingCrypto) => {
            const newInfo = data.cryptos.find(
              (c) => c.symbol === existingCrypto.symbol,
            );
            if (newInfo) {
              previousPricesForAlertsRef.current[existingCrypto.pair] =
                undefined;
              return {
                ...existingCrypto,
                price: newInfo.price,
                previousPrice: null,
              };
            }
            return existingCrypto;
          }),
        );
      }
    };

    const onPriceUpdate = (update) => {
      setCryptos((prevCryptos) =>
        prevCryptos.map((crypto) => {
          if (crypto.symbol === update.symbol) {
            previousPricesForAlertsRef.current[crypto.pair] = crypto.price;
            return {
              ...crypto,
              price: update.price,
              previousPrice: update.previousPrice,
            };
          }
          return crypto;
        }),
      );
    };

    const onAddAlertFromBot = (data) => {
      if (data && data.pair && data.price) {
        addAlert(data.pair, data.price);
      }
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

  // Остальные эффекты и функции
  useEffect(() => {
    localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(alerts));
  }, [alerts]);
  useEffect(() => {
    localStorage.setItem(
      LAST_TRIGGERED_PRICES_STORAGE_KEY,
      JSON.stringify(lastTriggeredPrices),
    );
  }, [lastTriggeredPrices]);

  const removeAlert = useCallback((pair, targetPriceToRemove) => {
    setAlerts((prev) => {
      const updatedAlertsForPair = (prev[pair] || []).filter(
        (alert) => alert.price !== targetPriceToRemove,
      );
      delete triggeredAlertsRef.current[`${pair}-${targetPriceToRemove}`];
      if (updatedAlertsForPair.length === 0) {
        const { [pair]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [pair]: updatedAlertsForPair };
    });
  }, []);

  const playNotificationSound = useCallback(() => {
    audioRef.current
      ?.play()
      .catch((error) => console.error('Audio playback error:', error));
  }, []);

  useEffect(() => {
    cryptos.forEach((crypto) => {
      if (crypto.price === null) return;
      const pairKey = crypto.pair;
      const currentPrice = crypto.price;
      const previousPriceForAlert = previousPricesForAlertsRef.current[pairKey];
      const pairAlerts = alerts[pairKey] || [];

      pairAlerts.forEach((targetAlert) => {
        const targetPrice = targetAlert.price;
        const alertId = `${pairKey}-${targetPrice}`;
        if (triggeredAlertsRef.current[alertId]) return;

        let shouldTrigger = false;
        if (
          previousPriceForAlert !== undefined &&
          previousPriceForAlert !== null &&
          currentPrice !== null
        ) {
          if (
            (previousPriceForAlert < targetPrice &&
              currentPrice >= targetPrice) ||
            (previousPriceForAlert > targetPrice && currentPrice <= targetPrice)
          ) {
            shouldTrigger = true;
          }
        }

        if (shouldTrigger) {
          const movementDir = previousPriceForAlert < targetPrice ? '📈' : '📉';
          const movementText =
            previousPriceForAlert < targetPrice
              ? 'поднялась выше'
              : 'опустилась ниже';
          const message = `${pairKey} ${movementDir} ${movementText} ${targetPrice.toFixed(
            5,
          )} USDT.`;

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

  return (
    <div className="App">
      <h1>
        Курсы криптовалют (Binance)
        <span
          className="connection-indicator"
          style={{ backgroundColor: isConnected ? '#27ae60' : '#ff2d2d' }}
        ></span>
      </h1>

      <div
        className="crypto-grid"
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
            targetPrices={alerts[crypto.pair] || []}
            onAddAlert={addAlert}
            onRemoveAlert={removeAlert}
            lastTriggeredPrice={lastTriggeredPrices[crypto.pair]}
          />
        ))}
      </div>
    </div>
  );
}
