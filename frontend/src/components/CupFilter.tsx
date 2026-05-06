import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { CupFilters } from '@/lib/api';

interface CupFilterProps {
  filters: CupFilters;
  onChange: (filters: CupFilters) => void;
}

const AGE_CLASSES = ['P6', 'P7', 'P8', 'P9', 'P10', 'P11', 'P12', 'P13', 'P14', 'P15', 'P16', 'P17', 'P18', 'P19',
  'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12', 'F13', 'F14', 'F15', 'F16', 'F17', 'F18', 'F19'];

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
          placeholder="Sök på namn, ort eller åldersklass..."
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
            <SelectValue placeholder="Åldersklass" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alla klasser</SelectItem>
            {AGE_CLASSES.map((cls) => (
              <SelectItem key={cls} value={cls}>{cls}</SelectItem>
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
