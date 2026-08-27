import React, { useState, useEffect, useRef } from 'react';
import { Terminal as TerminalIcon, Send, Trash2, ChevronRight, Loader2 } from 'lucide-react';
import { api } from '../../../shared/lib/api';

interface TerminalProps {
  agentId: string;
}

interface LogLine {
  id: string;
  type: 'input' | 'output' | 'error' | 'info';
  content: string;
  timestamp: Date;
}

// Handoff hifi "Monitor — detalle" §5 puntos 12-13 — tokens propios de la
// terminal, no están en src/index.css porque no se usan en ningún otro lado.
const LINE_COLOR: Record<LogLine['type'], string> = {
  input: 'text-[#E8EAEC]', output: 'text-[#8A9096]', error: 'text-brand-severe', info: 'text-brand font-semibold italic',
};

const Terminal: React.FC<TerminalProps> = ({ agentId }) => {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (inputRef.current) inputRef.current.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [lines]);

  const addLog = (type: LogLine['type'], content: string) => {
    setLines(prev => [...prev, { id: Math.random().toString(36).substring(7), type, content, timestamp: new Date() }]);
  };

  useEffect(() => {
    let cancelled = false;

    const connect = async () => {
      let ticket: string | undefined;
      try {
        const res = await api.post<{ ticket: string }>('/portal/ws-ticket');
        ticket = res.ticket;
      } catch (e) {
        addLog('error', `No se pudo obtener ticket de WS: ${e instanceof Error ? e.message : String(e)}`);
        setTimeout(() => { if (!cancelled) void connect(); }, 3000);
        return;
      }
      if (cancelled) return;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws?token=${ticket}`;
      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => addLog('info', 'Conexión segura establecida con STC Cloud Console');
      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.event === 'command_result' && msg.data.agentId === agentId && msg.data.type === 'STC_CONSOLE') {
            addLog('output', msg.data.result?.output || 'Comando completado sin salida.');
            setIsExecuting(false);
          }
        } catch (e) {
          console.error('Error parsing WS message:', e);
        }
      };
      socket.onclose = () => {
        addLog('info', 'Conexión de consola perdida. Reconectando...');
        setTimeout(() => { if (!cancelled) void connect(); }, 3000);
      };
    };

    void connect();
    return () => { cancelled = true; wsRef.current?.close(); };
  }, [agentId]);

  const handleExecute = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cmd = inputValue.trim();
    if (!cmd) return;
    if (cmd.toLowerCase() === 'clear') { setLines([]); setInputValue(''); return; }

    addLog('input', cmd);
    setInputValue('');
    setIsExecuting(true);
    try {
      await api.post(`/agents/${agentId}/command`, { type: 'STC_CONSOLE', payload: { command: cmd } });
    } catch (err) {
      addLog('error', `Error al enviar comando: ${err instanceof Error ? err.message : String(err)}`);
      setIsExecuting(false);
    }
  };

  const commonCommands = [
    { label: 'Status', cmd: 'status' }, { label: 'Ping', cmd: 'ping ' },
    { label: 'SNMP Check', cmd: 'snmp-check ' }, { label: 'Ayuda', cmd: 'help' },
  ];

  return (
    <div className="flex min-h-[260px] flex-1 flex-col overflow-hidden rounded-[5px] border border-[#23252A]" style={{ background: '#17181A' }}>
      <div className="flex items-center justify-between border-b border-[#23252A] px-6 py-3.5">
        <div className="flex items-center gap-2.5">
          <TerminalIcon size={15} className="text-brand" />
          <span className="font-montserrat text-[9px] font-bold uppercase tracking-[.15em] text-[#8A9096]">STC Cloud Console</span>
        </div>
        <div className="flex items-center gap-3.5">
          <span className="inline-flex items-center gap-[7px] rounded-[2px] bg-brand-soft px-[9px] py-1 font-montserrat text-[9px] font-semibold uppercase tracking-[.08em] text-brand-accent">
            <span className="block h-1.5 w-1.5 rounded-full bg-brand" /> Sesión cifrada
          </span>
          <button type="button" onClick={() => setLines([])} className="rounded-[3px] p-1.5 text-[#8A9096] transition-colors duration-150 ease-in-out hover:text-brand-severe" title="Limpiar consola">
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-2.5 overflow-y-auto p-6 font-mono text-[13px]">
        {lines.map((line) => (
          <div key={line.id} className={`flex gap-3 ${LINE_COLOR[line.type]}`}>
            <span className="mt-0.5 shrink-0 font-sans text-[10px] text-[#4E5459]">{line.timestamp.toLocaleTimeString([], { hour12: false })}</span>
            <span className="shrink-0 font-bold">{line.type === 'input' ? '>' : line.type === 'error' ? '!' : '::'}</span>
            <pre className="whitespace-pre-wrap break-all leading-relaxed">{line.content}</pre>
          </div>
        ))}
        {isExecuting && (
          <div className="flex items-center gap-3 text-[#8A9096]">
            <span className="shrink-0 font-sans text-[10px] text-[#4E5459]">--:--:--</span>
            <Loader2 size={13} className="animate-spin" />
            <span className="font-montserrat text-[9px] font-bold uppercase tracking-[.13em] italic">Procesando en agente STC…</span>
          </div>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto border-t border-[#23252A] px-6 py-2.5">
        {commonCommands.map(c => (
          <button
            key={c.cmd} type="button" onClick={() => { setInputValue(c.cmd); inputRef.current?.focus(); }}
            className="whitespace-nowrap rounded-[3px] border border-[#2A2D33] px-2.5 py-1 font-montserrat text-[9px] font-semibold uppercase tracking-[.06em] text-[#8A9096] transition-colors duration-150 ease-in-out hover:border-brand/40 hover:text-brand"
          >
            {c.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleExecute} className="flex items-center gap-3.5 border-t border-[#23252A] px-6 py-4" style={{ background: '#1B1D21' }}>
        <ChevronRight size={17} className="text-brand" />
        <input
          ref={inputRef} type="text" value={inputValue} onChange={(e) => setInputValue(e.target.value)} disabled={isExecuting}
          placeholder="Escribir comando…"
          className="flex-1 border-none bg-transparent font-mono text-[13px] text-[#E8EAEC] outline-none placeholder:text-[#4E5459] disabled:opacity-50"
        />
        <button
          type="submit" disabled={!inputValue.trim() || isExecuting}
          className="rounded-[3px] bg-brand px-3.5 py-2 font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-white transition-colors duration-150 ease-in-out hover:bg-brand-severe disabled:opacity-50"
        >
          <Send size={14} />
        </button>
      </form>
    </div>
  );
};

export default Terminal;
