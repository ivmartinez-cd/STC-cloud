import React, { useState, useEffect, useRef } from 'react';
import { Terminal as TerminalIcon, Send, Trash2, Command, ShieldCheck, ChevronRight, Loader2 } from 'lucide-react';
import { api } from '../lib/api';

interface TerminalProps {
  agentId: string;
}

interface LogLine {
  id: string;
  type: 'input' | 'output' | 'error' | 'info';
  content: string;
  timestamp: Date;
}

const Terminal: React.FC<TerminalProps> = ({ agentId }) => {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  // WebSocket for real-time results
  useEffect(() => {
    const connect = () => {
      // Determine WebSocket URL
      let wsUrl = '';
      const token = sessionStorage.getItem('stc_ws_token');
      
      if (window.location.hostname.includes('vercel.app')) {
        // Vercel doesn't proxy WebSockets. Connect directly to Render backend.
        wsUrl = `wss://stc-cloud.onrender.com/ws${token ? `?token=${token}` : ''}`;
      } else {
        // Local or same-domain deployment
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        wsUrl = `${protocol}//${window.location.host}/ws${token ? `?token=${token}` : ''}`;
      }

      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        addLog('info', 'Conexión segura establecida con STC Cloud Console');
      };

      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.event === 'command_result' && msg.data.agentId === agentId) {
            if (msg.data.type === 'STC_CONSOLE') {
              addLog('output', msg.data.result?.output || 'Comando completado sin salida.');
              setIsExecuting(false);
            }
          }
        } catch (e) {
          console.error('Error parsing WS message:', e);
        }
      };

      socket.onclose = () => {
        addLog('info', 'Conexión de consola perdida. Reconectando...');
        setTimeout(connect, 3000);
      };
    };

    // Solo conectar si estamos en el portal
    // En producción /api es una ruta, pero el WS suele estar en la misma base
    connect();

    return () => {
      wsRef.current?.close();
    };
  }, [agentId]);

  const addLog = (type: LogLine['type'], content: string) => {
    setLines(prev => [...prev, {
      id: Math.random().toString(36).substring(7),
      type,
      content,
      timestamp: new Date()
    }]);
  };

  const handleExecute = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cmd = inputValue.trim();
    if (!cmd) return;

    if (cmd.toLowerCase() === 'clear') {
      setLines([]);
      setInputValue('');
      return;
    }

    addLog('input', cmd);
    setInputValue('');
    setIsExecuting(true);

    try {
      await api.post(`/agents/${agentId}/command`, {
        type: 'STC_CONSOLE',
        payload: { command: cmd }
      });
      // El resultado llegará vía WebSocket
    } catch (err: any) {
      addLog('error', `Error al enviar comando: ${err.message}`);
      setIsExecuting(false);
    }
  };

  const commonCommands = [
    { label: 'Status', cmd: 'status' },
    { label: 'Ping', cmd: 'ping ' },
    { label: 'Check Impresora', cmd: 'check-printer ' },
    { label: 'Ayuda', cmd: 'help' },
  ];

  return (
    <div className="flex flex-col h-[600px] bg-[#0f172a] rounded-[32px] overflow-hidden border border-slate-800 shadow-2xl animate-in fade-in zoom-in-95 duration-500">
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-4 bg-slate-900/50 border-b border-slate-800/50 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5 mr-4">
            <div className="w-3 h-3 rounded-full bg-rose-500/80" />
            <div className="w-3 h-3 rounded-full bg-amber-500/80" />
            <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
          </div>
          <TerminalIcon size={18} className="text-brand" />
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">STC Cloud Console</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 rounded-full border border-emerald-500/20">
            <ShieldCheck size={12} className="text-emerald-500" />
            <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">Sesión Cifrada</span>
          </div>
          <button 
            onClick={() => setLines([])}
            className="p-2 text-slate-500 hover:text-rose-400 transition-colors"
            title="Limpiar Consola"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>

      {/* Output Area */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-8 font-mono text-sm space-y-3 custom-scrollbar"
      >
        {lines.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-slate-600 space-y-4 opacity-50">
            <Command size={48} strokeWidth={1} />
            <p className="text-[10px] font-black uppercase tracking-[0.2em]">Esperando instrucciones...</p>
            <div className="flex gap-2">
              {commonCommands.map(c => (
                <button 
                  key={c.cmd}
                  onClick={() => { setInputValue(c.cmd); inputRef.current?.focus(); }}
                  className="px-3 py-1.5 border border-slate-800 rounded-lg hover:bg-slate-800 hover:text-slate-300 transition-all text-[10px]"
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        )}
        
        {lines.map((line) => (
          <div key={line.id} className={`flex gap-3 animate-in fade-in slide-in-from-left-2 duration-300 ${
            line.type === 'input' ? 'text-slate-200' : 
            line.type === 'error' ? 'text-rose-400' :
            line.type === 'info' ? 'text-blue-400 font-bold italic' : 
            'text-emerald-400'
          }`}>
            <span className="shrink-0 opacity-30 text-[10px] mt-1 font-sans">
              {line.timestamp.toLocaleTimeString([], { hour12: false })}
            </span>
            <span className="shrink-0 font-black">
              {line.type === 'input' ? '>' : line.type === 'error' ? '!' : '::'}
            </span>
            <pre className="whitespace-pre-wrap break-all leading-relaxed">
              {line.content}
            </pre>
          </div>
        ))}
        {isExecuting && (
          <div className="flex items-center gap-3 text-slate-500 animate-pulse">
            <span className="shrink-0 opacity-30 text-[10px] font-sans">--:--:--</span>
            <Loader2 size={14} className="animate-spin" />
            <span className="text-[10px] font-black uppercase tracking-widest italic">Procesando en Agente STC...</span>
          </div>
        )}
      </div>

      {/* Input Area */}
      <form 
        onSubmit={handleExecute}
        className="px-8 py-6 bg-slate-900/30 border-t border-slate-800/50 flex items-center gap-4 group"
      >
        <ChevronRight size={20} className="text-brand group-focus-within:translate-x-1 transition-transform" />
        <input 
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          disabled={isExecuting}
          placeholder="Escribe un comando de STC Cloud (ej: status)..."
          className="flex-1 bg-transparent border-none outline-none text-slate-200 font-mono text-sm placeholder:text-slate-600 disabled:opacity-50"
          autoFocus
        />
        <button 
          type="submit"
          disabled={!inputValue.trim() || isExecuting}
          className="p-3 bg-brand text-white rounded-xl shadow-lg shadow-brand/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100"
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  );
};

export default Terminal;
