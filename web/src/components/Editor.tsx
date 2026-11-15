import { useEffect, useRef, useState } from 'react';

// Ace comes from the same CDN as before, loaded only when a file is opened.
const ACE = 'https://cdnjs.cloudflare.com/ajax/libs/ace/1.44.0/';
const MODES: Record<string, string> = {
    yml: 'yaml', yaml: 'yaml', json: 'json', properties: 'properties', toml: 'toml', sh: 'sh', js: 'javascript', md: 'markdown',
    xml: 'xml', html: 'html', conf: 'ini', cfg: 'ini', ini: 'ini', txt: 'text', log: 'text',
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AceEditor = any;
let aceLoading: Promise<boolean> | null = null;
function loadAce(): Promise<boolean> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).ace) return Promise.resolve(true);
    aceLoading ??= new Promise((resolve) => {
        const s = document.createElement('script');
        s.src = ACE + 'ace.min.js';
        s.onload = () => resolve(true);
        s.onerror = () => { aceLoading = null; resolve(false); };
        document.head.append(s);
    });
    return aceLoading;
}

/** Code editor with syntax highlighting; plain textarea if the CDN can't be reached. Ctrl+S saves. */
export function Editor({ path, initial, onReady, onSave }: {
    path: string; initial: string; onReady: (get: () => string) => void; onSave: () => void;
}) {
    const box = useRef<HTMLDivElement>(null);
    const [fallback, setFallback] = useState(false);
    const [text, setText] = useState(initial);
    const save = useRef(onSave);
    save.current = onSave;

    useEffect(() => {
        let editor: AceEditor = null;
        let live = true;
        void loadAce().then((ok) => {
            if (!live) return;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const ace = (window as any).ace;
            if (!ok || !ace || !box.current) { setFallback(true); return; }
            ace.config.set('basePath', ACE);
            editor = ace.edit(box.current, {
                theme: 'ace/theme/tomorrow_night', fontSize: 13, showPrintMargin: false, useWorker: false,
                mode: 'ace/mode/' + (MODES[path.split('.').pop()!.toLowerCase()] || 'text'),
            });
            editor.setValue(initial, -1);
            editor.commands.addCommand({ name: 'save', bindKey: { win: 'Ctrl-S', mac: 'Cmd-S' }, exec: () => save.current() });
            editor.focus();
            onReady(() => editor.getValue());
        });
        return () => { live = false; editor?.destroy(); };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => { if (fallback) onReady(() => textRef.current); }, [fallback]); // eslint-disable-line react-hooks/exhaustive-deps
    const textRef = useRef(text);
    textRef.current = text;

    if (fallback) {
        return (
            <div className="editor">
                <textarea className="input dark" style={{ width: '100%', height: '100%', border: 0, borderRadius: 0 }} value={text}
                    onChange={(e) => setText(e.target.value)} spellCheck={false}
                    onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save.current(); } }} />
            </div>
        );
    }
    return <div className="editor" ref={box} />;
}
