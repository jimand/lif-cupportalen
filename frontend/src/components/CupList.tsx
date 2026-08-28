import { useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CupRow } from './CupRow';
import { CupFilter } from './CupFilter';
import { Button } from '@/components/ui/button';
import { api, ApiError, type Cup, type CupFilters } from '@/lib/api';
import { Loader2, RefreshCw } from 'lucide-react';

const DEFAULTS: CupFilters = { sort: 'votes', hide_past: 'true' };

/** Fält som speglas i URL:en, så att filtreringen går att dela och överlever tillbaka-knappen. */
const FILTER_KEYS = [
  'search', 'location', 'age_class', 'date_from', 'date_to', 'sort', 'hide_past', 'cup_type',
] as const;

function filtersFromParams(params: URLSearchParams): CupFilters {
  const f: Record<string, string> = {};
  for (const key of FILTER_KEYS) {
    const v = params.get(key);
    if (v) f[key] = v;
  }
  return { ...DEFAULTS, ...f } as CupFilters;
}

function paramsFromFilters(filters: CupFilters): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    const v = filters[key];
    // Utelämna värden som är lika med defaulten – annars blir URL:en full av
    // brus redan innan användaren har filtrerat på något.
    if (v && v !== DEFAULTS[key]) params.set(key, v);
  }
  return params;
}

export function CupList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [cups, setCups] = useState<Cup[]>([]);
  const [votedMap, setVotedMap] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Ökas av "Försök igen" för att köra om hämtningen utan att ändra filtren. */
  const [reloadToken, setReloadToken] = useState(0);

  const filters = useMemo(() => filtersFromParams(searchParams), [searchParams]);

  const setFilters = useCallback(
    (next: CupFilters) => {
      // replace istället för push: annars får användaren ett historikbidrag per
      // bokstav i sökrutan och måste trycka tillbaka tio gånger för att lämna sidan.
      setSearchParams(paramsFromFilters(next), { replace: true });
    },
    [setSearchParams]
  );

  // Serialiseras för att effekten ska trigga på faktisk filterändring, inte på
  // att useMemo gett ett nytt objekt.
  const filterKey = searchParams.toString();

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    // Behåll den gamla listan under omladdning – att byta ut den mot en spinner
    // vid varje tangenttryckning gör att sidan flimrar när man söker.
    if (cups.length === 0) setLoading(true);
    else setRefreshing(true);
    setError(null);

    (async () => {
      try {
        const data = await api.cups.list(filtersFromParams(new URLSearchParams(filterKey)), controller.signal);
        if (cancelled) return;
        setCups(data);
        // Nollställ röststatus även när listan blev tom, annars ligger gammal
        // status kvar och färgar nästa resultat.
        if (data.length === 0) {
          setVotedMap({});
        } else {
          const status = await api.cups
            .voteStatus(data.map((c) => c.id), controller.signal)
            .catch(() => ({} as Record<number, boolean>));
          if (!cancelled) setVotedMap(status);
        }
      } catch (err) {
        if (cancelled || (err instanceof DOMException && err.name === 'AbortError')) return;
        setError(
          err instanceof ApiError && err.isNetworkError
            ? 'Ingen kontakt med servern. Kontrollera din uppkoppling.'
            : 'Kunde inte ladda cuper.'
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
    // cups.length medvetet utelämnad – den styr bara valet av spinner-läge och
    // ska inte trigga en ny hämtning.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, reloadToken]);

  function handleVoted(cupId: number, newCount: number, voted: boolean) {
    setCups((prev) => prev.map((c) => (c.id === cupId ? { ...c, thumbs_up: newCount } : c)));
    setVotedMap((prev) => ({ ...prev, [cupId]: voted }));
  }

  return (
    <div className="space-y-4">
      <CupFilter filters={filters} onChange={setFilters} />

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-[#AB2328]" aria-label="Laddar cuper" />
        </div>
      ) : error ? (
        <div className="text-center py-12 space-y-3">
          <p className="text-destructive">{error}</p>
          <Button variant="outline" size="sm" onClick={() => setReloadToken((n) => n + 1)} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            Försök igen
          </Button>
        </div>
      ) : cups.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          Inga cuper hittades. Prova att ändra filtren.
        </div>
      ) : (
        <ul className={`rounded-lg border divide-y overflow-hidden transition-opacity ${refreshing ? 'opacity-60' : ''}`}>
          {cups.map((cup) => (
            <li key={cup.id}>
              <CupRow cup={cup} voted={!!votedMap[cup.id]} onVoted={handleVoted} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
