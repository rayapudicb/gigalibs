-- Rollback migration for 000023_wfo_expenses
BEGIN;

DROP TABLE IF EXISTS gigalibs_workforce.wfo_expense_lines CASCADE;
DROP TABLE IF EXISTS gigalibs_workforce.wfo_expense_reports CASCADE;

COMMIT;
