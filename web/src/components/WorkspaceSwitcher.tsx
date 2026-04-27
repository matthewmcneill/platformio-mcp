import React from 'react';

interface Workspace {
  id: string;
  name: string;
  description: string;
  icon: string;
  cpuLoad: string;
  isActive?: boolean;
}

interface WorkspaceSwitcherProps {
  readonly workspaces?: Workspace[];
  readonly onSelectWorkspace?: (id: string) => void;
  readonly onCreateWorkspace?: () => void;
  readonly className?: string;
}

export const WorkspaceSwitcher: React.FC<WorkspaceSwitcherProps> = ({
  workspaces = [
    { id: 'alpha', name: 'PROJECT_ALPHA', description: 'Local Development Environment', icon: 'deployed_code', cpuLoad: '12.4%' },
    { id: 'beta', name: 'PROJECT_BETA', description: 'Microservice Mesh Analysis', icon: 'terminal', cpuLoad: '02.1%' },
    { id: 'gamma', name: 'PROJECT_GAMMA', description: 'Neural Weight Diagnostics', icon: 'monitoring', cpuLoad: '64.9%' },
    { id: 'delta', name: 'PROJECT_DELTA', description: 'Distributed Ledger Explorer', icon: 'hub', cpuLoad: '00.8%' },
  ],
  onSelectWorkspace,
  onCreateWorkspace,
  className = '',
}) => {
  return (
    <div className={`w-full max-w-4xl bg-surface-container-high/60 backdrop-blur-xl shadow-2xl flex flex-col overflow-hidden border border-white/5 ${className}`}>
      {/* Workspace Header */}
      <div className="px-8 py-6 flex justify-between items-end bg-black/20">
        <div>
          <h2 className="font-['Space_Grotesk'] text-3xl font-bold tracking-tighter uppercase text-zinc-200 mb-1">Context Switcher</h2>
          <p className="font-mono text-xs text-zinc-500 tracking-wider">KERNEL_SESSION_ID: 0x8849-FF01</p>
        </div>
        <div className="text-right">
          <p className="font-mono text-[10px] uppercase text-zinc-500 tracking-[0.2em]">Active Nodes</p>
          <p className="font-['Space_Grotesk'] text-xl font-bold text-[#00FFD1]">04_PROJECT_CLUSTERS</p>
        </div>
      </div>

      {/* Top Pinned Item (Auto-Tracking) */}
      <div className="p-2">
        <div className="group cursor-pointer bg-black/40 px-6 py-5 flex items-center justify-between cyan-box-glow relative border border-[#00FFD1]/20">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#00FFD1] cyan-box-glow"></div>
          <div className="flex items-center gap-5">
            <div className="relative">
              <span className="material-symbols-outlined text-[#00FFD1]" style={{ fontVariationSettings: "'FILL' 1" }}>radar</span>
              <div className="absolute -top-1 -right-1 w-2 h-2 bg-[#00FFD1] rounded-full animate-ping"></div>
            </div>
            <div className="flex flex-col">
              <span className="font-['Space_Grotesk'] text-sm font-bold tracking-widest text-[#00FFD1]">[ AUTO-TRACKING ]</span>
              <span className="font-mono text-xs text-zinc-400">Following active MCP socket stream</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="font-mono text-[10px] text-[#00FFD1]/60">ESTABLISHED_CONNECTION</span>
            <span className="material-symbols-outlined text-[#00FFD1]">check_circle</span>
          </div>
        </div>
      </div>

      {/* Tonal Separator */}
      <div className="h-[1px] w-full bg-white/5 my-1"></div>

      {/* List of Workspaces */}
      <div className="flex-1 px-2 pb-2 flex flex-col gap-1 overflow-y-auto max-h-[400px]">
        {workspaces.map((ws) => (
          <div 
            key={ws.id}
            onClick={() => onSelectWorkspace?.(ws.id)}
            className="group cursor-pointer hover:bg-white/5 px-6 py-4 flex items-center justify-between transition-colors duration-200"
          >
            <div className="flex items-center gap-5">
              <span className="material-symbols-outlined text-zinc-500 group-hover:text-[#00FFD1] transition-colors">{ws.icon}</span>
              <div className="flex flex-col">
                <span className="font-['Space_Grotesk'] text-sm font-medium tracking-wide text-zinc-300 group-hover:text-[#00FFD1] transition-colors">{ws.name}</span>
                <span className="font-mono text-[10px] text-zinc-500 uppercase">{ws.description}</span>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-right">
                <span className="block font-mono text-[10px] text-zinc-600 uppercase">CPU Load</span>
                <span className="font-mono text-xs text-zinc-300">{ws.cpuLoad}</span>
              </div>
              <span className="material-symbols-outlined text-zinc-600 group-hover:text-zinc-300 transition-colors">chevron_right</span>
            </div>
          </div>
        ))}
      </div>

      {/* Footer Action Area */}
      <div className="px-8 py-6 bg-black/30 flex justify-between items-center border-t border-white/5">
        <div className="flex gap-4">
          <div className="flex flex-col">
            <span className="font-mono text-[10px] text-zinc-600 uppercase">Global Uptime</span>
            <span className="font-mono text-xs text-zinc-400">14:22:04:11</span>
          </div>
          <div className="w-[1px] h-8 bg-zinc-800"></div>
          <div className="flex flex-col">
            <span className="font-mono text-[10px] text-zinc-600 uppercase">Status</span>
            <span className="font-mono text-xs text-[#00FFD1]">SYSTEM_OPTIMAL</span>
          </div>
        </div>
        <button 
          onClick={onCreateWorkspace}
          className="bg-[#00FFD1]/10 hover:bg-[#00FFD1]/20 text-[#00FFD1] border border-[#00FFD1]/30 font-['Space_Grotesk'] font-bold text-sm tracking-widest px-8 py-3 transition-all active:scale-95 shadow-[0_10px_20px_rgba(0,0,0,0.3)]"
        >
          CREATE NEW WORKSPACE
        </button>
      </div>
    </div>
  );
};

export default WorkspaceSwitcher;
