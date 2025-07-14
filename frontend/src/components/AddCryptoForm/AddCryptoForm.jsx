import { useState, useEffect, useRef, forwardRef } from 'react'; // 1. Импортируем forwardRef
import './AddCryptoForm.css';

// 2. Оборачиваем компонент в forwardRef и принимаем 'ref' как второй аргумент
const AddCryptoForm = forwardRef(({ onAdd, onCancel, isAdding }, ref) => {
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (inputValue.trim() && !isAdding) {
      onAdd(inputValue.trim());
    }
  };

  return (
    // 3. Прикрепляем полученный ref к корневому DOM-элементу
    <div className="add-crypto-form-overlay" onClick={onCancel}>
      <div
        className="add-crypto-form-content"
        onClick={(e) => e.stopPropagation()}
        ref={ref}
      >
        <h3>Добавить монету</h3>
        <p>Введите официальный тикер (например BTC, ETH)</p>
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Тикер..."
            maxLength="10"
            autoComplete="off"
            disabled={isAdding}
          />
          <div className="form-buttons">
            <button
              type="button"
              onClick={onCancel}
              className="cancel-btn"
              disabled={isAdding}
            >
              Отмена
            </button>
            <button
              type="submit"
              className="submit-btn"
              disabled={!inputValue.trim() || isAdding}
            >
              {isAdding ? 'Проверка...' : 'Добавить'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
});

export default AddCryptoForm;
