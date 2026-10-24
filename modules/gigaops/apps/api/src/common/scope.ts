// WI-OI-120ho (R5): a person (workforce_resources) carries no site of their own, so a place-scoped caller sees a
// person only through where that person is assigned — an engagement on a position at one of the caller's places, or
// a booking on a work requirement at one of them. Unassigned people are visible only to an unbounded caller (an
// administrator), which is intended. This is PLACES scope-by-assignment; UNITS scope-by-assignment and flipping the
// SCOPE_ENFORCING_MODULES allow-list are tracked separately (bookings/time/pay enforce places but not units yet).

/**
 * An SQL predicate limiting a query to rows about a person assigned at one of the caller's places. `placesParam` is
 * the bound parameter holding the place ids (a `uuid[]`). `personId` and `tenant` are the SQL expressions for the
 * person's id and tenant in the outer query — e.g. `r.id`/`r.tenant_id` for a people query, or
 * `a.resource_id`/`a.tenant_id` for an absences query.
 */
export function peoplePlacesScopeByAssignment(placesParam: string, personId = 'r.id', tenant = 'r.tenant_id'): string {
  return `(EXISTS (
      SELECT 1 FROM gigalibs_workforce.engagements e
        JOIN gigalibs_workforce.positions p ON p.tenant_id = e.tenant_id AND p.id = e.position_id
       WHERE e.tenant_id = ${tenant} AND e.resource_id = ${personId} AND e.status <> 'CANCELLED'
         AND p.site_ref = ANY(${placesParam})
    ) OR EXISTS (
      SELECT 1 FROM gigalibs_workforce.bookings b
        JOIN gigalibs_workforce.work_requirements wr ON wr.tenant_id = b.tenant_id AND wr.id = b.requirement_id
       WHERE b.tenant_id = ${tenant} AND b.resource_id = ${personId} AND b.status <> 'CANCELLED'
         AND wr.site_ref = ANY(${placesParam})
    ))`;
}
