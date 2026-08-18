import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Search, X } from 'lucide-react';
import './CustomDropdown.css';

/**
 * Universal Custom Dropdown Component
 * Replaces native <select> elements across the application
 */
const CustomDropdown = ({
  options = [],
  children,
  value,
  onChange,
  placeholder = 'Select an option',
  disabled = false,
  searchable,
  name,
  id,
  className = '',
  icon = null,
  clearable = false,
  size = 'md', // 'sm' | 'md' | 'lg'
  style = {}
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef(null);
  const searchInputRef = useRef(null);

  // Normalize options: parse from `options` prop or from `children` (<option> tags)
  const normalizedOptions = React.useMemo(() => {
    if (options && options.length > 0) {
      return options.map(opt => {
        if (typeof opt === 'object' && opt !== null) {
          return {
            value: opt.value !== undefined ? opt.value : opt.id,
            label: opt.label || opt.name || String(opt.value),
            icon: opt.icon,
            badge: opt.badge,
            disabled: opt.disabled || false
          };
        }
        return {
          value: opt,
          label: String(opt),
          disabled: false
        };
      });
    }

    if (children) {
      const childOpts = [];
      React.Children.forEach(children, child => {
        if (React.isValidElement(child) && child.type === 'option') {
          childOpts.push({
            value: child.props.value !== undefined ? child.props.value : child.props.children,
            label: child.props.children || String(child.props.value),
            disabled: child.props.disabled || false
          });
        }
      });
      return childOpts;
    }

    return [];
  }, [options, children]);

  // Determine if search should be enabled (explicit prop or > 6 options)
  const isSearchable = searchable !== undefined ? searchable : normalizedOptions.length > 6;

  // Filter options by search query
  const filteredOptions = React.useMemo(() => {
    if (!searchQuery.trim()) return normalizedOptions;
    const q = searchQuery.toLowerCase().trim();
    return normalizedOptions.filter(opt => 
      String(opt.label).toLowerCase().includes(q) || 
      String(opt.value).toLowerCase().includes(q)
    );
  }, [normalizedOptions, searchQuery]);

  // Find currently selected option
  const selectedOption = normalizedOptions.find(opt => String(opt.value) === String(value));

  // Close when clicked outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus search input when opening
  useEffect(() => {
    if (isOpen && isSearchable && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen, isSearchable]);

  const handleSelect = (opt, e) => {
    if (e) e.stopPropagation();
    if (opt.disabled || disabled) return;

    if (onChange) {
      // Provide synthetic event-like object for backwards compatibility with existing handleInputChange(e)
      const syntheticEvent = {
        target: {
          name: name || '',
          value: opt.value,
          label: opt.label
        }
      };
      onChange(syntheticEvent);
    }

    setIsOpen(false);
    setSearchQuery('');
  };

  const handleClear = (e) => {
    e.stopPropagation();
    if (disabled) return;
    if (onChange) {
      onChange({ target: { name: name || '', value: '' } });
    }
  };

  const handleKeyDown = (e) => {
    if (disabled) return;
    if (e.key === 'Escape') {
      setIsOpen(false);
    } else if (e.key === 'Enter' || e.key === ' ') {
      if (!isOpen) {
        setIsOpen(true);
        e.preventDefault();
      }
    }
  };

  return (
    <div 
      className={`custom-dropdown-root size-${size} ${isOpen ? 'is-open' : ''} ${disabled ? 'is-disabled' : ''} ${className}`} 
      ref={dropdownRef}
      style={style}
    >
      {/* Hidden input for form submit serialization */}
      {name && (
        <input 
          type="hidden" 
          name={name} 
          id={id} 
          value={value !== undefined && value !== null ? value : ''} 
        />
      )}

      {/* Main Trigger Button */}
      <div 
        className="custom-dropdown-trigger" 
        onClick={() => !disabled && setIsOpen(!isOpen)}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={handleKeyDown}
        role="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <div className="custom-dropdown-value-container">
          {icon && <span className="custom-dropdown-lead-icon">{icon}</span>}
          {selectedOption?.icon && <span className="custom-dropdown-opt-icon">{selectedOption.icon}</span>}
          
          <span className={`custom-dropdown-text ${!selectedOption ? 'is-placeholder' : ''}`}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>

          {selectedOption?.badge && (
            <span className="custom-dropdown-badge">{selectedOption.badge}</span>
          )}
        </div>

        <div className="custom-dropdown-actions">
          {clearable && value && !disabled && (
            <button 
              type="button" 
              className="custom-dropdown-clear-btn" 
              onClick={handleClear}
              title="Clear selection"
            >
              <X size={13} />
            </button>
          )}
          <ChevronDown size={15} className={`custom-dropdown-chevron ${isOpen ? 'is-open' : ''}`} />
        </div>
      </div>

      {/* Floating Dropdown Popover */}
      {isOpen && (
        <div className="custom-dropdown-popover" role="listbox">
          {isSearchable && (
            <div className="custom-dropdown-search-wrap">
              <Search size={13} className="custom-dropdown-search-icon" />
              <input 
                type="text" 
                ref={searchInputRef}
                className="custom-dropdown-search-input" 
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
              {searchQuery && (
                <button 
                  type="button" 
                  className="custom-dropdown-search-clear" 
                  onClick={() => setSearchQuery('')}
                >
                  ×
                </button>
              )}
            </div>
          )}

          <div className="custom-dropdown-options-list">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt, idx) => {
                const isSelected = String(opt.value) === String(value);
                return (
                  <div 
                    key={opt.value !== undefined ? String(opt.value) : idx}
                    className={`custom-dropdown-option ${isSelected ? 'is-selected' : ''} ${opt.disabled ? 'is-disabled' : ''}`}
                    onClick={(e) => handleSelect(opt, e)}
                    role="option"
                    aria-selected={isSelected}
                  >
                    <div className="custom-dropdown-option-left">
                      {opt.icon && <span className="custom-dropdown-opt-icon">{opt.icon}</span>}
                      <span className="custom-dropdown-option-label">{opt.label}</span>
                      {opt.badge && <span className="custom-dropdown-badge">{opt.badge}</span>}
                    </div>

                    {isSelected && (
                      <Check size={14} className="custom-dropdown-check-icon" />
                    )}
                  </div>
                );
              })
            ) : (
              <div className="custom-dropdown-empty">
                No matching options found
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomDropdown;
