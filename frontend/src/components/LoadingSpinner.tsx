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
        <div className={`spinner-container ${className}`}>
            <div className="spinner-orbit">
                <div
                    className="spinner-inner"
                    style={{
                        width: spinnerSize,
                        height: spinnerSize,
                        borderTopColor: color
                    }}
                />
            </div>
            {label && <div className="spinner-label">{label}</div>}

            <style>{`
        .spinner-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: ${padding};
        }

        .spinner-orbit {
          position: relative;
        }

        .spinner-inner {
          border: 3px solid rgba(255, 255, 255, 0.1);
          border-top: 3px solid;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        .spinner-label {
          font-size: 14px;
          color: var(--text-muted);
          font-weight: 500;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
        </div>
    );
};

export default LoadingSpinner;
