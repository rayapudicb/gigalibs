import * as React from 'react';
import type { AdminLayoutProps, NavItem } from '../types.js';

export const AdminLayout: React.FC<AdminLayoutProps> = ({
  appName = 'GigaAdmin',
  tenantName,
  user,
  navigation,
  navGroups,
  children,
}) => {
  const renderItem = (item: NavItem, idx: number) => {
    const content = (
      <>
        <div className="flex items-center space-x-2.5 min-w-0 flex-1 pr-2">
          {item.icon && <span className="opacity-80 shrink-0">{item.icon}</span>}
          <span className="truncate">{item.label}</span>
        </div>
        {item.badge !== undefined && (
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider shrink-0 whitespace-nowrap ${
              item.active
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 border border-slate-200'
            }`}
          >
            {item.badge}
          </span>
        )}
      </>
    );

    const baseClass = `w-full flex items-center justify-between px-3 py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer text-left ${
      item.active
        ? 'bg-blue-50 text-blue-700 shadow-xs border border-blue-100 font-bold'
        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
    }`;

    const href = item.href || (item.id ? `?tab=${item.id}` : '#');

    return (
      <a
        key={item.id || item.href || item.label || idx}
        href={href}
        onClick={(e) => {
          if (!e.ctrlKey && !e.metaKey && !e.shiftKey && e.button === 0 && item.onClick) {
            e.preventDefault();
            item.onClick();
          }
        }}
        className={baseClass}
      >
        {content}
      </a>
    );
  };

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans text-slate-900">
      {/* Left Sidebar - Widened to 320px for ample badge & label breathing room */}
      <aside className="w-80 border-r border-slate-200 bg-white flex flex-col justify-between shrink-0 h-screen sticky top-0 shadow-xs">
        <div className="flex flex-col h-full overflow-hidden">
          {/* Brand Header */}
          <div className="h-16 flex items-center px-6 border-b border-slate-100 shrink-0">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white font-black text-base shadow-sm">
                G
              </div>
              <div className="overflow-hidden">
                <div className="font-bold text-sm leading-tight text-slate-900 truncate">{appName}</div>
                {tenantName && (
                  <div className="text-[11px] text-blue-600 font-semibold truncate flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                    {tenantName}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Grouped Sidebar Navigation */}
          <nav className="flex-1 p-3.5 space-y-5 overflow-y-auto">
            {navGroups ? (
              navGroups.map((group, gIdx) => {
                const groupHref = group.href || (group.items[0]?.href) || (group.items[0]?.id ? `?tab=${group.items[0].id}` : '#');
                return (
                  <div key={group.title || gIdx} className="space-y-1.5">
                    <a
                      href={groupHref}
                      onClick={(e) => {
                        if (!e.ctrlKey && !e.metaKey && !e.shiftKey && e.button === 0) {
                          if (group.onClick) {
                            e.preventDefault();
                            group.onClick();
                          } else if (group.items[0]?.onClick) {
                            e.preventDefault();
                            group.items[0].onClick();
                          }
                        }
                      }}
                      className="px-3 text-[10px] font-black tracking-wider text-slate-400 hover:text-blue-600 uppercase block cursor-pointer transition"
                      title={`Open ${group.title} (Right-click to open in new tab)`}
                    >
                      {group.title}
                    </a>
                    <div className="space-y-0.5">
                      {group.items.map((item, iIdx) => renderItem(item, iIdx))}
                    </div>
                  </div>
                );
              })
            ) : navigation ? (
              <div className="space-y-0.5">
                {navigation.map((item, idx) => renderItem(item, idx))}
              </div>
            ) : null}
          </nav>
        </div>

        {/* User Profile Footer */}
        {user && (
          <div className="p-4 border-t border-slate-100 flex items-center space-x-3 shrink-0 bg-slate-50/50">
            <div className="w-9 h-9 rounded-full bg-blue-100 border border-blue-200 flex items-center justify-center font-bold text-blue-700 text-xs">
              {user.name.charAt(0)}
            </div>
            <div className="overflow-hidden">
              <div className="text-xs font-bold text-slate-900 truncate">{user.name}</div>
              <div className="text-[10px] text-slate-500 font-mono truncate">{user.email}</div>
            </div>
          </div>
        )}
      </aside>

      {/* Main Content Area - 30px padding for maximum real estate coverage */}
      <main className="flex-1 flex flex-col min-w-0">
        <div className="px-[30px] py-6 flex-1 overflow-auto w-full">{children}</div>
      </main>
    </div>
  );
};
