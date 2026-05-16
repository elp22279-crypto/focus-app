// src/components/ErrorBoundary.jsx
import React, { Component } from 'react';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Критический сбой UI:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-full bg-stone-950 flex flex-col items-center justify-center p-6 text-center z-50 fixed inset-0">
          <div className="bg-red-950 border border-red-900 rounded-xl p-6 max-w-sm w-full shadow-[0_0_50px_rgba(220,38,38,0.3)]">
            <h2 className="text-red-500 font-black uppercase text-lg mb-2">Отказ системы</h2>
            <p className="text-stone-400 text-xs mb-6">Произошла фатальная ошибка рендеринга. Данные защищены в хранилище Zustand. Перезагрузите интерфейс.</p>
            <button 
              onClick={() => window.location.reload()} 
              className="bg-red-900 hover:bg-red-800 active:scale-95 text-white text-xs font-bold px-4 py-3 rounded uppercase w-full transition-all"
            >
              Перезагрузить
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}