import { useState, useEffect, useRef } from 'react';
import PriceAlertForm from './PriceAlertForm';
import './CryptoCard.css';

export default function CryptoCard({
  name,
  symbol,
  pair,
  price,
  previousPrice,
  targetPrices,
  onAddAlert,
  onRemoveAlert,
  lastTriggeredPrice,
}) {
  const [showForm, setShowForm] = useState(false);
  const [priceIndicatorClass, setPriceIndicatorClass] = useState('');
  const inputRef = useRef(null);

  // Используем useEffect для установки фокуса
  useEffect(() => {
    if (showForm && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showForm]);

  // Эффект для обновления и сброса класса индикации цены
  useEffect(() => {
    // Не делаем ничего, если нет предыдущей цены для сравнения
    if (previousPrice === null || price === null) {
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
      // 1. Устанавливаем класс
      setPriceIndicatorClass(newClass);
    }
  }, [price, previousPrice]); // Эффект зависит от изменения цены

  const finalPriceClassName = `crypto-card-price ${priceIndicatorClass}`.trim();

  return (
    <div className="crypto-card">
      <div className="crypto-card-header">
        <p className="pair-name">{pair}</p>
        <h3>
          {name} ({symbol})
        </h3>
      </div>
      <div className="crypto-card-body">
        <span>
          <p className={finalPriceClassName}>
            ${price !== null ? price.toFixed(5) : 'N/A'}
          </p>
          {lastTriggeredPrice && (
            <p className="last-triggered-alert-price">
              ${lastTriggeredPrice.toFixed(5)}
            </p>
          )}
          <button
            className="crypto-card-btn"
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? 'Скрыть форму' : 'Добавить цель'}
          </button>
        </span>
        {targetPrices.length > 0 && (
          <div className="target-prices-list">
            <p>Целевые цены:</p>
            <ul>
              {targetPrices.map((alert) => (
                <li key={alert.price}>
                  {alert.price.toFixed(5)} USDT
                  <button
                    className="remove-target-btn"
                    onClick={() => onRemoveAlert(pair, alert.price)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {showForm && (
        <PriceAlertForm
          pair={pair}
          onAddAlert={onAddAlert}
          inputRef={inputRef}
        />
      )}
    </div>
  );
}
