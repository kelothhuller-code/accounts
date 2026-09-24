import React, { useState, useEffect, useRef } from 'react';
import { Lock, KeyRound, Eye, EyeOff, Coffee, ArrowRight, AlertCircle } from 'lucide-react';

export default function LoginScreen({ onLoginSuccess }) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isShaking, setIsShaking] = useState(false);
  const passwordInputRef = useRef(null);

  useEffect(() => {
    if (passwordInputRef.current) {
      passwordInputRef.current.focus();
    }
  }, []);

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    if (!password) {
      setErrorMsg('Please enter the system password.');
      triggerShake();
      return;
    }

    if (password === '121321') {
      setErrorMsg('');
      onLoginSuccess();
    } else {
      setErrorMsg('Incorrect password. Access denied.');
      triggerShake();
      setPassword('');
      if (passwordInputRef.current) passwordInputRef.current.focus();
    }
  };

  const triggerShake = () => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 500);
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      color: '#f8fafc',
      padding: '1.5rem',
      boxSizing: 'border-box'
    }}>
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-10px); }
          40%, 80% { transform: translateX(10px); }
        }
        .shake-animation {
          animation: shake 0.4s ease-in-out;
        }
        .login-input:focus {
          border-color: #3b82f6 !important;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.3) !important;
          outline: none;
        }
      `}</style>

      <div 
        className={isShaking ? 'shake-animation' : ''}
        style={{
          width: '100%',
          maxWidth: '420px',
          background: 'rgba(30, 41, 59, 0.85)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '16px',
          padding: '2.5rem 2rem',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center'
        }}
      >
        {/* Logo & Title */}
        <div style={{
          width: '64px',
          height: '64px',
          borderRadius: '16px',
          background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 10px 25px -5px rgba(59, 130, 246, 0.5)',
          marginBottom: '1.25rem'
        }}>
          <Coffee size={32} color="#ffffff" />
        </div>

        <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: '0 0 0.4rem 0', color: '#ffffff', letterSpacing: '-0.02em' }}>
          CoffeeTracker ERP
        </h1>
        <p style={{ fontSize: '0.88rem', color: '#94a3b8', margin: '0 0 2rem 0', textAlign: 'center' }}>
          Secure Accounting & Commodity Management
        </p>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ width: '100%' }}>
          {errorMsg && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              color: '#fca5a5',
              padding: '0.75rem 1rem',
              borderRadius: '10px',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              marginBottom: '1.25rem'
            }}>
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <span>{errorMsg}</span>
            </div>
          )}

          <div style={{ marginBottom: '1.5rem', width: '100%' }}>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.5rem' }}>
              System Password
            </label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <div style={{ position: 'absolute', left: '12px', color: '#64748b', display: 'flex', alignItems: 'center' }}>
                <KeyRound size={18} />
              </div>
              <input
                ref={passwordInputRef}
                type={showPassword ? 'text' : 'password'}
                className="login-input"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.8rem 2.8rem 0.8rem 2.5rem',
                  fontSize: '1rem',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '10px',
                  color: '#ffffff',
                  boxSizing: 'border-box',
                  transition: 'all 0.2s ease'
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '12px',
                  background: 'none',
                  border: 'none',
                  color: '#64748b',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  padding: 0
                }}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            style={{
              width: '100%',
              padding: '0.85rem',
              fontSize: '0.98rem',
              fontWeight: 600,
              color: '#ffffff',
              background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
              border: 'none',
              borderRadius: '10px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              boxShadow: '0 4px 12px rgba(37, 99, 235, 0.35)',
              transition: 'transform 0.15s ease, background 0.2s ease'
            }}
            onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.98)'}
            onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
          >
            <span>Unlock System</span>
            <ArrowRight size={18} />
          </button>
        </form>

        <div style={{ marginTop: '2rem', display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#64748b', fontSize: '0.78rem' }}>
          <Lock size={13} />
          <span>Protected Session System</span>
        </div>
      </div>
    </div>
  );
}
