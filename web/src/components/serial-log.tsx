/**
 * Serial Log Component
 * Tails real-time TTY diagnostic streams.
 *
 * Provides:
 * - SerialLog: React Component
 */
import React, { useEffect, useRef, useState } from 'react';
import { LogEvent, SpoolerState } from '../app.js';

interface Props {
  logs: LogEvent[];
  spoolerState: SpoolerState;
}

const SerialLog: React.FC<Props> = ({ logs, spoolerState }) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [localAutoReconnect, setLocalAutoReconnect] = useState(spoolerState.autoReconnect);
  const [availablePorts, setAvailablePorts] = useState<{ port: string; description: string }[]>([]);
  const [selectedPort, setSelectedPort] = useState<string>('');
  const [isAutoScrollFastened, setIsAutoScrollFastened] = useState(true);

  const fetchDevices = async () => {
    try {
      const res = await fetch('/api/devices');
      const data = await res.json();
      setAvailablePorts(data);
      if (data.length > 0 && !selectedPort) {
        setSelectedPort(data[0].port);
      }
    } catch (e) {
      console.error('Failed to fetch devices', e);
    }
  };

  useEffect(() => {
    fetchDevices();
  }, []);

  useEffect(() => {
    if (spoolerState.active && spoolerState.port) {
      setSelectedPort(spoolerState.port);
    }
  }, [spoolerState.active, spoolerState.port]);

  useEffect(() => {
    setLocalAutoReconnect(spoolerState.autoReconnect);
  }, [spoolerState.autoReconnect]);

  useEffect(() => {
    if (isAutoScrollFastened && bottomRef.current) {
      // Use synchronous direct positioning instead of smooth to prevent 'onScroll' event mid-animation thrashing!
      bottomRef.current.scrollIntoView();
    }
  }, [logs, isAutoScrollFastened]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    // Massive 150px threshold to completely nullify rapid-fire layout shift miscalculations
    const atBottom = scrollHeight - scrollTop - clientHeight < 150;
    setIsAutoScrollFastened(atBottom);
  };

  const handleStart = async (checkedState?: boolean) => {
    try {
      await fetch('/api/spooler/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ port: selectedPort || undefined, autoReconnect: checkedState ?? localAutoReconnect })
      });
    } catch (e) {
      console.error('Failed to start spooling', e);
    }
  };

  const handleStop = async () => {
    try {
      await fetch('/api/spooler/stop', { method: 'POST' });
    } catch (e) {
      console.error('Failed to stop spooling', e);
    }
  };

  const handleToggle = (checked: boolean) => {
    setLocalAutoReconnect(checked);
    if (spoolerState.active) {
      handleStart(checked);
    }
  };

  return (
    <div className="panel serial-panel">
      <div className="panel-header dark-alt" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Real-time Serial Log</h2>
        <div className="spooler-controls" style={{ display: 'flex', gap: '15px', alignItems: 'center', fontSize: '13px' }}>
          {spoolerState.logFile && spoolerState.active && (
             <span style={{ fontFamily: 'monospace', opacity: 0.7 }} title={spoolerState.logFile}>
               Output: {spoolerState.logFile.split('/').pop()}
             </span>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <select 
              value={selectedPort} 
              onChange={e => setSelectedPort(e.target.value)}
              disabled={spoolerState.active}
              style={{ background: '#333', color: 'white', border: '1px solid #444', borderRadius: '4px', padding: '2px 5px', maxWidth: '200px' }}
            >
              {availablePorts.length === 0 ? <option value="">No ports found</option> : null}
              {availablePorts.map(p => (
                <option key={p.port} value={p.port}>{p.description || p.port}</option>
              ))}
            </select>
            <button 
              onClick={fetchDevices} 
              disabled={spoolerState.active}
              style={{ background: 'transparent', border: 'none', cursor: spoolerState.active ? 'default' : 'pointer', color: '#ccc' }} 
              title="Refresh Ports"
            >
              🔄
            </button>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={localAutoReconnect} 
              onChange={e => handleToggle(e.target.checked)} 
            />
            Auto-Restart
          </label>
          {spoolerState.active ? (
             <button onClick={handleStop} style={{ padding: '4px 12px', background: '#e74c3c', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Stop</button>
          ) : (
             <button onClick={() => handleStart()} style={{ padding: '4px 12px', background: '#2ecc71', color: '#111', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Start Spooling</button>
          )}
        </div>
      </div>
      <div className="panel-content serial-content scrollable" onScroll={handleScroll}>
        {logs.length === 0 ? (
          <div className="empty-state">No serial data streams active...</div>
        ) : (
          <div className="serial-lines">
            {logs.map((log, i) => (
              <div key={i} className="serial-line">
                <span className="log-prefix">[{new Date(log.timestamp).toLocaleTimeString([], { hour12: false })}]</span>
                <span className="log-text">{log.data}</span>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>
    </div>
  );
};

export default SerialLog;
