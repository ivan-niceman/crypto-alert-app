import {
  useState,
  useEffect,
  useRef,
  useCallback,
  createRef,
  useMemo,
} from 'react';
import { Toaster, toast } from 'react-hot-toast';
import { CSSTransition, TransitionGroup } from 'react-transition-group';
import { socket } from '../../socket.js';
import './App.css';
import CryptoCard from '../CryptoCard/CryptoCard.jsx';
import AddCryptoForm from '../AddCryptoForm/AddCryptoForm.jsx';
import SearchBar from '../SearchBar/SearchBar.jsx';
import SortControls from '../SortControls/SortControls.jsx';
import { sendMessage as sendTelegramMessageViaBackend } from '../../services/telegramService.js';
import notificationSound from '../../assets/notification.mp3';

const DEFAULT_SYMBOLS = [
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
const CRYPTO_SYMBOLS_STORAGE_KEY = 'cryptoSymbols';

const MAX_ALERTS_PER_PAIR = 4; // Максимальное количество алертов на одну пару

const loadInitialSymbols = () => {
  try {
    const savedSymbols = localStorage.getItem(CRYPTO_SYMBOLS_STORAGE_KEY);
    return savedSymbols ? JSON.parse(savedSymbols) : DEFAULT_SYMBOLS;
  } catch (e) {
    console.error('Error parsing symbols from localStorage:', e);
    return DEFAULT_SYMBOLS;
  }
};

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

const createCryptoObject = (symbol, name = null) => ({
  id: symbol,
  name: name || symbol,
  symbol: symbol,
  price: null,
  previousPrice: null,
  priceChangePercent: 0,
  pair: `${symbol}/USDT`,
  nodeRef: createRef(null),
});

export default function App() {
  const [cryptos, setCryptos] = useState(() =>
    loadInitialSymbols().map((symbol) => createCryptoObject(symbol)),
  );

  const [alerts, setAlerts] = useState(loadInitialAlerts);
  const [lastTriggeredPrices, setLastTriggeredPrices] = useState(
    loadInitialLastTriggeredPrices,
  );
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [isAddFormVisible, setIsAddFormVisible] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({
    key: 'pair',
    direction: 'ascending',
  });

  const audioRef = useRef(null);
  const triggeredAlertsRef = useRef({});
  const isInitialMount = useRef(true);
  const addFormNodeRef = useRef(null);

  // Удаляем проверку на количество алертов, оставляем только проверку на дубликаты
  const addAlert = useCallback((pair, targetPrice) => {
    const price = Number(targetPrice);
    if (!(price > 0)) {
      console.error('Invalid price format');
      return;
    }
    setAlerts((prev) => {
      const currentAlerts = prev[pair] ?? [];
      if (currentAlerts.find(({ price: p }) => p === price)) return prev;
      if (currentAlerts.length >= MAX_ALERTS_PER_PAIR) {
        console.warn(`Alert limit for ${pair} reached.`);
        return prev;
      }

      return {
        ...prev,
        [pair]: [...currentAlerts, { price }].sort((a, b) => a.price - b.price),
      };
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

  // Функция для воспроизведения звука уведомления
  const playNotificationSound = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.muted = false;
      audioRef.current.currentTime = 0;
      audioRef.current
        .play()
        .catch((e) => console.error('Audio playback error:', e));
    }
  }, []);

  useEffect(() => {
    audioRef.current = new Audio(notificationSound);
    audioRef.current.volume = 0.3;

    const unlockAudio = () => {
      if (audioRef.current && audioRef.current.muted !== false) {
        audioRef.current.muted = false;
        audioRef.current
          .play()
          .then(() => {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
          })
          .catch(() => {});
      }
      document.removeEventListener('click', unlockAudio);
    };
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
            if (newInfo) {
              return {
                ...existingCrypto,
                price: newInfo.price,
                previousPrice: newInfo.price,
                name: newInfo.name,
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
  }, [addAlert]);

  const handleRemoveCrypto = useCallback((symbolToRemove) => {
    setCryptos((prevCryptos) =>
      prevCryptos.filter((crypto) => crypto.symbol !== symbolToRemove),
    );
    // Также очистим связанные с этой монетой алерты
    setAlerts((prevAlerts) => {
      const { [`${symbolToRemove}/USDT`]: _, ...rest } = prevAlerts;
      return rest;
    });
  }, []);

  const handleAddCrypto = useCallback(
    async (symbol) => {
      const newSymbol = symbol.toUpperCase().trim();

      if (!newSymbol) return;

      if (cryptos.find((c) => c.symbol === newSymbol)) {
        toast.success(`${newSymbol} уже есть в списке.`);
        return;
      }

      setIsAdding(true); // Включаем индикатор загрузки

      try {
        const response = await fetch(
          `http://localhost:5001/api/validate_symbol?symbol=${newSymbol}`,
        );
        const data = await response.json();

        if (response.ok && data.valid) {
          // Символ валиден, добавляем его
          const newCrypto = createCryptoObject(newSymbol, data.name);
          setCryptos((prev) => [...prev, newCrypto]);
          setIsAddFormVisible(false); // Закрываем форму
          toast.success(`Монета ${data.name} успешно добавлена!`);
        } else {
          // Символ невалиден, показываем ошибку
          toast.error(
            `Монета "${newSymbol}" не найдена на Binance или произошла ошибка.\n(${
              data.message || 'Попробуйте другой тикер'
            })`,
          );
        }
      } catch (error) {
        console.error('Validation request failed:', error);
        toast.error(
          'Не удалось проверить монету. Проверьте соединение с сервером.',
        );
      } finally {
        setIsAdding(false); // Выключаем индикатор загрузки в любом случае
      }
    },
    [cryptos],
  );

  useEffect(() => {
    const symbols = cryptos.map((c) => c.symbol);
    localStorage.setItem(CRYPTO_SYMBOLS_STORAGE_KEY, JSON.stringify(symbols));
  }, [cryptos]);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    const symbols = cryptos.map((c) => c.symbol);
    socket.emit('resubscribe', { symbols });
  }, [cryptos]);

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

  const filteredCryptos = cryptos.filter(
    (crypto) =>
      crypto.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
      crypto.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  // Создаем отсортированный массив с помощью useMemo
  const sortedAndFilteredCryptos = useMemo(() => {
    let sortableItems = [...filteredCryptos]; // Создаем копию, чтобы не мутировать исходный массив

    if (sortConfig.key !== null) {
      sortableItems.sort((a, b) => {
        if (a[sortConfig.key] === null) return 1;
        if (b[sortConfig.key] === null) return -1;
        // Сортировка
        if (a[sortConfig.key] < b[sortConfig.key]) {
          return sortConfig.direction === 'ascending' ? -1 : 1;
        }
        if (a[sortConfig.key] > b[sortConfig.key]) {
          return sortConfig.direction === 'ascending' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableItems;
  }, [filteredCryptos, sortConfig]);

  return (
    <div className="App">
      <header>
        <h1 className="title">
          Курсы криптовалют (Binance)
          <span
            className="connection-indicator"
            style={{ backgroundColor: isConnected ? '#27ae60' : '#ff2d2d' }}
          />
        </h1>
        <button
          className="add-crypto-btn"
          onClick={() => setIsAddFormVisible(true)}
          style={{ opacity: hasReceivedData ? '1' : '.5' }}
        >
          Добавить монету
        </button>
        <div className="list-controls">
          <SearchBar searchTerm={searchTerm} setSearchTerm={setSearchTerm} />
          <SortControls sortConfig={sortConfig} setSortConfig={setSortConfig} />
        </div>
      </header>

      <main>
        <TransitionGroup
          component="ul"
          className="crypto-list"
          style={{ opacity: hasReceivedData ? '1' : '.5' }}
        >
          {sortedAndFilteredCryptos.map((crypto) => (
            <CSSTransition
              key={crypto.id}
              nodeRef={crypto.nodeRef}
              timeout={100}
              classNames="item"
              appear
            >
              <CryptoCard
                key={crypto.id}
                ref={crypto.nodeRef}
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
                onRemoveCard={handleRemoveCrypto}
              />
            </CSSTransition>
          ))}
        </TransitionGroup>
      </main>
      <CSSTransition
        in={isAddFormVisible}
        nodeRef={addFormNodeRef}
        timeout={200}
        classNames="item"
        unmountOnExit
      >
        <AddCryptoForm
          ref={addFormNodeRef}
          onAdd={handleAddCrypto}
          onCancel={() => setIsAddFormVisible(false)}
          isAdding={isAdding}
        />
      </CSSTransition>
      <Toaster
        position="top-center"
        reverseOrder={false}
        toastOptions={{
          duration: 5000,
          style: {
            borderRadius: '4px',
            background: '#2e2e2e',
            color: '#fff',
          },
        }}
      />
    </div>
  );
}
