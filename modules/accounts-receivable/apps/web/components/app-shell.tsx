import Link from 'next/link';

export function AppShell({ children, subject }: { children: React.ReactNode; subject: string }) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">
            G
          </span>
          <span>
            <strong>GigaLibs</strong>
            <small>Accounts Receivable</small>
          </span>
        </Link>
        <nav aria-label="Primary navigation">
          <NavLink href="/" label="Overview" glyph="⌁" />
          <NavLink href="/customers" label="Customers" glyph="◎" />
          <NavLink href="/invoices" label="Invoices" glyph="▤" />
          <NavLink href="/setup" label="Settings" glyph="⚙" />
        </nav>
        <div className="sidebar-foot">
          <span className="health-dot" /> Connected workspace
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div>
            <span className="environment-pill">Operational</span>
          </div>
          <div className="identity">
            <span title={subject}>{subject}</span>
            <form action="/auth/logout" method="post">
              <button className="text-button" type="submit">
                Sign out
              </button>
            </form>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}

function NavLink({ href, label, glyph }: { href: string; label: string; glyph: string }) {
  return (
    <Link href={href}>
      <span aria-hidden="true">{glyph}</span>
      {label}
    </Link>
  );
}
