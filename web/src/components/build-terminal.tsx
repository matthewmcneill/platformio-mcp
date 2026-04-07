/**
 * Build Terminal Component
 * Renders compiler diagnostics and build spool outputs.
 *
 * Provides:
 * - BuildTerminal: React Component
 */
import React, { useEffect, useRef } from 'react';
import { LogEvent } from '../app.js';

interface Props {
  logs: LogEvent[];
}

const BuildTerminal: React.FC<Props> = ({ logs }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="panel terminal-panel">
      <div className="panel-header dark">
        <h2>Compiler Terminal</h2>
      </div>
      <div className="panel-content terminal-content scrollable">
        {logs.length === 0 ? (
          <div className="empty-state">No build output yet...</div>
        ) : (
          <div className="terminal-lines">
            {logs.map((log, i) => (
              <div key={i} className="terminal-line">
                <span className="log-prefix">[{new Date(log.timestamp).toLocaleTimeString([], { hour12: false })}]</span>
                <span className="log-text">{log.logLine}</span>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>
    </div>
  );
};

export default BuildTerminal;
