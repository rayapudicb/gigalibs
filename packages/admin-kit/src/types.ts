import type * as React from 'react';

export interface NavItem {
  id?: string;
  label: string;
  href?: string;
  icon?: React.ReactNode;
  badge?: string | number;
  active?: boolean;
  onClick?: () => void;
}

export interface NavGroup {
  id?: string;
  title: string;
  href?: string;
  onClick?: () => void;
  items: NavItem[];
}

export interface AdminLayoutProps {
  appName?: string;
  tenantName?: string;
  user?: {
    name: string;
    email: string;
    avatarUrl?: string;
  };
  navigation?: NavItem[];
  navGroups?: NavGroup[];
  children: React.ReactNode;
}
