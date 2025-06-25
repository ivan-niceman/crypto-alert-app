import { useState } from 'react';
import './PriceAlertForm.css';

export default function PriceAlertForm({ pair, onAddAlert, inputRef }) {
  const [inputValue, setInputValue] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (inputValue) {
      onAddAlert(pair, parseFloat(inputValue));
      setInputValue('');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="alert-form">
      <input
        type="number"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        placeholder="Введите целевую цену"
        step="any"
        ref={inputRef}
        required
      />
      <button type="submit">Добавить</button>
    </form>
  );
}
