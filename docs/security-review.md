# Security Review (Client)

Treat client as untrusted for scores, unlocks, tournament entry, invitation validation. No private secrets in frontend. XSS: prefer text binding over HTML. Tokens not sent to analytics.
