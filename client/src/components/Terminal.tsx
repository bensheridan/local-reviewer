import { useEffect, useRef } from "react";
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

  useEffect(() => {
    if (!containerRef.current) return;

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
    requestAnimationFrame(() => term.focus());

    xtermRef.current = term;
    fitRef.current = fit;

    const wsBase = import.meta.env.VITE_WS_URL ?? "ws://localhost:3001";
    const wsUrl = new URL(`${wsBase}/terminal`);
    if (cwd) wsUrl.searchParams.set("cwd", cwd);
    const ws = new WebSocket(wsUrl.toString());
    wsRef.current = ws;

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "output") term.write(msg.data);
    };

    ws.onclose = () => {
      term.write("\r\n\x1b[31m[disconnected]\x1b[0m\r\n");
    };

    // Without a PTY the shell doesn't echo, so do line-buffered local echo here.
    let buffer = "";
    term.onData((data) => {
      for (const ch of data) {
        const code = ch.charCodeAt(0);
        if (ch === "\r") {
          term.write("\r\n");
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "input", data: buffer + "\n" }));
          }
          buffer = "";
        } else if (ch === "\x7f" || ch === "\b") {
          if (buffer.length > 0) {
            buffer = buffer.slice(0, -1);
            term.write("\b \b");
          }
        } else if (ch === "\x03") {
          term.write("^C\r\n");
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "signal", data: "SIGINT" }));
          }
          buffer = "";
        } else if (code >= 32 || ch === "\t") {
          buffer += ch;
          term.write(ch);
        }
      }
    });

    return () => {
      ws.close();
      term.dispose();
      xtermRef.current = null;
      fitRef.current = null;
      wsRef.current = null;
    };
  }, [cwd]);

  // Fit and focus when tab becomes active
  useEffect(() => {
    if (!active) return;
    fitRef.current?.fit();
    const dims = fitRef.current?.proposeDimensions() ?? { cols: 80, rows: 24 };
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "resize", cols: dims.cols, rows: dims.rows }));
    }
    requestAnimationFrame(() => xtermRef.current?.focus());
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

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      onClick={() => xtermRef.current?.focus()}
    />
  );
}
