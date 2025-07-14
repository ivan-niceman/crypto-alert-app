import { useState, useRef } from 'react';
import { CSSTransition } from 'react-transition-group';
import { useOnClickOutside } from '../../hooks/useOnClickOutside';

const sortOptions = [
  { value: 'pair', label: 'По имени' },
  { value: 'price', label: 'По цене' },
  { value: 'priceChangePercent', label: 'По % изменения' },
];

export default function SortControls({ sortConfig, setSortConfig }) {
  // 1. Состояние для видимости выпадающего меню
  const [isOpen, setIsOpen] = useState(false);

  // 2. Ref для меню и для CSSTransition
  const dropdownRef = useRef(null);
  const nodeRef = useRef(null);

  // 3. Используем хук, чтобы закрывать меню по клику вне его
  useOnClickOutside(dropdownRef, () => setIsOpen(false));

  const handleOptionClick = (key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
    // setIsOpen(false); // Закрываем меню после выбора
  };

  return (
    <div className="sort-controls-wrapper" ref={dropdownRef}>
      <button
        type="button"
        className={`sort-trigger-btn ${isOpen ? 'active' : ''}`}
        onClick={() => setIsOpen((prev) => !prev)}
        title="Настройки сортировки"
      >
        <span></span>
        <span></span>
        <span></span>
      </button>
      <CSSTransition
        in={isOpen}
        nodeRef={nodeRef}
        timeout={200}
        classNames="sort-menu"
        unmountOnExit
      >
        <div className="sort-menu" ref={nodeRef}>
          <div className="sort-menu-header">Сортировка</div>
          <ul className="sort-menu-list">
            {sortOptions.map((option) => (
              <li key={option.value} className="sort-menu-item">
                <button
                  onClick={() => handleOptionClick(option.value)}
                  className={sortConfig.key === option.value ? 'active' : ''}
                >
                  {option.label}
                  {sortConfig.key === option.value && (
                    <span className="sort-indicator">
                      {sortConfig.direction === 'ascending' ? '▲' : '▼'}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </CSSTransition>
    </div>
  );
}
