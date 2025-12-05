'use client';

import { useState, useRef, useEffect } from 'react';

export default function DatePicker({ selectedDate, onDateChange }) {
  const scrollRef = useRef(null);
  const [viewDate, setViewDate] = useState(() => {
    // Start with selected date's month/year, or default to a date with games
    const selected = selectedDate ? new Date(selectedDate + 'T12:00:00') : new Date();
    return { month: selected.getMonth(), year: selected.getFullYear() };
  });

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  // Generate years from 2015 to current year
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear - 2014 }, (_, i) => 2015 + i);

  // Generate dates for the selected month
  const generateDatesForMonth = () => {
    const dates = [];
    const firstDay = new Date(viewDate.year, viewDate.month, 1);
    const lastDay = new Date(viewDate.year, viewDate.month + 1, 0);

    for (let d = 1; d <= lastDay.getDate(); d++) {
      dates.push(new Date(viewDate.year, viewDate.month, d));
    }

    return dates;
  };

  const dates = generateDatesForMonth();

  const formatDateForAPI = (date) => {
    return date.toISOString().split('T')[0];
  };

  const formatDayOfWeek = (date) => {
    return date.toLocaleDateString('en-US', { weekday: 'short' });
  };

  const isToday = (date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const isSelected = (date) => {
    return formatDateForAPI(date) === selectedDate;
  };

  const handlePrevMonth = () => {
    setViewDate(prev => {
      if (prev.month === 0) {
        return { month: 11, year: prev.year - 1 };
      }
      return { ...prev, month: prev.month - 1 };
    });
  };

  const handleNextMonth = () => {
    setViewDate(prev => {
      if (prev.month === 11) {
        return { month: 0, year: prev.year + 1 };
      }
      return { ...prev, month: prev.month + 1 };
    });
  };

  const handleMonthChange = (e) => {
    setViewDate(prev => ({ ...prev, month: parseInt(e.target.value) }));
  };

  const handleYearChange = (e) => {
    setViewDate(prev => ({ ...prev, year: parseInt(e.target.value) }));
  };

  const handleQuickSelect = (preset) => {
    let date;
    switch (preset) {
      case 'today':
        date = new Date();
        break;
      case 'yesterday':
        date = new Date();
        date.setDate(date.getDate() - 1);
        break;
      case 'worldseries2024':
        date = new Date(2024, 9, 30); // Oct 30, 2024 - World Series Game 5
        break;
      case 'allstar2024':
        date = new Date(2024, 6, 16); // July 16, 2024 - All-Star Game
        break;
      default:
        return;
    }
    setViewDate({ month: date.getMonth(), year: date.getFullYear() });
    onDateChange(formatDateForAPI(date));
  };

  // Scroll to selected date when month changes
  useEffect(() => {
    if (scrollRef.current) {
      const selectedElement = scrollRef.current.querySelector('[data-selected="true"]');
      if (selectedElement) {
        selectedElement.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    }
  }, [viewDate]);

  return (
    <div className="w-full space-y-4">
      {/* Quick select buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => handleQuickSelect('today')}
          className="px-3 py-1.5 rounded-full text-sm font-medium bg-mlb-charcoal text-gray-300 hover:bg-gray-700 transition-colors"
        >
          Today
        </button>
        <button
          onClick={() => handleQuickSelect('yesterday')}
          className="px-3 py-1.5 rounded-full text-sm font-medium bg-mlb-charcoal text-gray-300 hover:bg-gray-700 transition-colors"
        >
          Yesterday
        </button>
        <button
          onClick={() => handleQuickSelect('worldseries2024')}
          className="px-3 py-1.5 rounded-full text-sm font-medium bg-mlb-red/20 text-mlb-red hover:bg-mlb-red/30 transition-colors"
        >
          2024 World Series
        </button>
        <button
          onClick={() => handleQuickSelect('allstar2024')}
          className="px-3 py-1.5 rounded-full text-sm font-medium bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors"
        >
          2024 All-Star Game
        </button>
      </div>

      {/* Month/Year selector */}
      <div className="flex items-center justify-between bg-mlb-charcoal rounded-xl p-3">
        <button
          onClick={handlePrevMonth}
          className="p-2 rounded-lg hover:bg-gray-700 transition-colors"
        >
          <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <div className="flex items-center gap-2">
          <select
            value={viewDate.month}
            onChange={handleMonthChange}
            className="bg-gray-700 text-white rounded-lg px-3 py-2 font-medium cursor-pointer hover:bg-gray-600 transition-colors"
          >
            {months.map((month, index) => (
              <option key={month} value={index}>{month}</option>
            ))}
          </select>

          <select
            value={viewDate.year}
            onChange={handleYearChange}
            className="bg-gray-700 text-white rounded-lg px-3 py-2 font-medium cursor-pointer hover:bg-gray-600 transition-colors"
          >
            {years.map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        </div>

        <button
          onClick={handleNextMonth}
          className="p-2 rounded-lg hover:bg-gray-700 transition-colors"
        >
          <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Scrollable date bar */}
      <div
        ref={scrollRef}
        className="flex gap-2 overflow-x-auto hide-scrollbar pb-2"
      >
        {dates.map((date) => (
          <button
            key={formatDateForAPI(date)}
            data-selected={isSelected(date)}
            onClick={() => onDateChange(formatDateForAPI(date))}
            className={`flex-shrink-0 flex flex-col items-center justify-center w-14 h-16 rounded-xl transition-all ${
              isSelected(date)
                ? 'bg-mlb-red text-white scale-105 shadow-lg shadow-mlb-red/30'
                : isToday(date)
                ? 'bg-mlb-green/20 text-mlb-green hover:bg-mlb-green/30'
                : 'bg-mlb-charcoal text-gray-300 hover:bg-gray-700'
            }`}
          >
            <span className="text-xs font-medium">{formatDayOfWeek(date)}</span>
            <span className="text-xl font-bold">{date.getDate()}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
