import React from 'react';
import {
  CellSignalHigh,
  WifiHigh,
  BatteryHigh,
} from '@phosphor-icons/react';

interface PhoneFrameProps {
  children: React.ReactNode;
}

export function PhoneFrame({ children }: PhoneFrameProps) {
  return (
    <div
      style={{
        width: 390,
        height: 800,
        borderRadius: 44,
        overflow: 'hidden',
        background: 'var(--surface-ground)',
        position: 'relative',
        boxShadow:
          '0 0 0 12px #1a1714, 0 0 0 13px #3d3729, 0 40px 80px rgba(54, 40, 28, 0.22), 0 8px 16px rgba(54, 40, 28, 0.08)',
        flexShrink: 0,
      }}
    >
      {/* Notch */}
      <div
        style={{
          position: 'absolute',
          top: 10,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 120,
          height: 32,
          borderRadius: 9999,
          background: '#1a1714',
          zIndex: 80,
          pointerEvents: 'none',
        }}
      />
      {/* Status bar */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 50,
          zIndex: 70,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 28px',
          pointerEvents: 'none',
          fontFamily: '-apple-system, system-ui',
          fontWeight: 600,
          fontSize: 15,
          color: 'var(--text-1)',
        }}
      >
        <span>9:41</span>
        <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <CellSignalHigh size={14} weight="fill" />
          <WifiHigh size={14} weight="fill" />
          <BatteryHigh size={16} weight="fill" />
        </span>
      </div>
      {children}
      {/* Home indicator */}
      <div
        style={{
          position: 'absolute',
          bottom: 8,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 134,
          height: 5,
          borderRadius: 9999,
          background: 'rgba(26, 23, 20, 0.32)',
          zIndex: 80,
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}

// Safe area wrapper — positions content below the status bar/notch
interface SafeProps {
  scroll?: boolean;
  children: React.ReactNode;
}

export function Safe({ scroll = true, children }: SafeProps) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 50,
        left: 0,
        right: 0,
        bottom: 0,
        overflow: scroll ? 'auto' : 'hidden',
      }}
    >
      {children}
    </div>
  );
}
