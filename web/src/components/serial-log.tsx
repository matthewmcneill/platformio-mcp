/**
 * Serial Log Component
 * Tails real-time TTY diagnostic streams.
 *
 * Provides:
 * - SerialLog: React Component
 */
import React, { useEffect, useRef } from 'react';
import { LogEvent } from '../app.js';

interface Props {
  logs: LogEvent[];
}

const SerialLog: React.FC<Props> = ({ logs }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="panel serial-panel">
      <div className="panel-header dark-alt">
        <h2>Real-time Serial Log</h2>
      </div>
      <div className="panel-content serial-content scrollable">
        {logs.length === 0 ? (
          <div className="empty-state">No serial data streams active...</div>
        ) : (
          <div className="serial-lines">
            {logs.map((log, i) => (
              <div key={i} className="serial-line">
                <span className="log-prefix">[{new Date(log.timestamp).toLocaleTimeString([], { hour12: false })}|{log.port || 'TTY'}]</span>
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
