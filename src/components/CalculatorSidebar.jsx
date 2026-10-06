import React, { useState, useEffect, useRef } from 'react';
import { 
  Calculator, 
  X, 
  CornerDownLeft, 
  Copy, 
  Check, 
  RotateCcw, 
  Delete, 
  History, 
  Maximize2, 
  Minimize2,
  ArrowRight
} from 'lucide-react';

export default function CalculatorSidebar({ 
  isOpen, 
  onClose, 
  targetElement, 
  targetLabel, 
  onPasted 
}) {
  const [expression, setExpression] = useState('');
  const [displayValue, setDisplayValue] = useState('0');
  const [lastResult, setLastResult] = useState(null);
  const [isCalculated, setIsCalculated] = useState(false);
  const [history, setHistory] = useState(() => {
    try {
      const saved = localStorage.getItem('ct_calc_history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [showHistory, setShowHistory] = useState(false);
  const [feedback, setFeedback] = useState('');
  const sidebarRef = useRef(null);

  // Save history to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('ct_calc_history', JSON.stringify(history.slice(0, 30)));
    } catch (e) {
      // ignore
    }
  }, [history]);

  // Focus trap / keyboard listener when calculator is open
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      // Close on Esc
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }

      // If user presses F11 or Alt+C again, close calculator
      if (e.key === 'F11' || (e.altKey && (e.key === 'c' || e.key === 'C'))) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }

      // Handle numbers
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        handleDigit(e.key);
      } else if (e.key === '.') {
        e.preventDefault();
        handleDecimal();
      } else if (['+', '-', '*', '/'].includes(e.key)) {
        e.preventDefault();
        handleOperator(e.key);
      } else if (e.key === '%') {
        e.preventDefault();
        handlePercentage();
      } else if (e.key === 'Enter' || e.key === '=') {
        e.preventDefault();
        if (isCalculated && lastResult !== null) {
          // If already evaluated, Enter acts as Paste to Field!
          handlePasteResult();
        } else {
          handleEquals();
        }
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === 'Delete' || e.key.toLowerCase() === 'c') {
        e.preventDefault();
        handleClear();
      } else if (e.key === '(' || e.key === ')') {
        e.preventDefault();
        handleParenthesis(e.key);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, isCalculated, lastResult, displayValue, expression, targetElement]);

  const handleDigit = (digit) => {
    if (isCalculated) {
      setDisplayValue(digit);
      setExpression('');
      setIsCalculated(false);
      return;
    }
    if (displayValue === '0' || displayValue === 'Error') {
      setDisplayValue(digit);
    } else {
      setDisplayValue(displayValue + digit);
    }
  };

  const handleDecimal = () => {
    if (isCalculated) {
      setDisplayValue('0.');
      setExpression('');
      setIsCalculated(false);
      return;
    }
    if (!displayValue.includes('.')) {
      setDisplayValue(displayValue + '.');
    }
  };

  const handleOperator = (op) => {
    const symbolMap = { '+': '+', '-': '-', '*': '×', '/': '÷' };
    const displayOp = symbolMap[op] || op;

    if (isCalculated && lastResult !== null) {
      setExpression(`${lastResult} ${displayOp} `);
      setDisplayValue('0');
      setIsCalculated(false);
      return;
    }

    if (expression && (displayValue === '0' || displayValue === '')) {
      // Change operator if no new number entered
      const trimmed = expression.trim();
      const lastChar = trimmed.slice(-1);
      if (['+', '-', '×', '÷', '*', '/'].includes(lastChar)) {
        setExpression(trimmed.slice(0, -1) + `${displayOp} `);
        return;
      }
    }

    setExpression((prev) => `${prev}${displayValue} ${displayOp} `);
    setDisplayValue('0');
    setIsCalculated(false);
  };

  const handlePercentage = () => {
    const num = parseFloat(displayValue);
    if (isNaN(num)) return;

    if (expression) {
      // In a calculation like 1000 + 5%, percentage of previous number
      const parts = expression.trim().split(' ');
      const prevNum = parseFloat(parts[0]);
      const prevOp = parts[1];

      if (!isNaN(prevNum) && prevOp) {
        if (prevOp === '+' || prevOp === '-') {
          const percentVal = (prevNum * num) / 100;
          setDisplayValue(String(percentVal));
          return;
        } else if (prevOp === '×' || prevOp === '*' || prevOp === '÷' || prevOp === '/') {
          setDisplayValue(String(num / 100));
          return;
        }
      }
    }

    setDisplayValue(String(num / 100));
  };

  const handleParenthesis = (p) => {
    if (isCalculated) {
      setExpression(p);
      setDisplayValue('0');
      setIsCalculated(false);
      return;
    }
    setExpression((prev) => `${prev}${p} `);
  };

  const handleToggleSign = () => {
    if (displayValue === '0' || displayValue === 'Error') return;
    if (displayValue.startsWith('-')) {
      setDisplayValue(displayValue.slice(1));
    } else {
      setDisplayValue('-' + displayValue);
    }
  };

  const handleBackspace = () => {
    if (isCalculated) {
      handleClear();
      return;
    }
    if (displayValue.length > 1) {
      setDisplayValue(displayValue.slice(0, -1));
    } else {
      setDisplayValue('0');
    }
  };

  const handleClear = () => {
    setDisplayValue('0');
    setExpression('');
    setLastResult(null);
    setIsCalculated(false);
  };

  const handleClearEntry = () => {
    setDisplayValue('0');
  };

  const evaluateExpression = (exprStr) => {
    try {
      // Replace display operators with JS operators
      let clean = exprStr
        .replace(/×/g, '*')
        .replace(/÷/g, '/')
        .replace(/\s+/g, '');

      // Check for dangerous characters
      if (/[^0-9+\-*/.()]/.test(clean)) {
        return 'Error';
      }

      // Safe calculation via Function
      // eslint-disable-next-line no-new-func
      const result = Function(`"use strict"; return (${clean})`)();
      
      if (!isFinite(result) || isNaN(result)) {
        return 'Error';
      }

      // Clean float rounding
      const rounded = Math.round((result + Number.EPSILON) * 100000) / 100000;
      return rounded;
    } catch {
      return 'Error';
    }
  };

  const handleEquals = () => {
    const fullExpr = `${expression}${displayValue}`.trim();
    if (!fullExpr) return;

    const res = evaluateExpression(fullExpr);
    if (res === 'Error') {
      setDisplayValue('Error');
      setIsCalculated(true);
      return;
    }

    const resStr = String(res);
    setDisplayValue(resStr);
    setLastResult(res);
    setIsCalculated(true);

    // Add to history
    const historyItem = {
      id: Date.now(),
      expr: fullExpr,
      result: res,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setHistory(prev => [historyItem, ...prev.slice(0, 29)]);
  };

  // Paste result into target input field
  const handlePasteResult = (valueToPaste) => {
    const val = valueToPaste !== undefined ? valueToPaste : (isCalculated ? (lastResult !== null ? lastResult : displayValue) : evaluateExpression(`${expression}${displayValue}`));
    
    if (val === 'Error' || val === null || val === undefined) {
      setFeedback('⚠️ Invalid calculation result');
      setTimeout(() => setFeedback(''), 2000);
      return;
    }

    const cleanNum = typeof val === 'number' ? Math.round(val * 10000) / 10000 : val;
    const stringVal = String(cleanNum);

    // Always copy to clipboard for convenience
    try {
      navigator.clipboard?.writeText(stringVal);
    } catch (e) {
      // clipboard fallback
    }

    if (targetElement && (targetElement.tagName === 'INPUT' || targetElement.tagName === 'TEXTAREA') && !targetElement.disabled && !targetElement.readOnly) {
      try {
        targetElement.focus();
        
        // Trigger React's synthetic input tracker
        const prototype = targetElement instanceof HTMLTextAreaElement 
          ? window.HTMLTextAreaElement.prototype 
          : window.HTMLInputElement.prototype;
        const nativeSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

        if (nativeSetter) {
          nativeSetter.call(targetElement, stringVal);
        } else {
          targetElement.value = stringVal;
        }

        targetElement.dispatchEvent(new Event('input', { bubbles: true }));
        targetElement.dispatchEvent(new Event('change', { bubbles: true }));

        setFeedback(`✓ Pasted ${formatDisplay(cleanNum)} into ${targetLabel || 'field'}!`);
        if (onPasted) onPasted(cleanNum);

        setTimeout(() => {
          onClose();
          targetElement.focus();
        }, 350);
        return;
      } catch (err) {
        console.error('Error pasting into input:', err);
      }
    }

    // No target input: copied to clipboard
    setFeedback(`✓ Copied ${formatDisplay(cleanNum)} to clipboard!`);
    setTimeout(() => setFeedback(''), 2500);
  };

  const formatDisplay = (numStr) => {
    if (numStr === 'Error' || numStr === undefined || numStr === null) return 'Error';
    const s = String(numStr);
    const parts = s.split('.');
    const integerPart = parts[0];
    const decimalPart = parts.length > 1 ? '.' + parts[1] : '';

    const formattedInt = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return formattedInt + decimalPart;
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Subtle backdrop click to close (doesn't block view of the form) */}
      <div 
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.25)',
          backdropFilter: 'blur(1px)',
          zIndex: 11000
        }}
        onClick={onClose}
      />

      {/* Calculator Sidebar Drawer */}
      <div
        ref={sidebarRef}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: '350px',
          maxWidth: '92vw',
          background: '#0f172a',
          color: '#f8fafc',
          boxShadow: '-8px 0 25px rgba(0, 0, 0, 0.45)',
          zIndex: 11001,
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideInRight 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
          borderLeft: '1px solid #334155',
          userSelect: 'none'
        }}
        onClick={e => e.stopPropagation()}
      >
        <style>{`
          @keyframes slideInRight {
            from { transform: translateX(100%); }
            to { transform: translateX(0); }
          }
          .calc-btn {
            background: #1e293b;
            color: #f1f5f9;
            border: 1px solid #334155;
            border-radius: 8px;
            font-size: 1.15rem;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.1s ease;
            height: 48px;
          }
          .calc-btn:hover {
            background: #334155;
            border-color: #475569;
          }
          .calc-btn:active {
            transform: scale(0.96);
          }
          .calc-btn-op {
            background: #1e3a5f;
            color: #60a5fa;
            border-color: #2563eb;
            font-weight: 700;
          }
          .calc-btn-op:hover {
            background: #2563eb;
            color: #ffffff;
          }
          .calc-btn-action {
            background: #334155;
            color: #e2e8f0;
          }
          .calc-btn-action:hover {
            background: #475569;
            color: #ffffff;
          }
          .calc-btn-eq {
            background: #16a34a;
            color: #ffffff;
            border-color: #15803d;
            font-weight: 800;
            font-size: 1.35rem;
          }
          .calc-btn-eq:hover {
            background: #15803d;
          }
        `}</style>

        {/* Top Header */}
        <div style={{ padding: '0.85rem 1rem', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#0b1120' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1.25rem' }}>🧮</span>
            <div>
              <span style={{ fontWeight: 800, fontSize: '0.95rem', letterSpacing: '0.02em', color: '#f8fafc' }}>Quick Calculator</span>
              <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>Shortcut: <kbd style={{ background: '#1e293b', padding: '1px 5px', borderRadius: '4px', border: '1px solid #334155', color: '#38bdf8' }}>F11</kbd> or <kbd style={{ background: '#1e293b', padding: '1px 5px', borderRadius: '4px', border: '1px solid #334155', color: '#38bdf8' }}>Alt+C</kbd></div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <button
              className="calc-btn-action"
              onClick={() => setShowHistory(!showHistory)}
              title="Calculation History"
              style={{ padding: '0.35rem 0.5rem', borderRadius: '6px', border: '1px solid #334155', cursor: 'pointer', background: showHistory ? '#2563eb' : '#1e293b', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.72rem' }}
            >
              <History size={14} />
              <span>History</span>
            </button>
            <button
              onClick={onClose}
              title="Close (Esc)"
              style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '0.35rem', borderRadius: '6px', display: 'flex', alignItems: 'center' }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Target Input Status Badge */}
        <div style={{ padding: '0.55rem 1rem', background: '#131e33', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.76rem' }}>
          {targetElement ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: '#38bdf8', overflow: 'hidden' }}>
              <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', flexShrink: 0 }}></span>
              <span style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                Target: <strong style={{ color: '#ffffff' }}>{targetLabel || 'Active Input'}</strong>
              </span>
            </div>
          ) : (
            <div style={{ color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#64748b' }}></span>
              <span>General mode (will copy to clipboard)</span>
            </div>
          )}
          <span style={{ color: '#64748b', fontSize: '0.68rem', flexShrink: 0 }}>Press Enter to paste</span>
        </div>

        {/* History Panel (when toggled) */}
        {showHistory ? (
          <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem', background: '#0b1120', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.4rem', borderBottom: '1px solid #1e293b' }}>
              <span style={{ fontWeight: 700, fontSize: '0.8rem', color: '#94a3b8' }}>RECENT CALCULATIONS</span>
              {history.length > 0 && (
                <button
                  onClick={() => setHistory([])}
                  style={{ background: 'transparent', border: 'none', color: '#ef4444', fontSize: '0.7rem', cursor: 'pointer', fontWeight: 600 }}
                >
                  Clear All
                </button>
              )}
            </div>
            {history.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#64748b', fontSize: '0.82rem' }}>
                No calculations in history yet.
              </div>
            ) : (
              history.map(item => (
                <div
                  key={item.id}
                  style={{
                    background: '#1e293b',
                    borderRadius: '8px',
                    padding: '0.6rem 0.8rem',
                    border: '1px solid #334155',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                  onClick={() => {
                    setDisplayValue(String(item.result));
                    setLastResult(item.result);
                    setIsCalculated(true);
                    setShowHistory(false);
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#94a3b8' }}>
                    <span style={{ fontFamily: 'monospace' }}>{item.expr} =</span>
                    <span>{item.time}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.2rem' }}>
                    <span style={{ fontWeight: 800, fontSize: '1.1rem', color: '#38bdf8' }}>{formatDisplay(item.result)}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePasteResult(item.result);
                      }}
                      style={{ background: '#2563eb', border: 'none', color: '#fff', borderRadius: '4px', padding: '2px 8px', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer' }}
                    >
                      Paste
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          /* Main Calculator Display & Keypad */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '0.85rem', gap: '0.75rem' }}>
            {/* Screen */}
            <div style={{
              background: '#020617',
              borderRadius: '10px',
              padding: '0.85rem 1rem',
              border: '1px solid #1e293b',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
              minHeight: '85px',
              textAlign: 'right',
              boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.5)'
            }}>
              <div style={{
                fontSize: '0.82rem',
                color: '#94a3b8',
                minHeight: '1.2rem',
                fontFamily: 'monospace',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                {expression || ' '}
              </div>
              <div style={{
                fontSize: displayValue.length > 12 ? '1.45rem' : '1.95rem',
                fontWeight: 800,
                color: '#ffffff',
                fontFamily: 'monospace',
                letterSpacing: '-0.02em',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                marginTop: '0.2rem'
              }}>
                {formatDisplay(displayValue)}
              </div>
            </div>

            {/* Action Bar (Paste into Target / Copy) */}
            <button
              onClick={() => handlePasteResult()}
              style={{
                background: targetElement ? 'linear-gradient(135deg, #2563eb, #1d4ed8)' : 'linear-gradient(135deg, #059669, #047857)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '0.65rem 0.85rem',
                fontWeight: 700,
                fontSize: '0.88rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.35)',
                transition: 'all 0.15s ease'
              }}
              title="Paste computed value into the target field and return (or Press Enter)"
            >
              {targetElement ? (
                <>
                  <CornerDownLeft size={16} />
                  <span>Insert into {targetLabel || 'Field'} (Enter)</span>
                </>
              ) : (
                <>
                  <Copy size={16} />
                  <span>Copy Result to Clipboard (Enter)</span>
                </>
              )}
            </button>

            {/* Feedback Notification */}
            {feedback && (
              <div style={{
                background: '#15803d',
                color: '#ffffff',
                padding: '0.45rem 0.75rem',
                borderRadius: '6px',
                fontSize: '0.78rem',
                fontWeight: 600,
                textAlign: 'center',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
                animation: 'fadeIn 0.15s ease'
              }}>
                <Check size={14} />
                <span>{feedback}</span>
              </div>
            )}

            {/* Keypad Grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '0.45rem',
              flex: 1,
              marginTop: '0.2rem'
            }}>
              {/* Row 1 */}
              <button className="calc-btn calc-btn-action" onClick={handleClear} title="Clear (C / Del)">C</button>
              <button className="calc-btn calc-btn-action" onClick={handleClearEntry} title="Clear Entry">CE</button>
              <button className="calc-btn calc-btn-action" onClick={handlePercentage} title="Percentage (%)">%</button>
              <button className="calc-btn calc-btn-op" onClick={() => handleOperator('/')}>÷</button>

              {/* Row 2 */}
              <button className="calc-btn" onClick={() => handleDigit('7')}>7</button>
              <button className="calc-btn" onClick={() => handleDigit('8')}>8</button>
              <button className="calc-btn" onClick={() => handleDigit('9')}>9</button>
              <button className="calc-btn calc-btn-op" onClick={() => handleOperator('*')}>×</button>

              {/* Row 3 */}
              <button className="calc-btn" onClick={() => handleDigit('4')}>4</button>
              <button className="calc-btn" onClick={() => handleDigit('5')}>5</button>
              <button className="calc-btn" onClick={() => handleDigit('6')}>6</button>
              <button className="calc-btn calc-btn-op" onClick={() => handleOperator('-')}>−</button>

              {/* Row 4 */}
              <button className="calc-btn" onClick={() => handleDigit('1')}>1</button>
              <button className="calc-btn" onClick={() => handleDigit('2')}>2</button>
              <button className="calc-btn" onClick={() => handleDigit('3')}>3</button>
              <button className="calc-btn calc-btn-op" onClick={() => handleOperator('+')}>+</button>

              {/* Row 5 */}
              <button className="calc-btn" onClick={handleToggleSign} title="Negate (±)">±</button>
              <button className="calc-btn" onClick={() => handleDigit('0')}>0</button>
              <button className="calc-btn" onClick={handleDecimal}>.</button>
              <button className="calc-btn calc-btn-eq" onClick={handleEquals} title="Calculate (= / Enter)">=</button>
            </div>

            {/* Quick Helper Bar */}
            <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'space-between', paddingTop: '0.3rem' }}>
              <button 
                className="calc-btn calc-btn-action" 
                style={{ flex: 1, height: '36px', fontSize: '0.9rem' }} 
                onClick={() => handleParenthesis('(')}
              >
                (
              </button>
              <button 
                className="calc-btn calc-btn-action" 
                style={{ flex: 1, height: '36px', fontSize: '0.9rem' }} 
                onClick={() => handleParenthesis(')')}
              >
                )
              </button>
              <button 
                className="calc-btn calc-btn-action" 
                style={{ flex: 1, height: '36px', fontSize: '0.9rem' }} 
                onClick={handleBackspace}
                title="Backspace (⌫)"
              >
                <Delete size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Footer info */}
        <div style={{ padding: '0.6rem 1rem', borderTop: '1px solid #1e293b', background: '#0b1120', fontSize: '0.7rem', color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
          <span>Numpad & keyboard supported</span>
          <span>Esc to close</span>
        </div>
      </div>
    </>
  );
}
