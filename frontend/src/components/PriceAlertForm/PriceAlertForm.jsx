import { useState } from 'react';

export default function PriceAlertForm({ pair, onAddAlert, inputRef }) {
  const [inputValue, setInputValue] = useState('');

  // Обработчик изменения значения в поле ввода
  const handleChange = (e) => {
    // Ограничиваем длину строки 10 символами
    if (e.target.value.length <= 10) {
      setInputValue(e.target.value);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (inputValue) {
      onAddAlert(pair, inputValue);
      setInputValue('');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="alert-form">
      <input
        type="number"
        value={inputValue}
        onChange={handleChange}
        placeholder="Целевая цена"
        step="any"
        ref={inputRef}
        required
      />
      <button className="alert-form-btn" type="submit">
        Добавить
      </button>
    </form>
  );
}
