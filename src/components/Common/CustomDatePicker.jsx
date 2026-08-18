import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  X, 
  ChevronDown
} from 'lucide-react';
import './CustomDatePicker.css';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const SHORT_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

const DAYS_OF_WEEK = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

// Helper to parse 'YYYY-MM-DD' to Date object
const parseISODate = (isoStr) => {
  if (!isoStr) return null;
  const parts = String(isoStr).split('-');
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d;
  }
  const fallback = new Date(isoStr);
  return isNaN(fallback.getTime()) ? null : fallback;
};

// Helper to format Date object to 'YYYY-MM-DD'
const formatToISO = (date) => {
  if (!date || isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// Helper to display friendly date (e.g. "18 Aug 2026")
const formatDisplayDate = (isoStr) => {
  if (!isoStr) return '';
  const date = parseISODate(isoStr);
  if (!date) return isoStr;
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
};

const CustomDatePicker = ({
  value, // 'YYYY-MM-DD' string
  onChange,
  placeholder = 'Select date...',
  disabled = false,
  readOnly = false,
  name,
  id,
  minDate,
  maxDate,
  className = '',
  size = 'md', // 'sm' | 'md' | 'lg'
  showShortcuts = true,
  clearable = true,
  align = 'auto', // 'auto' | 'left' | 'right'
  style = {}
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const datePickerRef = useRef(null);

  // Parse current selected date
  const selectedDateObj = useMemo(() => parseISODate(value), [value]);

  // Calendar navigation state (current view month and year)
  const [viewDate, setViewDate] = useState(() => {
    return selectedDateObj || new Date();
  });

  // When value changes from outside, sync viewDate
  useEffect(() => {
    if (selectedDateObj) {
      setViewDate(new Date(selectedDateObj.getFullYear(), selectedDateObj.getMonth(), 1));
    }
  }, [value]);

  // Close popover when clicked outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (datePickerRef.current && !datePickerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentYear = viewDate.getFullYear();
  const currentMonth = viewDate.getMonth();

  // Navigation handlers
  const handlePrevMonth = (e) => {
    e.stopPropagation();
    setViewDate(new Date(currentYear, currentMonth - 1, 1));
  };

  const handleNextMonth = (e) => {
    e.stopPropagation();
    setViewDate(new Date(currentYear, currentMonth + 1, 1));
  };

  const handleYearChange = (e) => {
    const newYear = parseInt(e.target.value, 10);
    setViewDate(new Date(newYear, currentMonth, 1));
  };

  const handleMonthChange = (e) => {
    const newMonth = parseInt(e.target.value, 10);
    setViewDate(new Date(currentYear, newMonth, 1));
  };

  // Emit change event
  const emitChange = (isoString) => {
    if (disabled || readOnly) return;
    if (onChange) {
      const syntheticEvent = {
        target: {
          name: name || '',
          value: isoString
        }
      };
      onChange(syntheticEvent);
    }
    setIsOpen(false);
  };

  // Date selection click
  const handleSelectDay = (dayNum, e) => {
    e.stopPropagation();
    const chosen = new Date(currentYear, currentMonth, dayNum);
    const iso = formatToISO(chosen);
    emitChange(iso);
  };

  // Shortcuts
  const handleToday = (e) => {
    e.stopPropagation();
    const today = new Date();
    emitChange(formatToISO(today));
    setViewDate(new Date(today.getFullYear(), today.getMonth(), 1));
  };

  const handleYesterday = (e) => {
    e.stopPropagation();
    const d = new Date();
    d.setDate(d.getDate() - 1);
    emitChange(formatToISO(d));
    setViewDate(new Date(d.getFullYear(), d.getMonth(), 1));
  };

  const handleTomorrow = (e) => {
    e.stopPropagation();
    const d = new Date();
    d.setDate(d.getDate() + 1);
    emitChange(formatToISO(d));
    setViewDate(new Date(d.getFullYear(), d.getMonth(), 1));
  };

  const handleClear = (e) => {
    e.stopPropagation();
    emitChange('');
  };

  // Generate calendar grid days
  const calendarDays = useMemo(() => {
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay(); // 0 = Sun
    const daysInCurrentMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();

    const minDateObj = parseISODate(minDate);
    const maxDateObj = parseISODate(maxDate);

    const days = [];

    // Previous month padding days
    for (let i = firstDayOfMonth - 1; i >= 0; i--) {
      days.push({
        day: daysInPrevMonth - i,
        isCurrentMonth: false,
        isPrev: true
      });
    }

    // Current month days
    const todayISO = formatToISO(new Date());
    const selectedISO = value;

    for (let d = 1; d <= daysInCurrentMonth; d++) {
      const dateObj = new Date(currentYear, currentMonth, d);
      const iso = formatToISO(dateObj);

      let isDisabled = false;
      if (minDateObj && dateObj < new Date(minDateObj.getFullYear(), minDateObj.getMonth(), minDateObj.getDate())) {
        isDisabled = true;
      }
      if (maxDateObj && dateObj > new Date(maxDateObj.getFullYear(), maxDateObj.getMonth(), maxDateObj.getDate())) {
        isDisabled = true;
      }

      days.push({
        day: d,
        isCurrentMonth: true,
        isToday: iso === todayISO,
        isSelected: iso === selectedISO,
        isDisabled: isDisabled,
        isoString: iso
      });
    }

    // Next month padding days to complete 35 or 42 grid cells
    const remaining = (7 - (days.length % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      days.push({
        day: i,
        isCurrentMonth: false,
        isNext: true
      });
    }

    return days;
  }, [currentYear, currentMonth, value, minDate, maxDate]);

  // Year options list for fast jumping (past 10 years to next 5 years)
  const yearOptions = useMemo(() => {
    const thisYear = new Date().getFullYear();
    const years = [];
    for (let y = thisYear - 10; y <= thisYear + 5; y++) {
      years.push(y);
    }
    return years;
  }, []);

  return (
    <div 
      className={`custom-datepicker-root size-${size} ${isOpen ? 'is-open' : ''} ${disabled ? 'is-disabled' : ''} ${readOnly ? 'is-readonly' : ''} ${className}`}
      ref={datePickerRef}
      style={style}
    >
      {/* Hidden input for form submit serialization */}
      {name && (
        <input 
          type="hidden" 
          name={name} 
          id={id} 
          value={value || ''} 
        />
      )}

      {/* Trigger Button */}
      <div 
        className="custom-datepicker-trigger"
        onClick={() => !disabled && !readOnly && setIsOpen(!isOpen)}
        tabIndex={disabled || readOnly ? -1 : 0}
        role="button"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        <div className="custom-datepicker-content">
          <CalendarIcon size={14} className="custom-datepicker-icon" />
          <span className={`custom-datepicker-text ${!value ? 'is-placeholder' : ''}`}>
            {value ? formatDisplayDate(value) : placeholder}
          </span>
        </div>

        <div className="custom-datepicker-actions">
          {clearable && value && !disabled && !readOnly && (
            <button 
              type="button" 
              className="custom-datepicker-clear-btn"
              onClick={handleClear}
              title="Clear date"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Floating Interactive Calendar Popover */}
      {isOpen && (
        <div className={`custom-datepicker-popover align-${align}`} role="dialog">
          
          {/* Calendar Header with Month/Year Switchers */}
          <div className="custom-datepicker-header">
            <button 
              type="button" 
              className="datepicker-nav-btn" 
              onClick={handlePrevMonth}
              title="Previous Month"
            >
              <ChevronLeft size={15} />
            </button>

            <div className="datepicker-selectors">
              <div className="datepicker-select-pill">
                <select 
                  value={currentMonth} 
                  onChange={handleMonthChange}
                  className="datepicker-month-select"
                  onClick={(e) => e.stopPropagation()}
                >
                  {MONTH_NAMES.map((m, idx) => (
                    <option key={m} value={idx}>{SHORT_MONTHS[idx]}</option>
                  ))}
                </select>
                <ChevronDown size={12} className="datepicker-pill-chevron" />
              </div>

              <div className="datepicker-select-pill">
                <select 
                  value={currentYear} 
                  onChange={handleYearChange}
                  className="datepicker-year-select"
                  onClick={(e) => e.stopPropagation()}
                >
                  {yearOptions.map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
                <ChevronDown size={12} className="datepicker-pill-chevron" />
              </div>
            </div>

            <button 
              type="button" 
              className="datepicker-nav-btn" 
              onClick={handleNextMonth}
              title="Next Month"
            >
              <ChevronRight size={15} />
            </button>
          </div>

          {/* Quick Preset Shortcuts */}
          {showShortcuts && (
            <div className="datepicker-shortcuts-bar">
              <button type="button" className="datepicker-shortcut-chip" onClick={handleToday}>
                Today
              </button>
              <button type="button" className="datepicker-shortcut-chip" onClick={handleTomorrow}>
                Tomorrow
              </button>
              <button type="button" className="datepicker-shortcut-chip" onClick={handleYesterday}>
                Yesterday
              </button>
              {value && (
                <button type="button" className="datepicker-shortcut-chip clear" onClick={handleClear}>
                  Clear
                </button>
              )}
            </div>
          )}

          {/* Weekday Header */}
          <div className="datepicker-weekdays-grid">
            {DAYS_OF_WEEK.map((d, i) => (
              <span key={d} className={`datepicker-weekday ${i === 0 ? 'sun' : ''}`}>{d}</span>
            ))}
          </div>

          {/* Days Grid */}
          <div className="datepicker-days-grid">
            {calendarDays.map((item, idx) => {
              if (!item.isCurrentMonth) {
                return (
                  <span key={idx} className="datepicker-day other-month">
                    {item.day}
                  </span>
                );
              }

              return (
                <button
                  key={item.isoString || idx}
                  type="button"
                  className={`datepicker-day ${item.isSelected ? 'is-selected' : ''} ${item.isToday ? 'is-today' : ''} ${item.isDisabled ? 'is-disabled' : ''}`}
                  onClick={(e) => !item.isDisabled && handleSelectDay(item.day, e)}
                  disabled={item.isDisabled}
                >
                  {item.day}
                </button>
              );
            })}
          </div>

          {/* Footer with Selected Value Info */}
          {value && (
            <div className="datepicker-footer">
              <span className="datepicker-footer-label">
                Selected: <strong>{formatDisplayDate(value)}</strong>
              </span>
            </div>
          )}

        </div>
      )}
    </div>
  );
};

export default CustomDatePicker;
