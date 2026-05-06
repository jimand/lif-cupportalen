import { useState } from 'react';
import { ThumbsUp, MapPin, Calendar, ExternalLink, Users } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api, type Cup } from '@/lib/api';
import { formatDateRange } from '@/lib/utils';
import { toast } from '@/components/ui/use-toast';

interface CupCardProps {
  cup: Cup;
  voted: boolean;
  onVoted: (cupId: number, newCount: number) => void;
}

export function CupCard({ cup, voted, onVoted }: CupCardProps) {
  const [voting, setVoting] = useState(false);

  const ageClasses = cup.age_classes
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  async function handleVote() {
    if (voted || voting) return;
    setVoting(true);
    // Optimistic update
    onVoted(cup.id, cup.thumbs_up + 1);
    try {
      const result = await api.cups.vote(cup.id);
      onVoted(cup.id, result.thumbs_up);
    } catch (err: any) {
      onVoted(cup.id, cup.thumbs_up);
      if (err.message?.includes('redan röstat')) {
        toast({ title: 'Redan röstat', description: 'Du har redan röstat på denna cup.' });
      } else {
        toast({ variant: 'destructive', title: 'Fel', description: 'Kunde inte spara röst.' });
      }
    } finally {
      setVoting(false);
    }
  }

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-lg leading-tight truncate">{cup.name}</h3>

            <div className="mt-2 space-y-1 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                <span>{cup.location}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 shrink-0" />
                <span>{formatDateRange(cup.start_date, cup.end_date)}</span>
              </div>
              {ageClasses.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 shrink-0" />
                  <div className="flex flex-wrap gap-1">
                    {ageClasses.map((cls) => (
                      <Badge key={cls} variant="secondary" className="text-xs py-0">
                        {cls}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {cup.description && (
              <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{cup.description}</p>
            )}
          </div>

          <div className="flex flex-col items-end gap-2 shrink-0">
            <button
              onClick={handleVote}
              disabled={voted || voting}
              className={`flex flex-col items-center gap-0.5 p-2 rounded-lg transition-colors ${
                voted
                  ? 'text-[#CC0000] bg-red-50 cursor-default'
                  : 'text-muted-foreground hover:text-[#CC0000] hover:bg-red-50'
              }`}
              title={voted ? 'Du har röstat' : 'Tumme upp'}
            >
              <ThumbsUp className={`h-5 w-5 ${voted ? 'fill-current' : ''}`} />
              <span className="text-xs font-medium">{cup.thumbs_up}</span>
            </button>
          </div>
        </div>

        {cup.url && (
          <div className="mt-3 pt-3 border-t">
            <a
              href={cup.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-[#CC0000] hover:text-[#AA0000] font-medium"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Mer information
            </a>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
