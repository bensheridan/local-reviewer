import { useEffect, useRef, useCallback } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

interface TerminalProps {
  cwd: string;
  active: boolean;
}

export function Terminal({ cwd, active }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const mountedRef = useRef(false);

  const connect = useCallback(() => {
    const ws = new WebSocket(`ws://localhost:3001/terminal?cwd=${encodeURIComponent(cwd)}`);
    wsRef.current = ws;

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "output") xtermRef.current?.write(msg.data);
    };

    ws.onclose = () => {
      xtermRef.current?.write("\r\n\x1b[31m[disconnected]\x1b[0m\r\n");
    };

    return ws;
  }, [cwd]);

  // Mount xterm once
  useEffect(() => {
    if (mountedRef.current || !containerRef.current) return;
    mountedRef.current = true;

    const term = new XTerm({
      fontFamily: "Menlo, Monaco, 'Courier New', monospace",
      fontSize: 13,
      theme: { background: "#09090b" },
      cursorBlink: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();

    xtermRef.current = term;
    fitRef.current = fit;

    const ws = connect();

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "input", data }));
      }
    });

    return () => {
      term.dispose();
      ws.close();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fit when panel becomes active or resizes
  useEffect(() => {
    if (!active || !fitRef.current || !wsRef.current) return;
    fitRef.current.fit();
    const { cols, rows } = fitRef.current.proposeDimensions() ?? { cols: 80, rows: 24 };
    if (wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "resize", cols, rows }));
    }
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const observer = new ResizeObserver(() => {
      fitRef.current?.fit();
      const dims = fitRef.current?.proposeDimensions() ?? { cols: 80, rows: 24 };
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "resize", cols: dims.cols, rows: dims.rows }));
      }
    });
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [active]);

  return <div ref={containerRef} className="h-full w-full" />;
}
