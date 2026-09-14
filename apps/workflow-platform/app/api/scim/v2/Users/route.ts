import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';

// In-memory / DB proxy for SCIM Users in execution plane
const scimUsersStore = new Map<string, {
  id: string;
  externalId?: string;
  userName: string;
  displayName: string;
  emails: Array<{ value: string; type?: string; primary?: boolean }>;
  active: boolean;
  roles: Array<{ value: string; primary?: boolean }>;
  createdAt: string;
  updatedAt: string;
}>();

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const filter = searchParams.get('filter');
  const startIndex = Math.max(1, parseInt(searchParams.get('startIndex') || '1', 10));
  const count = Math.min(100, Math.max(1, parseInt(searchParams.get('count') || '20', 10)));

  let users = Array.from(scimUsersStore.values());

  if (filter) {
    const match = filter.match(/userName\s+eq\s+["']([^"']+)["']/i);
    if (match) {
      const email = match[1].toLowerCase();
      users = users.filter((u) => u.userName.toLowerCase() === email);
    }
  }

  const paginated = users.slice(startIndex - 1, startIndex - 1 + count).map((u) => ({
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
    id: u.id,
    externalId: u.externalId,
    userName: u.userName,
    displayName: u.displayName,
    emails: u.emails,
    active: u.active,
    roles: u.roles,
    meta: {
      resourceType: 'User',
      created: u.createdAt,
      lastModified: u.updatedAt,
      location: `/api/scim/v2/Users/${u.id}`,
    },
  }));

  return NextResponse.json(
    {
      schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
      totalResults: users.length,
      startIndex,
      itemsPerPage: count,
      Resources: paginated,
    },
    {
      headers: {
        'Content-Type': 'application/scim+json; charset=utf-8',
      },
    },
  );
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const id = `scim-usr-${randomUUID()}`;
    const email = body.emails?.[0]?.value || body.userName;
    const now = new Date().toISOString();

    const user = {
      id,
      externalId: body.externalId,
      userName: email,
      displayName: body.displayName || body.name?.formatted || email,
      emails: body.emails || [{ value: email, primary: true }],
      active: body.active !== false,
      roles: body.roles || [{ value: 'MEMBER', primary: true }],
      createdAt: now,
      updatedAt: now,
    };

    scimUsersStore.set(id, user);

    return NextResponse.json(
      {
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        id: user.id,
        externalId: user.externalId,
        userName: user.userName,
        displayName: user.displayName,
        emails: user.emails,
        active: user.active,
        roles: user.roles,
        meta: {
          resourceType: 'User',
          created: user.createdAt,
          lastModified: user.updatedAt,
          location: `/api/scim/v2/Users/${user.id}`,
        },
      },
      {
        status: 201,
        headers: {
          'Content-Type': 'application/scim+json; charset=utf-8',
          Location: `/api/scim/v2/Users/${user.id}`,
        },
      },
    );
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
