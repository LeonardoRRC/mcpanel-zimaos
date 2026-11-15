import { useEffect, useState } from 'react';
import { api } from '../api';
import type { Meta } from '../types';
import { useUI } from '../ui';

/** <option>s for every MCJars server type, grouped like the catalog. */
export function SoftwareOptions({ meta }: { meta: Meta }) {
    const groups = [...new Set([...Object.keys(meta.groups), ...meta.types.map((t) => t.group)])];
    return <>
        {groups.map((g) => {
            const list = meta.types.filter((t) => t.group === g);
            if (!list.length) return null;
            return (
                <optgroup key={g} label={meta.groups[g] ?? g.charAt(0).toUpperCase() + g.slice(1)}>
                    {list.map((t) => <option key={t.id} value={t.id}>{t.name}{t.deprecated ? ' (obsoleto)' : ''}</option>)}
                </optgroup>
            );
        })}
    </>;
}

type Version = { id: string; type: string; java?: number };

/** Minecraft versions of a server type (MCJars). Snapshots only when asked, or when it is the current one. */
export function VersionSelect({ type, value, onChange, snapshots, current }: {
    type: string; value: string; onChange: (v: string) => void; snapshots: boolean; current?: string | null;
}) {
    const { toast } = useUI();
    const [versions, setVersions] = useState<Version[] | null>(null);
    const [failed, setFailed] = useState(false);
    useEffect(() => {
        let live = true;
        setVersions(null);
        setFailed(false);
        api<{ versions: Version[] }>('software.versions', { type }).then(
            (r) => { if (live) setVersions(r.versions); },
            (e: Error) => { if (live) { setFailed(true); setVersions([]); toast(e.message, 'error'); } },
        );
        return () => { live = false; };
    }, [type]); // eslint-disable-line react-hooks/exhaustive-deps

    const shown = (versions ?? []).filter((v) => snapshots || v.type === 'RELEASE' || v.id === current);
    // Keep the selection valid when the list changes.
    useEffect(() => {
        if (!versions) return;
        if (!shown.some((v) => v.id === value)) onChange(shown.find((v) => v.id === current)?.id ?? shown[0]?.id ?? '');
    }, [versions, snapshots]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <select className="input dark" value={value} disabled={!versions} onChange={(e) => onChange(e.target.value)}>
            {!versions ? <option value="">Cargando...</option>
                : failed ? <option value="">Sin conexión</option>
                : !shown.length ? <option value="">Sin versiones estables (activa snapshots)</option>
                : shown.map((v) => <option key={v.id} value={v.id}>{v.id}{v.type === 'RELEASE' ? '' : ' · ' + v.type.toLowerCase()}{v.java ? ' — Java ' + v.java : ''}</option>)}
        </select>
    );
}
