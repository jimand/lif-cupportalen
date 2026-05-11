import { useEffect, useState } from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import { Loader2, ExternalLink } from 'lucide-react';
import { api, type DetailedStats } from '@/lib/api';

const COLORS = ['#CC0000', '#e05050', '#f08080', '#fbb', '#fdd', '#b22', '#880000', '#550000', '#c44', '#d66'];

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold mt-0.5">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-base font-semibold mt-8 mb-4">{children}</h3>;
}

const umamiShareUrl = import.meta.env.VITE_UMAMI_SHARE_URL as string | undefined;

export function StatsTab() {
  const [stats, setStats] = useState<DetailedStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.admin.detailedStats()
      .then(setStats)
      .catch((e) => setError(e.message));
  }, []);

  if (error) {
    return <p className="text-sm text-destructive py-4">Kunde inte läsa statistik: {error}</p>;
  }

  if (!stats) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-[#CC0000]" />
      </div>
    );
  }

  const emailJobMap = Object.fromEntries(stats.emailStats.map((e) => [e.status, e.count]));

  return (
    <div className="space-y-2 pb-8">
      {/* ── Cuper ── */}
      <SectionTitle>Cuper</SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Tillagda senaste 12 mån"
          value={stats.cupsPerMonth.reduce((s, m) => s + m.count, 0)}
        />
        <StatCard
          label="Källa: e-post"
          value={stats.sourceStats.email}
          sub={`${stats.sourceStats.manual} manuellt tillagda`}
        />
        <StatCard
          label="Medeltid till godkännande"
          value={stats.avgApprovalHours != null ? `${stats.avgApprovalHours} h` : '–'}
        />
        <StatCard
          label="Cupformat"
          value={stats.typeDist.length}
          sub="unika format"
        />
      </div>

      {stats.cupsPerMonth.length > 0 && (
        <>
          <p className="text-sm text-muted-foreground pt-2">Cuper tillagda per månad (senaste 12 mån)</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stats.cupsPerMonth} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => [`${v} cuper`, 'Tillagda']} />
              <Bar dataKey="count" fill="#CC0000" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </>
      )}

      {stats.typeDist.length > 0 && (
        <>
          <p className="text-sm text-muted-foreground pt-4">Cupformat-fördelning (godkända cuper)</p>
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={stats.typeDist}
                  dataKey="count"
                  nameKey="type"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={(p: { type?: string; percent?: number }) => `${p.type ?? ''} ${Math.round((p.percent ?? 0) * 100)}%`}
                  labelLine={false}
                >
                  {stats.typeDist.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v, _, p) => [`${v} cuper`, p.payload.type]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {/* ── Röster ── */}
      {stats.topCups.length > 0 && (
        <>
          <SectionTitle>Röster – top {stats.topCups.length}</SectionTitle>
          <ResponsiveContainer width="100%" height={Math.max(200, stats.topCups.length * 36)}>
            <BarChart
              data={stats.topCups}
              layout="vertical"
              margin={{ top: 0, right: 16, bottom: 0, left: 0 }}
            >
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => [`${v} röster`, 'Röster']} />
              <Bar dataKey="votes" fill="#CC0000" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </>
      )}

      {/* ── Prenumeranter ── */}
      {stats.subsPerMonth.length > 0 && (
        <>
          <SectionTitle>Prenumeranttillväxt</SectionTitle>
          <p className="text-sm text-muted-foreground -mt-3 mb-3">Nya bekräftade prenumeranter per månad</p>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={stats.subsPerMonth} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => [`${v} prenumeranter`, 'Nya']} />
              <Line type="monotone" dataKey="count" stroke="#CC0000" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </>
      )}

      {/* ── E-postjobb ── */}
      <SectionTitle>E-postbearbetning</SectionTitle>
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Bearbetade" value={emailJobMap['processed'] ?? 0} />
        <StatCard label="Misslyckade" value={emailJobMap['failed'] ?? 0} />
        <StatCard label="Väntande" value={emailJobMap['pending'] ?? 0} />
      </div>

      {/* ── Webbanalys (Umami) ── */}
      <SectionTitle>Webbanalys</SectionTitle>
      {umamiShareUrl ? (
        <iframe
          src={umamiShareUrl}
          className="w-full rounded-lg border"
          style={{ height: 640 }}
          title="Umami webbanalys"
        />
      ) : (
        <div className="rounded-lg border bg-muted/40 p-5 text-sm space-y-3">
          <p className="font-medium">Umami är inte konfigurerat</p>
          <p className="text-muted-foreground">
            Sätt upp en självhostad Umami-instans och lägg till följande i{' '}
            <code className="bg-muted px-1 rounded">frontend/.env</code>:
          </p>
          <pre className="bg-background rounded p-3 text-xs overflow-x-auto border">
{`VITE_UMAMI_URL=https://umami.din-server.se
VITE_UMAMI_WEBSITE_ID=<website-id från Umami>
VITE_UMAMI_SHARE_URL=https://umami.din-server.se/share/<share-id>`}
          </pre>
          <p className="text-muted-foreground">
            Snabbstart med Docker:
          </p>
          <pre className="bg-background rounded p-3 text-xs overflow-x-auto border">
{`docker run -d \\
  -e DATABASE_URL="postgresql://..." \\
  -p 3000:3000 \\
  ghcr.io/umami-software/umami:postgresql-latest`}
          </pre>
          <a
            href="https://umami.is/docs/getting-started"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[#CC0000] hover:text-[#AA0000]"
          >
            Umami – kom igång <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      )}
    </div>
  );
}
