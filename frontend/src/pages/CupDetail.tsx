import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { MapPin, Calendar, Users, ExternalLink, Paperclip, ThumbsUp, ArrowLeft, CalendarPlus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { api, type Cup, type Attachment } from '@/lib/api';
import { formatDateRange } from '@/lib/utils';
import { toast } from '@/components/ui/use-toast';
import { Toaster } from '@/components/ui/toaster';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function CupDetail() {
  const { id } = useParams<{ id: string }>();
  const [cup, setCup] = useState<Cup | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [voted, setVoted] = useState(false);
  const [voting, setVoting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const cupId = parseInt(id);
    Promise.all([
      api.cups.get(cupId),
      api.attachments.listForCup(cupId),
      api.cups.voteStatus([cupId]),
    ]).then(([cup, atts, status]) => {
      setCup(cup);
      setAttachments(atts);
      setVoted(!!status[cupId]);
    }).catch(() => {
      setCup(null);
    }).finally(() => setLoading(false));
  }, [id]);

  async function handleVote() {
    if (!cup || voted || voting) return;
    setVoting(true);
    setCup((c) => c ? { ...c, thumbs_up: c.thumbs_up + 1 } : c);
    setVoted(true);
    try {
      const result = await api.cups.vote(cup.id);
      setCup((c) => c ? { ...c, thumbs_up: result.thumbs_up } : c);
    } catch (err: any) {
      setCup((c) => c ? { ...c, thumbs_up: c.thumbs_up - 1 } : c);
      setVoted(false);
      if (err.message?.includes('redan röstat')) {
        toast({ title: 'Redan röstat', description: 'Du har redan röstat på denna cup.' });
      } else {
        toast({ variant: 'destructive', title: 'Fel', description: 'Kunde inte spara röst.' });
      }
    } finally {
      setVoting(false);
    }
  }

  const ageClasses = cup?.age_classes
    .split(',')
    .map((s) => parseInt(s.trim()))
    .filter((n) => !isNaN(n))
    .sort((a, b) => a - b)
    .map((n) => `${n} år`) ?? [];

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b bg-white sticky top-0 z-10 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <img src="/logo.png" alt="Landvetter IF" className="h-10 w-auto" />
          <div>
            <h1 className="font-bold text-lg leading-tight">Landvetter IF</h1>
            <p className="text-xs text-muted-foreground leading-tight">Cupportalen</p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="h-4 w-4" /> Tillbaka till alla cuper
        </Link>

        {loading ? (
          <div className="py-12 text-center text-muted-foreground">Laddar...</div>
        ) : !cup ? (
          <div className="py-12 text-center text-muted-foreground">Cupen hittades inte.</div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold">{cup.name}</h2>
                {cup.cup_type && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {cup.cup_type.split(',').map((t) => (
                      <Badge key={t} variant="secondary">{t.trim()}</Badge>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={handleVote}
                disabled={voted || voting}
                className={`flex flex-col items-center gap-0.5 p-3 rounded-xl transition-colors shrink-0 ${
                  voted
                    ? 'text-[#CC0000] bg-red-50 cursor-default'
                    : 'text-muted-foreground hover:text-[#CC0000] hover:bg-red-50'
                }`}
                title={voted ? 'Du har röstat' : 'Tumme upp'}
              >
                <ThumbsUp className={`h-6 w-6 ${voted ? 'fill-current' : ''}`} />
                <span className="text-sm font-semibold">{cup.thumbs_up}</span>
              </button>
            </div>

            <div className="space-y-2 text-base">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                <span>{cup.location}</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                <span>{formatDateRange(cup.start_date, cup.end_date)}</span>
              </div>
              {ageClasses.length > 0 && (
                <div className="flex items-start gap-2">
                  <Users className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="flex flex-wrap gap-1.5">
                    {ageClasses.map((cls) => (
                      <Badge key={cls} variant="secondary">{cls}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {cup.description && (
              <div className="prose prose-sm max-w-none text-muted-foreground whitespace-pre-wrap border-t pt-4">
                {cup.description}
              </div>
            )}

            <div className="flex flex-wrap gap-3 border-t pt-4">
              {cup.url && (
                <a
                  href={cup.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-[#CC0000] hover:text-[#AA0000] font-medium"
                >
                  <ExternalLink className="h-4 w-4" /> Mer information
                </a>
              )}
              <a
                href={api.cups.icalUrl(cup.id)}
                className="inline-flex items-center gap-1.5 text-sm text-[#CC0000] hover:text-[#AA0000] font-medium"
              >
                <CalendarPlus className="h-4 w-4" /> Lägg i kalender
              </a>
            </div>

            {attachments.length > 0 && (
              <div className="border-t pt-4 space-y-2">
                <p className="text-sm font-medium">Bilagor</p>
                {attachments.map((att) => (
                  <a
                    key={att.id}
                    href={`/api/attachments/${att.id}/file`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-[#CC0000] hover:text-[#AA0000]"
                  >
                    <Paperclip className="h-4 w-4 shrink-0" />
                    <span>{att.original_name}</span>
                    <span className="text-xs text-muted-foreground">({formatSize(att.size)})</span>
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
      <Toaster />
    </div>
  );
}
