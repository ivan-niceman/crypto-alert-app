import { useState, useEffect, useRef, forwardRef } from 'react';
import PriceAlertForm from '../PriceAlertForm/PriceAlertForm';
import TrashIcon from '../../icons/TrashIcon';

const CryptoCard = forwardRef(
  (
    {
      name,
      symbol,
      pair,
      price,
      previousPrice,
      targetPrices,
      alertsLimit,
      priceChangePercent,
      onAddAlert,
      onRemoveAlert,
      lastTriggeredPrice,
      onRemoveCard,
    },
    ref,
  ) => {
    const [formDefaultPrice, setFormDefaultPrice] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [priceIndicatorClass, setPriceIndicatorClass] = useState('');
    const inputRef = useRef(null);

    // Количество существующих алертов
    const existingAlertsCount = targetPrices.length;
    const isLimitReached = existingAlertsCount >= alertsLimit;

    useEffect(() => {
      if (showForm) {
        if (isLimitReached) {
          // Если лимит достигнут, пока форма была открыта, принудительно скрываем ее
          setShowForm(false);
        } else {
          // Иначе устанавливаем фокус на поле ввода
          inputRef.current?.focus();
        }
      }
    }, [showForm, isLimitReached]);

    // Функция открытия формы и подставления последней цены
    const handleToggleForm = () => {
      if (isLimitReached && !showForm) return;

      const latestPrice =
        price !== null
          ? parseFloat(price.toFixed(5))
          : previousPrice !== null
          ? parseFloat(previousPrice.toFixed(5))
          : '';

      setFormDefaultPrice(latestPrice);
      setShowForm((prev) => !prev);
    };

    // Эффект для обновления и сброса класса индикации цены
    useEffect(() => {
      if (price == null || previousPrice == null) return;

      setPriceIndicatorClass(
        price > previousPrice
          ? 'price-up'
          : price < previousPrice
          ? 'price-down'
          : '',
      );
    }, [price, previousPrice]);

    const binanceViewUrl = `https://www.binance.com/ru/trade/${symbol}_USDT`;

    return (
      <li className="crypto-card" ref={ref}>
        <div className="crypto-card-header">
          <a
            href={binanceViewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="crypto-pair-name"
            title={`Открыть график ${pair} на Binance`}
          >
            {pair}
          </a>
          <div className="crypto-card-header-right">
            <h3 className="crypto-name">{name}</h3>
            <button
              onClick={() => onRemoveCard(symbol)}
              className="remove-card-btn"
              title="Удалить карточку"
            >
              <TrashIcon />
            </button>
          </div>
        </div>
        <div className="crypto-card-body">
          <div className="crypto-card-container">
            <div>
              {price === null ? (
                <div className="loading-dots">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              ) : (
                <p className={`crypto-card-price ${priceIndicatorClass}`}>
                  {parseFloat(price.toFixed(5))}
                  <span
                    className="crypto-card-change-percent"
                    title="Изменение цены за 24 часа"
                  >
                    {priceChangePercent > 0 ? '+' : ''}
                    {priceChangePercent.toFixed(2)}%
                  </span>
                </p>
              )}
              {lastTriggeredPrice && (
                <p
                  className="last-triggered-alert-price"
                  title="Последняя сработавшая цена"
                >
                  {parseFloat(lastTriggeredPrice.toFixed(5))}
                </p>
              )}
            </div>
            <button
              className="crypto-card-btn"
              onClick={handleToggleForm}
              disabled={price === null || (isLimitReached && !showForm)}
            >
              {showForm
                ? 'Скрыть форму'
                : isLimitReached
                ? 'Лимит'
                : 'Добавить цель'}
            </button>
          </div>
          {targetPrices.length > 0 && (
            <div>
              <h5 className="crypto-card-subtitle">
                Целевые цены:
                <br />
                <span>Осталось ({alertsLimit - targetPrices.length})</span>
              </h5>
              <ul className="target-prices-list">
                {targetPrices.map((alert) => (
                  <li key={alert.price} className="target-prices-item">
                    {parseFloat(alert.price.toFixed(5))} USDT
                    <button
                      className="remove-target-btn"
                      onClick={() => onRemoveAlert(pair, alert.price)}
                    ></button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        {showForm && !isLimitReached && (
          <PriceAlertForm
            pair={pair}
            onAddAlert={onAddAlert}
            inputRef={inputRef}
            defaultValue={formDefaultPrice}
          />
        )}
      </li>
    );
  },
);
export default CryptoCard;
