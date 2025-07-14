import { useEffect } from 'react';

// Хук, который вызывает колбэк при клике вне указанного ref элемента
export function useOnClickOutside(ref, handler) {
  useEffect(() => {
    const listener = (event) => {
      // Ничего не делаем, если клик внутри ref элемента или его дочерних элементов
      if (!ref.current || ref.current.contains(event.target)) {
        return;
      }
      handler(event);
    };

    document.addEventListener('mousedown', listener);
    document.addEventListener('touchstart', listener);

    return () => {
      document.removeEventListener('mousedown', listener);
      document.removeEventListener('touchstart', listener);
    };
  }, [ref, handler]);
}
