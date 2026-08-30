import { escapeHtml } from '../ui/domUtils';
import { ui } from './state';

/** A captured console line, mirrored into the editor's Console drawer tab. */
export interface ConsoleLogEntry {
  type: 'log' | 'warn' | 'error';
  text: string;
  time: string;
}

/** Ring buffer of the most recent console output (read by the Console drawer tab). */
export const consoleLogs: ConsoleLogEntry[] = [];

const origLog = console.log;
const origWarn = console.warn;
const origError = console.error;

function addConsoleEntry(type: 'log' | 'warn' | 'error', ...args: any[]) {
  const time = new Date().toLocaleTimeString();
  const text = args.map(arg => {
    if (typeof arg === 'object') {
      try { return JSON.stringify(arg); } catch (e) { return String(arg); }
    }
    return String(arg);
  }).join(' ');

  consoleLogs.push({ type, text, time });
  if (consoleLogs.length > 200) {
    consoleLogs.shift();
  }

  if (ui.activeDrawerTab === 'console') {
    const logsContainer = document.getElementById('console-logs-output');
    if (logsContainer) {
      const color = type === 'error' ? '#ef4444' : type === 'warn' ? 'var(--accent-gold)' : 'var(--accent-cyan)';
      const prefix = type === 'error' ? '[ERR]' : type === 'warn' ? '[WRN]' : '[LOG]';
      logsContainer.innerHTML += `<div style="margin-bottom:4px; color:${color}">[${time}] ${prefix} ${escapeHtml(text)}</div>`;
      logsContainer.scrollTop = logsContainer.scrollHeight;
    }
  }
}

let installed = false;

/** Wrap console.log/warn/error so output is mirrored into the editor Console tab.
 *  Idempotent; call once as early as possible during boot. */
export function installConsoleCapture(): void {
  if (installed) return;
  installed = true;
  console.log = (...args: any[]) => {
    origLog.apply(console, args);
    addConsoleEntry('log', ...args);
  };
  console.warn = (...args: any[]) => {
    origWarn.apply(console, args);
    addConsoleEntry('warn', ...args);
  };
  console.error = (...args: any[]) => {
    origError.apply(console, args);
    addConsoleEntry('error', ...args);
  };
}
