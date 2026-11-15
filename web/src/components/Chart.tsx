import { useEffect, useRef } from 'react';

/** Area chart of the last 60 samples on a <canvas> (no chart library). */
export function Chart({ data, max, fmt }: { data: number[]; max: number; fmt: (v: number) => string }) {
    const canvas = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        const draw = () => {
            const c = canvas.current;
            if (!c) return;
            const dpr = window.devicePixelRatio || 1;
            const w = c.clientWidth, h = c.clientHeight;
            c.width = w * dpr;
            c.height = h * dpr;
            const ctx = c.getContext('2d')!;
            ctx.scale(dpr, dpr);
            ctx.clearRect(0, 0, w, h);
            const top = Math.max(max, ...data) || 1;
            ctx.strokeStyle = '#34374f';
            ctx.fillStyle = '#8a90a6';
            ctx.font = '10px Rubik, sans-serif';
            ctx.lineWidth = 1;
            for (let i = 0; i <= 2; i++) {
                const y = Math.round(8 + ((h - 16) * i) / 2) + 0.5;
                ctx.beginPath(); ctx.moveTo(48, y); ctx.lineTo(w, y); ctx.stroke();
                ctx.fillText(fmt(top * (1 - i / 2)), 0, y + 3);
            }
            const step = (w - 48) / (data.length - 1);
            const pts = data.map((v, i) => [48 + i * step, 8 + (h - 16) * (1 - v / top)]);
            const grad = ctx.createLinearGradient(0, 0, 0, h);
            grad.addColorStop(0, 'rgba(248,81,2,.35)');
            grad.addColorStop(1, 'rgba(248,81,2,0)');
            ctx.beginPath(); ctx.moveTo(pts[0][0], h - 8);
            pts.forEach(([x, y]) => ctx.lineTo(x, y));
            ctx.lineTo(pts[pts.length - 1][0], h - 8); ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
            ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
            ctx.strokeStyle = '#f85102'; ctx.lineWidth = 2; ctx.stroke();
        };
        draw();
        window.addEventListener('resize', draw);
        return () => window.removeEventListener('resize', draw);
    }, [data, max, fmt]);
    return <canvas ref={canvas} />;
}
