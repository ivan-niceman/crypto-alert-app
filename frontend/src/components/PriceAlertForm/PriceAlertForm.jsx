import { useState, useEffect } from 'react';

export default function PriceAlertForm({
  pair,
  onAddAlert,
  inputRef,
  defaultValue = '',
}) {
  const [inputValue, setInputValue] = useState(defaultValue);

  useEffect(() => {
    setInputValue(defaultValue);
  }, [defaultValue]);

  const handleChange = (e) => {
    let val = e.target.value.replace(',', '.');
    // Проверяем, что в строке не больше одной точки
    if ((val.match(/\./g) || []).length > 1) {
      // Если пользователь пытается ввести вторую точку, игнорируем ввод
      return;
    }
    // Используем регулярное выражение для разрешения только цифр и точки
    if (/^\d*\.?\d{0,5}$/.test(val) && val.length <= 15) {
      setInputValue(val);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const price = parseFloat(inputValue);
    if (!isNaN(price) && price > 0) {
      onAddAlert(pair, price);
      setInputValue('');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="alert-form">
      <input
        type="text"
        value={inputValue}
        onChange={handleChange}
        placeholder="Введите цену"
        inputMode="decimal"
        ref={inputRef}
      />
      <button className="alert-form-btn" type="submit" disabled={!inputValue}>
        Добавить
      </button>
    </form>
  );
}
