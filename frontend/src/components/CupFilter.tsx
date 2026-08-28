import { Search, X, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { CupFilters } from '@/lib/api';
import { CUP_TYPES, parseCupTypes, serializeCupTypes } from '@/components/CupTypeSelect';

interface CupFilterProps {
  filters: CupFilters;
  onChange: (filters: CupFilters) => void;
}

const AGES = Array.from({ length: 12 }, (_, i) => i + 7);

export function CupFilter({ filters, onChange }: CupFilterProps) {
  const activeCount = [filters.search, filters.age_class, filters.date_from, filters.date_to, filters.cup_type].filter(Boolean).length;
  const hasActiveFilters = activeCount > 0;
  const [open, setOpen] = useState(hasActiveFilters);

  function clear() {
    onChange({ sort: filters.sort, hide_past: filters.hide_past, cup_type: undefined });
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Sök på namn eller ort..."
            value={filters.search || ''}
            onChange={(e) => onChange({ ...filters, search: e.target.value })}
            className="pl-9"
          />
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm font-medium transition-colors shrink-0 ${
            open && hasActiveFilters
              ? 'bg-[#AB2328] text-white border-[#AB2328]'
              : open
              ? 'bg-muted border-input text-foreground'
              : hasActiveFilters
              ? 'border-[#AB2328] text-[#AB2328] bg-white'
              : 'border-input text-muted-foreground bg-white hover:bg-muted'
          }`}
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filtrera{activeCount > 0 ? ` (${activeCount})` : ''}
        </button>
      </div>

      {open && <div className="flex flex-wrap gap-2">
        <Select
          value={filters.age_class || 'all'}
          onValueChange={(v) => onChange({ ...filters, age_class: v === 'all' ? undefined : v })}
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Ålder" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alla åldrar</SelectItem>
            {AGES.map((age) => (
              <SelectItem key={age} value={String(age)}>{age} år</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {CUP_TYPES.map((t) => {
          const selected = parseCupTypes(filters.cup_type || '');
          const active = selected.has(t);
          return (
            <button
              key={t}
              type="button"
              onClick={() => {
                const next = new Set(selected);
                if (active) next.delete(t); else next.add(t);
                const v = serializeCupTypes(next);
                onChange({ ...filters, cup_type: v || undefined });
              }}
              className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                active
                  ? 'bg-[#AB2328] text-white border-[#AB2328]'
                  : 'bg-white text-foreground border-input hover:border-[#AB2328]'
              }`}
            >
              {t}
            </button>
          );
        })}

        <Input
          type="date"
          placeholder="Från datum"
          value={filters.date_from || ''}
          onChange={(e) => onChange({ ...filters, date_from: e.target.value })}
          className="w-40"
        />

        <Input
          type="date"
          placeholder="Till datum"
          value={filters.date_to || ''}
          onChange={(e) => onChange({ ...filters, date_to: e.target.value })}
          className="w-40"
        />

        <Select
          value={filters.sort || 'votes'}
          onValueChange={(v) => onChange({ ...filters, sort: v as 'votes' | 'date' })}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Sortera" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="votes">Mest populära</SelectItem>
            <SelectItem value="date">Datum</SelectItem>
          </SelectContent>
        </Select>

        <button
          onClick={() => onChange({ ...filters, hide_past: filters.hide_past === 'false' ? 'true' : 'false' })}
          className={`inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md border transition-colors ${
            filters.hide_past !== 'false'
              ? 'bg-[#AB2328] text-white border-[#AB2328]'
              : 'bg-white text-muted-foreground border-input hover:bg-muted'
          }`}
        >
          Bara kommande
        </button>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clear} className="gap-1">
            <X className="h-3.5 w-3.5" />
            Rensa filter
          </Button>
        )}
      </div>}
    </div>
  );
}
