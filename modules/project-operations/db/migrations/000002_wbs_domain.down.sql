BEGIN;

DROP TABLE IF EXISTS gigalibs_project_operations.timesheets;
DROP TABLE IF EXISTS gigalibs_project_operations.labor_rates;
DROP TABLE IF EXISTS gigalibs_project_operations.project_issues;
DROP TABLE IF EXISTS gigalibs_project_operations.project_lines;
DROP TABLE IF EXISTS gigalibs_project_operations.project_tasks;
DROP TABLE IF EXISTS gigalibs_project_operations.project_phases;
DROP TABLE IF EXISTS gigalibs_project_operations.projects;

DELETE FROM gigalibs_project_operations.schema_migrations WHERE version = 2;

COMMIT;
