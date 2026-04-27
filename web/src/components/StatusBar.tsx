import React from 'react';
import { HardwarePort } from './HardwareRack';

interface StatusBarProps {
  readonly ports?: HardwarePort[];
  readonly systemStatus?: string;
  readonly onExpand?: () => void;
  readonly className?: string;
}

const PortStatusChip: React.FC<{ port: HardwarePort }> = ({ port }) => {
  switch (port.state) {
    case 'IDLE':
      return (
        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-zinc-800/80 rounded text-zinc-500 group cursor-pointer hover:text-zinc-300 transition-colors border border-zinc-700/50">
          <span className="w-1.5 h-1.5 rounded-full bg-zinc-500"></span>
          <span className="font-mono text-[10px] tracking-tighter">[⬤ {port.name}]</span>
        </div>
      );
    case 'MONITORING':
      return (
        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-zinc-800/80 rounded text-[#00FFD1] group cursor-pointer hover:brightness-125 transition-all border border-[#00FFD1]/20">
          <span className="w-1.5 h-1.5 rounded-full bg-[#00FFD1] shadow-[0_0_5px_#00FFD1]"></span>
          <span className="font-mono text-[10px] tracking-tighter">[⬤ {port.name}]</span>
        </div>
      );
    case 'FLASHING':
      return (
        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-zinc-800/80 rounded text-[#ffb4ab] group cursor-pointer hover:brightness-125 transition-all border border-[#ffb4ab]/20">
          <span className="w-1.5 h-1.5 rounded-full bg-[#ffb4ab] shadow-[0_0_5px_#ffb4ab]"></span>
          <span className="font-mono text-[10px] tracking-tighter">[⬤ {port.name}]</span>
        </div>
      );
    default:
      return null;
  }
};

export const StatusBar: React.FC<StatusBarProps> = ({
  ports = [
    { id: '1', name: 'cu.usbserial-1410', state: 'IDLE' },
    { id: '2', name: 'cu.usbmodem-102', state: 'MONITORING' },
    { id: '3', name: 'cu.usbserial-2300', state: 'FLASHING' },
  ],
  systemStatus = 'SYSTEM_KINETIC_V2.0.4',
  onExpand,
  className = '',
}) => {
  return (
    <footer className={`bg-[#0a0e18] text-[#00FFD1] font-mono text-[10px] tracking-tighter fixed bottom-0 left-0 w-full z-50 flex items-center justify-between px-4 h-8 border-t border-white/10 shadow-[0_-4px_20px_rgba(0,0,0,0.5)] ${className}`}>
      <div className="flex items-center gap-4">
        {/* Left Side: Status Chips */}
        <div className="flex gap-2">
          {ports.map(port => (
            <PortStatusChip key={port.id} port={port} />
          ))}
        </div>

        <div className="h-3 w-px bg-white/20"></div>

        <div className="hidden sm:flex gap-4">
          <span className="opacity-60 text-zinc-400">{systemStatus}</span>
          <span className="opacity-40 text-zinc-500">UTC_OFFSET_0</span>
          <span className="opacity-40 text-zinc-500">UTF-8</span>
        </div>
      </div>

      {/* Right Side: Expand Icon */}
      <div className="flex items-center gap-4">
        <span className="opacity-60 text-[#00FFD1] cursor-pointer hover:text-white transition-colors">STABLE_LINK</span>
        <div 
          onClick={onExpand}
          className="px-2 py-0.5 bg-zinc-800 rounded cursor-pointer hover:bg-zinc-700 transition-colors border border-white/5"
        >
          <span className="text-[#00FFD1] font-bold">[^]</span>
        </div>
      </div>
    </footer>
  );
};

export default StatusBar;
