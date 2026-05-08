import { useEffect, useState, useCallback } from 'react';
import { CupRow } from './CupRow';
import { CupFilter } from './CupFilter';
import { api, type Cup, type CupFilters } from '@/lib/api';
import { Loader2 } from 'lucide-react';

export function CupList() {
  const [cups, setCups] = useState<Cup[]>([]);
  const [votedMap, setVotedMap] = useState<Record<number, boolean>>({});
  const [filters, setFilters] = useState<CupFilters>({ sort: 'votes', hide_past: 'true' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCups = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.cups.list(filters);
      setCups(data);

      if (data.length > 0) {
        const ids = data.map((c) => c.id);
        const status = await api.cups.voteStatus(ids).catch(() => ({} as Record<number, boolean>));
        setVotedMap(status);
      }
    } catch {
      setError('Kunde inte ladda cuper. Försök igen.');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadCups();
  }, [loadCups]);

  function handleVoted(cupId: number, newCount: number, voted: boolean) {
    setCups((prev) => prev.map((c) => (c.id === cupId ? { ...c, thumbs_up: newCount } : c)));
    setVotedMap((prev) => ({ ...prev, [cupId]: voted }));
  }

  return (
    <div className="space-y-4">
      <CupFilter filters={filters} onChange={setFilters} />

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-[#CC0000]" />
        </div>
      ) : error ? (
        <div className="text-center py-12 text-destructive">{error}</div>
      ) : cups.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          Inga cuper hittades. Prova att ändra filtren.
        </div>
      ) : (
        <div className="rounded-lg border divide-y overflow-hidden">
          {cups.map((cup) => (
            <CupRow
              key={cup.id}
              cup={cup}
              voted={!!votedMap[cup.id]}
              onVoted={handleVoted}
            />
          ))}
        </div>
      )}
    </div>
  );
}
