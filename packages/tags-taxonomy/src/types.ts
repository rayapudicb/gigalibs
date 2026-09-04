export interface Tag {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  color: string; // hex code e.g. '#3b82f6'
  category?: string;
  parentId?: string | null;
}
