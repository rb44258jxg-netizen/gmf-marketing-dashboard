export type ContentStatus = 'utkast' | 'granskning' | 'redo' | 'publicerad';
export type ContentType = 'blogg' | 'linkedin' | 'email' | 'annons' | 'web';
export type ContentTrack = 'case' | 'platform' | 'internal';

export interface PersonaRow {
  id: string;
  slug: string;
  name: string;
  age: number;
  title: string;
  avatar_bg: string;
  avatar_letter: string;
  badge: string;
  badge_class: string;
  role: string;
  portfolio: string;
  investment: string;
  behavior: string;
  triggers: string;
  objection: string;
  channels: string[];
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type PersonaInsert = Omit<PersonaRow, 'id' | 'created_at' | 'updated_at'>;
export type PersonaUpdate = Partial<PersonaInsert>;

export interface ContentItemRow {
  id: string;
  title: string;
  type: ContentType;
  status: ContentStatus;
  track: ContentTrack | null;
  file: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type ContentItemInsert = Omit<ContentItemRow, 'id' | 'created_at' | 'updated_at' | 'created_by'>;
export type ContentItemUpdate = Partial<ContentItemInsert>;

export interface AuditLogRow {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  created_at: string;
}

export type AuditLogInsert = Omit<AuditLogRow, 'id' | 'created_at'>;

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '12';
  };
  public: {
    Tables: {
      personas: {
        Row: PersonaRow;
        Insert: PersonaInsert;
        Update: PersonaUpdate;
        Relationships: [];
      };
      content_items: {
        Row: ContentItemRow;
        Insert: ContentItemInsert;
        Update: ContentItemUpdate;
        Relationships: [];
      };
      audit_log: {
        Row: AuditLogRow;
        Insert: AuditLogInsert;
        Update: Partial<AuditLogInsert>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
