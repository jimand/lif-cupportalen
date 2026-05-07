import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { CupFilters } from '@/lib/api';

interface CupFilterProps {
  filters: CupFilters;
  onChange: (filters: CupFilters) => void;
}

const AGES = Array.from({ length: 12 }, (_, i) => i + 7); // 7–18

export function CupFilter({ filters, onChange }: CupFilterProps) {
  const hasActiveFilters = !!(filters.search || filters.age_class || filters.date_from || filters.date_to);

  function clear() {
    onChange({ sort: filters.sort });
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Sök på namn eller ort..."
          value={filters.search || ''}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          className="pl-9"
        />
      </div>

      <div className="flex flex-wrap gap-2">
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

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clear} className="gap-1">
            <X className="h-3.5 w-3.5" />
            Rensa filter
          </Button>
        )}
      </div>
    </div>
  );
}
