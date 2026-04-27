import React from 'react';

interface CoreShellProps {
  readonly children?: React.ReactNode;
  readonly className?: string;
  readonly onThemeToggle?: () => void;
}

export const CoreShell: React.FC<CoreShellProps> = ({
  children,
  className = '',
  onThemeToggle,
  ...props
}) => {
  return (
    <div className={`min-h-screen flex flex-col selection:bg-primary-container selection:text-on-primary-container ${className}`} {...props}>
      {/* TopAppBar */}
      <header className="fixed top-0 z-50 w-full h-16 bg-[#0e0e0e] flex justify-between items-center px-6 border-b border-white/5">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[#00FFD1] text-lg">terminal</span>
          <span className="font-['Space_Grotesk'] tracking-[0.3em] uppercase text-[10px] text-zinc-600 font-bold">OPERATIONAL_UI</span>
        </div>
        
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center font-mono text-sm tracking-tighter">
          <span className="text-[#00FFD1] cyan-intense-glow font-bold uppercase">PLATFORMIO | MCP</span>
          <span className="text-zinc-700 mx-2 ml-4 text-[10px]">VER_4.0.1</span>
          <span className="cursor-blink text-[#00FFD1] ml-1"></span>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3 px-3 py-1.5 bg-zinc-900/50">
            <span className="font-mono text-[9px] font-bold tracking-widest text-zinc-500 uppercase">CORE_STATUS</span>
            <div className="flex gap-1">
              <span className="h-1.5 w-1.5 bg-[#00FFD1] animate-pulse"></span>
              <span className="h-1.5 w-1.5 bg-[#00FFD1]/30"></span>
              <span className="h-1.5 w-1.5 bg-[#00FFD1]/10"></span>
            </div>
          </div>
          <button className="text-zinc-600 hover:text-[#00FFD1] transition-colors">
            <span className="material-symbols-outlined text-xl">dvr</span>
          </button>
        </div>
      </header>

      <div className="flex flex-1 pt-16">
        {/* NavigationDrawer */}
        <aside className="w-64 h-[calc(100vh-64px)] fixed left-0 bg-[#0e0e0e] flex flex-col pt-8">
          <div className="px-6 mb-10">
            <h2 className="font-['Space_Grotesk'] font-black uppercase text-zinc-400 text-[10px] tracking-[0.4em]">SYSTEM_ROOT</h2>
          </div>
          <nav className="flex flex-col">
            <a className="bg-zinc-900/40 text-[#00FFD1] px-6 py-4 flex items-center gap-4 group relative" href="#">
              <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-[#00FFD1] cyan-box-glow"></div>
              <span className="material-symbols-outlined text-lg">analytics</span>
              <span className="font-['Space_Grotesk'] font-bold text-[10px] tracking-[0.25em]">TELEMETRY</span>
            </a>
            <a className="text-zinc-600 px-6 py-4 flex items-center gap-4 hover:bg-zinc-900/20 hover:text-zinc-300 transition-colors group" href="#">
              <span className="material-symbols-outlined text-lg">memory</span>
              <span className="font-['Space_Grotesk'] font-bold text-[10px] tracking-[0.25em]">GRID_CORE</span>
            </a>
            <a className="text-zinc-600 px-6 py-4 flex items-center gap-4 hover:bg-zinc-900/20 hover:text-zinc-300 transition-colors group" href="#">
              <span className="material-symbols-outlined text-lg">router</span>
              <span className="font-['Space_Grotesk'] font-bold text-[10px] tracking-[0.25em]">NODE_STATUS</span>
            </a>
            <a className="text-zinc-600 px-6 py-4 flex items-center gap-4 hover:bg-zinc-900/20 hover:text-zinc-300 transition-colors group" href="#">
              <span className="material-symbols-outlined text-lg">terminal</span>
              <span className="font-['Space_Grotesk'] font-bold text-[10px] tracking-[0.25em]">SYS_LOGS</span>
            </a>
          </nav>
          <div className="mt-auto p-6 space-y-4">
            <div className="p-4 bg-zinc-900/30">
              <div className="flex justify-between items-center mb-3">
                <span className="font-mono text-[9px] text-zinc-600 tracking-tighter uppercase">UPLINK_STRENGTH</span>
                <span className="font-mono text-[9px] text-[#00FFD1]">98.2%</span>
              </div>
              <div className="h-0.5 bg-zinc-800 w-full overflow-hidden">
                <div className="h-full bg-[#00FFD1] w-[98.2%] cyan-box-glow"></div>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content Canvas */}
        <main className="flex-1 md:ml-64 p-8 pb-16">
          <div className="max-w-7xl mx-auto space-y-8">
            {children}
          </div>
        </main>
      </div>

      {/* Theme Toggle Floating (Industrial Glass Redesign) */}
      <div className="fixed bottom-12 right-8 z-50 flex flex-col gap-0.5 glass-industrial p-1.5 border-zinc-700/50">
        <button className="p-3 text-[#00FFD1] cyan-intense-glow bg-white/5 hover:bg-white/10 transition-colors" onClick={onThemeToggle}>
          <span className="material-symbols-outlined text-[18px]">dark_mode</span>
        </button>
        <button className="p-3 text-zinc-500 hover:text-zinc-200 hover:bg-white/5 transition-colors" onClick={onThemeToggle}>
          <span className="material-symbols-outlined text-[18px]">light_mode</span>
        </button>
        <div className="h-[1px] bg-zinc-700/30 mx-2 my-1"></div>
        <button className="p-3 text-zinc-500 hover:text-zinc-200 hover:bg-white/5 transition-colors">
          <span className="material-symbols-outlined text-[18px]">barcode_scanner</span>
        </button>
      </div>

      {/* Footer */}
      <footer className="fixed bottom-0 w-full h-8 bg-[#0e0e0e] border-t border-zinc-900 flex items-center justify-between px-6 z-50">
        <div className="font-mono text-[8px] tracking-widest uppercase text-zinc-700">
          ©2024 PIO_MCP_CORE_KERNEL_STABLE_V4.0.1 // 0x4421-AF
        </div>
        <div className="flex gap-8">
          <a className="font-mono text-[8px] tracking-widest uppercase text-zinc-700 hover:text-[#00FFD1] transition-colors" href="#">SEC_PROTOCOL_03</a>
          <a className="font-mono text-[8px] tracking-widest uppercase text-zinc-700 hover:text-[#00FFD1] transition-colors" href="#">ENCRYPTION:AES-256</a>
        </div>
      </footer>
    </div>
  );
};

export default CoreShell;
