const BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Okänt fel' }));
    throw new Error(body.error || `HTTP ${res.status}`);
  }

  return res.json();
}

export interface Cup {
  id: number;
  name: string;
  location: string;
  start_date: string;
  end_date?: string;
  age_classes: string;
  cup_type?: string;
  url?: string;
  description?: string;
  notes?: string;
  source_email?: string;
  status: 'pending' | 'approved';
  thumbs_up: number;
  potential_duplicate?: number;
  created_at: string;
  updated_at: string;
}

export interface Stats {
  total: number;
  approved: number;
  pending: number;
  total_votes: number;
  attachment_count: number;
}

export interface EmailJob {
  id: number;
  gmail_message_id: string;
  subject?: string;
  sender?: string;
  raw_body?: string;
  parsed_cup_id?: number;
  cup_name?: string;
  status: 'pending' | 'processed' | 'failed';
  received_at?: string;
  processed_at?: string;
}

export interface Attachment {
  id: number;
  original_name: string;
  mime_type: string;
  size: number;
  created_at: string;
}

export interface CupFilters {
  search?: string;
  location?: string;
  age_class?: string;
  date_from?: string;
  date_to?: string;
  sort?: 'votes' | 'date';
  hide_past?: 'true' | 'false';
  cup_type?: string;
}

function buildQuery(params: Record<string, string | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) q.set(k, v);
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

export const api = {
  cups: {
    list: (filters?: CupFilters) =>
      request<Cup[]>(`/cups${buildQuery({ ...filters })}`),

    get: (id: number) => request<Cup>(`/cups/${id}`),

    icalUrl: (id: number) => `${BASE}/cups/${id}/ical`,

    create: (data: Omit<Cup, 'id' | 'status' | 'thumbs_up' | 'created_at' | 'updated_at' | 'source_email' | 'potential_duplicate'>) =>
      request<{ id: number; message: string }>('/cups', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    vote: (id: number) =>
      request<{ thumbs_up: number }>(`/cups/${id}/vote`, { method: 'POST' }),

    voteStatus: (ids: number[]) =>
      request<Record<number, boolean>>(`/cups/vote-status/check?ids=${ids.join(',')}`),
  },

  subscriptions: {
    subscribe: (email: string) =>
      request<{ ok: boolean }>('/subscriptions', {
        method: 'POST',
        body: JSON.stringify({ email }),
      }),
  },

  auth: {
    login: (password: string) =>
      request<{ ok: boolean }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ password }),
      }),

    logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),

    me: () => request<{ admin: boolean }>('/auth/me'),
  },

  attachments: {
    listForCup: (cupId: number) =>
      request<Attachment[]>(`/cups/${cupId}/attachments`),

    upload: async (cupId: number, file: File): Promise<Attachment> => {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${BASE}/admin/cups/${cupId}/attachments`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Okänt fel' }));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      return res.json();
    },

    delete: (id: number) =>
      request<{ ok: boolean }>(`/admin/attachments/${id}`, { method: 'DELETE' }),
  },

  admin: {
    listCups: () => request<Cup[]>('/admin/cups'),

    stats: () => request<Stats>('/admin/stats'),

    pollNow: () => request<{ ok: boolean }>('/admin/poll-now', { method: 'POST' }),

    exportCsv: async () => {
      const res = await fetch(`${BASE}/admin/cups.csv`, { credentials: 'include' });
      if (!res.ok) throw new Error('Kunde inte exportera');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'cuper.csv';
      a.click();
      URL.revokeObjectURL(url);
    },

    updateCup: (id: number, data: Partial<Cup>) =>
      request<Cup>(`/admin/cups/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),

    deleteCup: (id: number) =>
      request<{ ok: boolean }>(`/admin/cups/${id}`, { method: 'DELETE' }),

    approveCup: (id: number) =>
      request<Cup>(`/admin/cups/${id}/approve`, { method: 'PATCH' }),

    listEmailJobs: () => request<EmailJob[]>('/admin/email-jobs'),

    createCupFromEmail: (jobId: number, data: object) =>
      request<{ cup_id: number }>(`/admin/email-jobs/${jobId}/create-cup`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },
};
