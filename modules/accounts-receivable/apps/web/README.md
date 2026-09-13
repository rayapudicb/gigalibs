# AR web application

Standalone Next.js application using only the public AR API and generic OIDC. Authorization Code + PKCE,
state, nonce, encrypted HTTP-only sessions, refresh, CSRF origin checks, and a bounded same-origin BFF keep
access tokens out of browser JavaScript.

Implemented routes cover overview, setup, customers, invoice list/create/detail/edit/issue, pagination,
loading, empty, failure, concurrency feedback, and immutable-issued state. Remaining routes are listed in
`../../docs/requirements/PRODUCT_REQUIREMENTS.md`; they are not implied by navigation or this first slice.
