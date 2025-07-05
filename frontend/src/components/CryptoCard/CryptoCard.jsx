import { useState, useEffect, useRef } from 'react';
import PriceAlertForm from '../PriceAlertForm/PriceAlertForm';

export default function CryptoCard({
  name,
  pair,
  price,
  previousPrice,
  targetPrices,
  alertsLimit,
  priceChangePercent,
  onAddAlert,
  onRemoveAlert,
  lastTriggeredPrice,
}) {
  const [showForm, setShowForm] = useState(false);
  const [priceIndicatorClass, setPriceIndicatorClass] = useState('');
  const inputRef = useRef(null);

  // Количество существующих алертов
  const existingAlertsCount = targetPrices.length;
  const isLimitReached = existingAlertsCount >= alertsLimit;

  // Используем useEffect для установки фокуса
  useEffect(() => {
    if (showForm && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showForm]);

  // Эффект для обновления и сброса класса индикации цены
  useEffect(() => {
    if (previousPrice === null || price === null || price === previousPrice) {
      return;
    }

    let newClass = '';
    if (price > previousPrice) {
      newClass = 'price-up';
    } else if (price < previousPrice) {
      newClass = 'price-down';
    }

    // Если цена изменилась (newClass не пустой)
    if (newClass) {
      setPriceIndicatorClass(newClass);
    }
  }, [price, previousPrice]);

  // --- Скрываем форму, если достигнут лимит ---
  useEffect(() => {
    if (isLimitReached && showForm) {
      // Если лимит достигнут, а форма показана, принудительно скрываем ее
      setShowForm(false);
    }
  }, [isLimitReached, showForm]);

  return (
    <li className="crypto-card">
      <div className="crypto-card-header">
        <p className="pair-name">{pair}</p>
        <h3 className="crypto-name">{name}</h3>
      </div>
      <div className="crypto-card-body">
        <div className="crypto-card-container">
          <div>
            <p className={`crypto-card-price ${priceIndicatorClass}`}>
              {price !== null
                ? parseFloat(price.toFixed(5))
                : previousPrice !== null
                ? parseFloat(previousPrice.toFixed(5))
                : '...'}
              {price !== null && (
                <span
                  className="crypto-card-change-percent"
                  title="Изменение цены за 24 часа"
                >
                  {priceChangePercent > 0 ? '+' : ''}
                  {priceChangePercent.toFixed(2)}%
                </span>
              )}
            </p>
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
            onClick={() => setShowForm(!showForm)}
            disabled={isLimitReached && !showForm}
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
        />
      )}
    </li>
  );
}
