// CustomDropdown.js
import React, { useRef, useState, useEffect } from 'react';

const Dropdown = ({ options, value, onChange, placeholder = 'Select an option' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const selectedOption = options.find(option => option.value === value);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const toggleDropdown = () => {
    setIsOpen(!isOpen);
  };

  const handleOptionClick = (optionValue) => {
    onChange(optionValue);
    setIsOpen(false);
  };

  return (
    <div 
      ref={dropdownRef}
      style={{
        position: 'relative',
        width: '100%'
      }}
    >
      {/* Dropdown trigger */}
      <div 
        onClick={toggleDropdown}
        style={{
          width: '100%',
          padding: '10px',
          backgroundColor: 'white',
          color: 'black',
          border: '1px solid #ccc',
          borderRadius: '4px',
          fontFamily: 'Saira, sans-serif',
          fontSize: '14px',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          boxSizing: 'border-box'
        }}
      >
        <span>{selectedOption?.label || placeholder}</span>
        <span style={{
          width: 0,
          height: 0,
          borderLeft: '6px solid transparent',
          borderRight: '6px solid transparent',
          borderTop: '6px solid #666',
          transition: 'transform 0.2s',
          transform: isOpen ? 'rotate(180deg)' : 'rotate(0)'
        }}></span>
      </div>
      
      {/* Dropdown menu */}
      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          fontSize: '14px',
          width: '100%',
          backgroundColor: 'white',
          border: '1px solid #ccc',
          borderTop: 'none',
          borderRadius: '0 0 4px 4px',
          boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
          zIndex: 120,
          maxHeight: '200px',
          overflowY: 'auto',
          boxSizing: 'border-box'
        }}>
          {options.map((option) => (
            <div 
              key={option.value}
              onClick={() => handleOptionClick(option.value)}
              style={{
                padding: '8px',
                cursor: 'pointer',
                backgroundColor: option.value === value ? '#f0f0f0' : 'white',
                color: 'black',
                borderBottom: '1px solid #eee',
                transition: 'background-color 0.2s'
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f5f5f5'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = option.value === value ? '#f0f0f0' : 'white'}
            >
              {option.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Dropdown;