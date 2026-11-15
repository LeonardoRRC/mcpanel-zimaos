// Minecraft console output (ANSI colors) to HTML. Text is escaped before any markup is added.

const ANSI_COLORS = ['#3b3f51', '#ef4444', '#22c55e', '#f5b70b', '#3b82f6', '#c084fc', '#22d3ee', '#d7dae3'];
const ANSI_BRIGHT = ['#6b7088', '#f87171', '#4ade80', '#fde047', '#60a5fa', '#e879f9', '#67e8f9', '#ffffff'];

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** Keeps the current color between calls, like a terminal. */
export class AnsiRenderer {
    fg: string | null = null;
    bold = false;

    toHtml(text: string): string {
        let out = '';
        const parts = text.split(/\x1b\[([0-9;]*)m/);
        for (let i = 0; i < parts.length; i++) {
            if (i % 2 === 1) {
                const codes = parts[i] === '' ? [0] : parts[i].split(';').map(Number);
                for (let j = 0; j < codes.length; j++) {
                    const c = codes[j];
                    if (c === 0) { this.fg = null; this.bold = false; }
                    else if (c === 1) this.bold = true;
                    else if (c === 22) this.bold = false;
                    else if (c >= 30 && c <= 37) this.fg = ANSI_COLORS[c - 30];
                    else if (c >= 90 && c <= 97) this.fg = ANSI_BRIGHT[c - 90];
                    else if (c === 39) this.fg = null;
                    else if (c === 38 && codes[j + 1] === 2) { this.fg = `rgb(${codes[j + 2]},${codes[j + 3]},${codes[j + 4]})`; j += 4; }
                    else if (c === 38 && codes[j + 1] === 5) { j += 2; }
                }
                continue;
            }
            // Other escape sequences (cursor movement etc.) are dropped.
            const chunk = esc(parts[i].replace(/\x1b\[[0-9;?]*[A-Za-z]|\x1b[()][A-Z0-9]|\r/g, ''));
            if (!chunk) continue;
            const style = (this.fg ? `color:${this.fg};` : '') + (this.bold ? 'font-weight:600;' : '');
            out += style ? `<span style="${style}">${chunk}</span>` : chunk;
        }
        return out;
    }

    reset(): void {
        this.fg = null;
        this.bold = false;
    }
}

/** Color plain WARN/ERROR lines ("[12:00:00 WARN]:" Paper, "[Server thread/WARN]:" Vanilla) and stack traces. */
export function colorizeLevels(text: string): string {
    let inError = false;
    return text.split('\n').map((line) => {
        if (line.includes('\x1b[')) return line;
        if (/^\[[^\]]*[ /](ERROR|FATAL)\]/.test(line)) { inError = true; return `\x1b[91m${line}\x1b[0m`; }
        if (/^\[[^\]]*[ /]WARN\]/.test(line)) { inError = false; return `\x1b[93m${line}\x1b[0m`; }
        if (inError && /^(\s+at |Caused by|[\w.]+(Exception|Error)\b)/.test(line)) return `\x1b[91m${line}\x1b[0m`;
        if (/^\[/.test(line)) inError = false;
        return line;
    }).join('\n');
}
