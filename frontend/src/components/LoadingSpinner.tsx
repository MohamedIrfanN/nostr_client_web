import React from 'react';

interface LoadingSpinnerProps {
  size?: 'small' | 'medium' | 'large';
  color?: string;
  className?: string;
  label?: string;
  padding?: string;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'medium',
  color = 'var(--accent-color, #7c4dff)',
  className = '',
  label,
  padding = '20px'
}) => {
  const sizeMap = {
    small: '16px',
    medium: '32px',
    large: '48px'
  };

  const spinnerSize = sizeMap[size];

  return (
    <div
      className={`spinner-container ${className}`}
      style={{ padding }}
    >
      <div className="spinner-orbit">
        <div
          className="spinner-inner"
          style={{
            width: spinnerSize,
            height: spinnerSize,
            borderTopColor: color,
            borderRightColor: 'rgba(255, 255, 255, 0.1)',
            borderBottomColor: 'rgba(255, 255, 255, 0.1)',
            borderLeftColor: 'rgba(255, 255, 255, 0.1)'
          }}
        />
      </div>
      {label && <div className="spinner-label">{label}</div>}
    </div>
  );
};

export default LoadingSpinner;
