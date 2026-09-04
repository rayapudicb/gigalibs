-- Provider selection is an explicit adapter decision. The database must not
-- silently select a payment provider when a caller omits that decision.
ALTER TABLE "payment_transactions" ALTER COLUMN "provider" DROP DEFAULT;
