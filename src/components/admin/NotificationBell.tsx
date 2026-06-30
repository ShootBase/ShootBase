import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Bell, CheckCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  listAdminBellNotifications,
  markAdminBellRead,
  markAllAdminBellRead,
  type AdminBellNotification,
} from '@/lib/admin-bell.functions';

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

const TYPE_LABEL: Record<string, string> = {
  support_ticket: 'Support ticket',
  invalid_contact_report: 'Invalid contact',
  lead_issue: 'Project issue',
  payment_issue: 'Payment issue',
  technical_issue: 'Technical issue',
  user_report: 'User report',
  other: 'Alert',
};

export function NotificationBell() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const list = useServerFn(listAdminBellNotifications);
  const markRead = useServerFn(markAdminBellRead);
  const markAll = useServerFn(markAllAdminBellRead);
  const [open, setOpen] = useState(false);

  const { data = [] } = useQuery({
    queryKey: ['admin-bell'],
    queryFn: () => list(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  // Realtime subscription — unique channel name per mount so multiple bells
  // (e.g. nested AdminShells) never collide on `.on()` after `.subscribe()`.
  useEffect(() => {
    const name = `admin_notifications_bell:${Math.random().toString(36).slice(2)}`;
    const channel = supabase.channel(name);
    channel
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'admin_notifications' },
        () => qc.invalidateQueries({ queryKey: ['admin-bell'] }),
      )
      .subscribe();
    return () => {
      try { supabase.removeChannel(channel); } catch { /* noop */ }
    };
  }, [qc]);

  const unread = (data as AdminBellNotification[]).filter((n) => !n.read_at).length;

  async function handleClick(n: AdminBellNotification) {
    setOpen(false);
    if (!n.read_at) {
      try { await markRead({ data: { id: n.id } }); } catch { /* noop */ }
      qc.invalidateQueries({ queryKey: ['admin-bell'] });
    }
    if (n.link) navigate({ to: n.link });
  }

  async function handleMarkAll() {
    try { await markAll(); } catch { /* noop */ }
    qc.invalidateQueries({ queryKey: ['admin-bell'] });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 shrink-0"
          aria-label="Notifications"
        >
          <Bell className="h-4.5 w-4.5" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold flex items-center justify-center">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="font-medium text-sm">Notifications</div>
          {unread > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={handleMarkAll}>
              <CheckCheck className="h-3.5 w-3.5" /> Mark all read
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-[420px]">
          {data.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              You're all caught up.
            </div>
          ) : (
            <ul className="divide-y">
              {(data as AdminBellNotification[]).map((n) => {
                const meta = (n.metadata ?? {}) as Record<string, any>;
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => handleClick(n)}
                      className={`w-full text-left px-4 py-3 hover:bg-muted/60 transition-colors flex gap-3 ${n.read_at ? '' : 'bg-primary/5'}`}
                    >
                      <span
                        className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${n.read_at ? 'bg-transparent' : 'bg-primary'}`}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px] font-normal">
                            {TYPE_LABEL[n.type] ?? n.type}
                          </Badge>
                          <span className="text-[11px] text-muted-foreground">
                            {formatRelative(n.created_at)}
                          </span>
                        </div>
                        <div className="text-sm font-medium mt-1 truncate">{n.title}</div>
                        {n.message ? (
                          <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                            {n.message}
                          </div>
                        ) : null}
                        {meta.user_email || meta.user_name ? (
                          <div className="text-[11px] text-muted-foreground mt-1 truncate">
                            {meta.user_name || ''}{meta.user_email ? ` · ${meta.user_email}` : ''}
                          </div>
                        ) : null}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
