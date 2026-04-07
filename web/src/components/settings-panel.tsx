/**
 * Settings Panel Component
 * Displays current connection metrics.
 *
 * Provides:
 * - SettingsPanel: React Component
 */
import React from 'react';

interface Props {
  status: string;
  socket: any; // Socket
}

const SettingsPanel: React.FC<Props> = ({ status }) => {
  return (
    <div className="panel settings-panel">
      <div className="panel-header">
        <h2>Environment Status</h2>
      </div>
      <div className="panel-content">
        <div className="setting-row">
          <span className="setting-label">MCP Server:</span>
          <span className={`setting-value ${status === 'online' ? 'status-ok' : 'status-err'}`}>
            {status.toUpperCase()}
          </span>
        </div>
        <div className="setting-row">
          <span className="setting-label">Frontend Mode:</span>
          <span className="setting-value">Vite + React</span>
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
