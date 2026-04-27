import React from 'react';

export type PortState = 'IDLE' | 'MONITORING' | 'FLASHING';

export interface HardwarePort {
  id: string;
  name: string;
  state: PortState;
  boardType?: string;
  serialNo?: string;
  claim?: string;
  baudRate?: number;
  rx?: string;
  tx?: string;
  progress?: number;
  progressMessage?: string;
}

interface HardwareRackProps {
  readonly ports?: HardwarePort[];
  readonly onConnect?: (id: string) => void;
  readonly onLogs?: (id: string) => void;
  readonly onDetach?: (id: string) => void;
  readonly onAbort?: (id: string) => void;
  readonly className?: string;
}

const PortCard: React.FC<{
  port: HardwarePort;
  onConnect?: (id: string) => void;
  onLogs?: (id: string) => void;
  onDetach?: (id: string) => void;
  onAbort?: (id: string) => void;
}> = ({ port, onConnect, onLogs, onDetach, onAbort }) => {
  switch (port.state) {
    case 'IDLE':
      return (
        <div className="min-w-[320px] bg-[#0a0e18] shadow-[inset_0px_2px_4px_rgba(0,0,0,0.4)] p-5 flex flex-col justify-between relative group">
          <div>
            <div className="flex justify-between items-start mb-4">
              <span className="font-mono text-xs font-bold text-[#dfe2f1]">{port.name}</span>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-zinc-500 rounded-full"></span>
                <span className="font-mono text-[10px] text-zinc-500">IDLE</span>
              </div>
            </div>
            <div className="space-y-1">
              <p className="font-mono text-[10px] text-[#dfe2f1]/40">BOARD_TYPE: {port.boardType}</p>
              <p className="font-mono text-[10px] text-[#dfe2f1]/40">SERIAL_NO: {port.serialNo}</p>
            </div>
          </div>
          <div className="flex justify-end">
            <button 
              onClick={() => onConnect?.(port.id)}
              className="font-mono text-[10px] text-[#c0c1ff] px-3 py-1 bg-[#c0c1ff]/10 hover:bg-[#c0c1ff] hover:text-[#0f131d] transition-colors"
            >
              CONNECT
            </button>
          </div>
        </div>
      );
    case 'MONITORING':
      return (
        <div className="min-w-[320px] bg-[#0a0e18] shadow-[inset_0px_2px_4px_rgba(0,0,0,0.4),0_4px_20px_-10px_rgba(0,229,255,0.3)] p-5 flex flex-col justify-between relative border-b-2 border-[#00e5ff]">
          <div>
            <div className="flex justify-between items-start mb-4">
              <span className="font-mono text-xs font-bold text-[#dfe2f1]">{port.name}</span>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-[#00e5ff] rounded-full animate-pulse"></span>
                <span className="font-mono text-[10px] text-[#00e5ff]">MONITORING</span>
              </div>
            </div>
            <div className="bg-black/40 p-3 font-mono text-[10px] text-[#00e5ff] space-y-1">
              <p>CLAIM: {port.claim}</p>
              <p>BAUD: {port.baudRate}</p>
              <p className="opacity-60">RX: {port.rx} TX: {port.tx}</p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button 
              onClick={() => onLogs?.(port.id)}
              className="font-mono text-[10px] text-[#00e5ff] px-3 py-1 bg-[#00e5ff]/10 hover:bg-[#00e5ff] hover:text-black transition-colors"
            >
              LOGS
            </button>
            <button 
              onClick={() => onDetach?.(port.id)}
              className="font-mono text-[10px] text-[#00e5ff] px-3 py-1 bg-[#00e5ff]/10 hover:bg-[#00e5ff] hover:text-black transition-colors"
            >
              DETACH
            </button>
          </div>
        </div>
      );
    case 'FLASHING':
      return (
        <div className="min-w-[320px] bg-[#0a0e18] shadow-[inset_0px_2px_4px_rgba(0,0,0,0.4),0_4px_20px_-10px_rgba(255,180,171,0.3)] p-5 flex flex-col justify-between relative border-b-2 border-[#ffb4ab]">
          <div className="absolute inset-0 bg-[#ffb4ab]/5 pointer-events-none animate-pulse"></div>
          <div>
            <div className="flex justify-between items-start mb-4">
              <span className="font-mono text-xs font-bold text-[#dfe2f1]">{port.name}</span>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-[#ffb4ab] rounded-full shadow-[0_0_8px_#ffb4ab]"></span>
                <span className="font-mono text-[10px] text-[#ffb4ab]">FLASHING</span>
              </div>
            </div>
            <div className="space-y-2">
              <p className="font-mono text-[10px] text-[#ffb4ab] font-bold">CLAIM: {port.claim}</p>
              <div className="w-full h-1 bg-[#353944]">
                <div className="h-full bg-[#ffb4ab]" style={{ width: `${port.progress || 0}%` }}></div>
              </div>
              <p className="font-mono text-[9px] text-[#dfe2f1]/40 uppercase">{port.progressMessage}</p>
            </div>
          </div>
          <div className="flex justify-end">
            <button 
              onClick={() => onAbort?.(port.id)}
              className="font-mono text-[10px] text-[#ffb4ab] px-3 py-1 bg-[#ffb4ab]/10 border border-[#ffb4ab]/20 hover:bg-[#ffb4ab] hover:text-[#690005] transition-colors"
            >
              ABORT_X
            </button>
          </div>
        </div>
      );
    default:
      return null;
  }
};

export const HardwareRack: React.FC<HardwareRackProps> = ({
  ports = [
    { id: '1', name: 'cu.usbserial-1410', state: 'IDLE', boardType: 'ESP32-WROOM-32', serialNo: '0xFF14209A' },
    { id: '2', name: 'cu.usbmodem-102', state: 'MONITORING', claim: 'MONITOR (PID: 1422)', baudRate: 115200, rx: '1.2Kb/s', tx: '0.4Kb/s' },
    { id: '3', name: 'cu.usbserial-2300', state: 'FLASHING', claim: 'FLASHING (Workspace: PR-4)', progress: 68, progressMessage: 'Writing block 42/128...' },
  ],
  onConnect,
  onLogs,
  onDetach,
  onAbort,
  className = '',
}) => {
  return (
    <section className={`absolute bottom-12 left-64 right-0 z-30 bg-[#121926]/60 backdrop-blur-xl border-t border-white/5 p-8 h-1/3 ${className}`}>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[#c0c1ff]">hub</span>
          <h2 className="font-['Space_Grotesk'] font-bold text-lg tracking-tight uppercase text-zinc-200">Hardware_Interfaces</h2>
        </div>
        <span className="font-mono text-[10px] text-zinc-500">{ports.length}_DEVICES_DETECTED</span>
      </div>
      <div className="flex gap-6 h-full overflow-x-auto pb-8" style={{ scrollbarWidth: 'none' }}>
        {ports.map((port) => (
          <PortCard 
            key={port.id} 
            port={port} 
            onConnect={onConnect}
            onLogs={onLogs}
            onDetach={onDetach}
            onAbort={onAbort}
          />
        ))}
      </div>
    </section>
  );
};

export default HardwareRack;
