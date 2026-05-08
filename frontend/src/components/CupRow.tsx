import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ThumbsUp, MapPin, Calendar, ExternalLink, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { api, type Cup } from '@/lib/api';
import { formatDateRange, formatDate } from '@/lib/utils';
import { toast } from '@/components/ui/use-toast';

interface CupRowProps {
  cup: Cup;
  voted: boolean;
  onVoted: (cupId: number, newCount: number, voted: boolean) => void;
}

export function CupRow({ cup, voted, onVoted }: CupRowProps) {
  const [voting, setVoting] = useState(false);

  const ageClasses = (cup.age_classes ?? '')
    .split(',')
    .map((s) => parseInt(s.trim()))
    .filter((n) => !isNaN(n))
    .sort((a, b) => a - b)
    .map((n) => `${n} år`);

  async function handleVote() {
    if (voting) return;
    setVoting(true);
    try {
      const result = await api.cups.vote(cup.id);
      onVoted(cup.id, result.thumbs_up, result.voted);
    } catch {
      toast({ variant: 'destructive', title: 'Fel', description: 'Kunde inte spara röst.' });
    } finally {
      setVoting(false);
    }
  }

  const deadlinePassed = cup.registration_deadline && new Date(cup.registration_deadline) < new Date();

  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          {!!cup.recommended && <span title="Rekommenderas av Landvetter IF" className="shrink-0">⭐</span>}
          <Link to={`/cups/${cup.id}`} className="font-semibold hover:underline truncate">
            {cup.name}
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <MapPin className="h-3 w-3 shrink-0" />
            {cup.location}
          </span>
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3 shrink-0" />
            {formatDateRange(cup.start_date, cup.end_date)}
          </span>
          {cup.registration_deadline && (
            <span className={`flex items-center gap-1 ${deadlinePassed ? 'text-destructive' : ''}`}>
              <Clock className="h-3 w-3 shrink-0" />
              Sista anmälan: {formatDate(cup.registration_deadline)}
            </span>
          )}
        </div>
      </div>

      <div className="hidden sm:flex flex-wrap gap-1 shrink-0 max-w-[220px] justify-end">
        {ageClasses.map((cls) => (
          <Badge key={cls} variant="secondary" className="text-xs py-0 px-1.5">
            {cls}
          </Badge>
        ))}
        {cup.cup_type &&
          cup.cup_type.split(',').map((t) => (
            <Badge key={t} variant="outline" className="text-xs py-0 px-1.5">
              {t.trim()}
            </Badge>
          ))}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {cup.url && (
          <a
            href={cup.url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 rounded text-muted-foreground hover:text-[#CC0000] transition-colors"
            title="Mer information"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
        <button
          onClick={handleVote}
          disabled={voting}
          className={`flex items-center gap-1 px-2 py-1.5 rounded transition-colors text-sm font-medium ${
            voted
              ? 'text-[#CC0000] bg-red-50 hover:bg-red-100'
              : 'text-muted-foreground hover:text-[#CC0000] hover:bg-red-50'
          }`}
          title={voted ? 'Klicka för att ångra din röst' : 'Tumme upp'}
        >
          <ThumbsUp className={`h-4 w-4 ${voted ? 'fill-current' : ''}`} />
          <span>{cup.thumbs_up}</span>
        </button>
      </div>
    </div>
  );
}
