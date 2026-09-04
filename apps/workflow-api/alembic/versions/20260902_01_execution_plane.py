"""Create execution-only durable persistence.

Revision ID: 20260902_01
Revises: None
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260902_01"
down_revision = None
branch_labels = None
depends_on = None


RUN_STATUS = "status IN ('queued','running','succeeded','failed','cancelled','action_required')"
STEP_STATUS = "status IN ('pending','running','succeeded','failed','skipped','dlq')"
OUTBOX_STATUS = "status IN ('pending','publishing','published','failed')"


def upgrade() -> None:
    op.create_table(
        "execution_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", sa.String(length=128), nullable=False),
        sa.Column("workflow_id", sa.String(length=128), nullable=False),
        sa.Column("workflow_version", sa.Integer(), nullable=False),
        sa.Column("workflow_checksum", sa.String(length=64), nullable=False),
        sa.Column("workflow_schema_version", sa.String(length=64), nullable=False),
        sa.Column("workflow_compiler_version", sa.String(length=64), nullable=False),
        sa.Column("initiated_by", sa.String(length=128), nullable=False),
        sa.Column("idempotency_key", sa.String(length=128), nullable=False),
        sa.Column("correlation_id", sa.String(length=128), nullable=False),
        sa.Column("trigger_type", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("graph_snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("input_schema", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("output_schema", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("input_ciphertext", sa.LargeBinary(), nullable=False),
        sa.Column("result_ciphertext", sa.LargeBinary(), nullable=True),
        sa.Column("payload_key_version", sa.String(length=128), nullable=False),
        sa.Column("cancellation_requested", sa.Boolean(), nullable=False),
        sa.Column("lease_token", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("lease_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error_class", sa.String(length=128), nullable=True),
        sa.Column("error_summary", sa.Text(), nullable=True),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("queued_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(RUN_STATUS, name="ck_execution_run_status"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("correlation_id"),
        sa.UniqueConstraint("tenant_id", "idempotency_key", name="uq_execution_run_idempotency"),
    )
    op.create_index("ix_execution_runs_lease", "execution_runs", ["status", "lease_expires_at"])
    op.create_index(
        "ix_execution_runs_tenant_created", "execution_runs", ["tenant_id", sa.text("created_at DESC")]
    )
    op.create_index(
        "ix_execution_runs_workflow_created", "execution_runs", ["workflow_id", sa.text("created_at DESC")]
    )

    op.create_table(
        "execution_steps",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("run_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", sa.String(length=128), nullable=False),
        sa.Column("node_id", sa.String(length=128), nullable=False),
        sa.Column("node_type", sa.String(length=128), nullable=False),
        sa.Column("attempt", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("input_hash", sa.String(length=64), nullable=False),
        sa.Column("output_hash", sa.String(length=64), nullable=True),
        sa.Column("output_ciphertext", sa.LargeBinary(), nullable=True),
        sa.Column("payload_key_version", sa.String(length=128), nullable=False),
        sa.Column("idempotency_key", sa.String(length=128), nullable=False),
        sa.Column("lease_token", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("lease_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error_class", sa.String(length=128), nullable=True),
        sa.Column("error_detail", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(STEP_STATUS, name="ck_execution_step_status"),
        sa.ForeignKeyConstraint(["run_id"], ["execution_runs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("run_id", "node_id", "attempt", name="uq_execution_step_attempt"),
    )
    op.create_index("ix_execution_steps_lease", "execution_steps", ["status", "lease_expires_at"])
    op.create_index("ix_execution_steps_run", "execution_steps", ["run_id", "created_at"])
    op.create_index("ix_execution_steps_tenant_status", "execution_steps", ["tenant_id", "status"])

    op.create_table(
        "side_effect_checkpoints",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", sa.String(length=128), nullable=False),
        sa.Column("run_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("node_id", sa.String(length=128), nullable=False),
        sa.Column("idempotency_key", sa.String(length=128), nullable=False),
        sa.Column("output_hash", sa.String(length=64), nullable=False),
        sa.Column("output_ciphertext", sa.LargeBinary(), nullable=False),
        sa.Column("payload_key_version", sa.String(length=128), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["run_id"], ["execution_runs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "idempotency_key", name="uq_side_effect_checkpoint"),
    )
    op.create_index(
        "ix_side_effect_checkpoints_run", "side_effect_checkpoints", ["run_id", "node_id"]
    )

    op.create_table(
        "execution_outbox",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("run_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("event_type", sa.String(length=128), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("available_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("lease_token", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("lease_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(OUTBOX_STATUS, name="ck_execution_outbox_status"),
        sa.ForeignKeyConstraint(["run_id"], ["execution_runs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_execution_outbox_pending",
        "execution_outbox",
        ["status", "available_at", "created_at"],
    )

    op.execute(
        """
        CREATE FUNCTION protect_execution_run_evidence() RETURNS TRIGGER AS $$
        BEGIN
          IF ROW(OLD.tenant_id, OLD.workflow_id, OLD.workflow_version,
                 OLD.workflow_checksum, OLD.workflow_schema_version,
                 OLD.workflow_compiler_version, OLD.idempotency_key, OLD.graph_snapshot,
                 OLD.input_schema, OLD.output_schema,
                 OLD.input_ciphertext, OLD.payload_key_version)
             IS DISTINCT FROM
             ROW(NEW.tenant_id, NEW.workflow_id, NEW.workflow_version,
                 NEW.workflow_checksum, NEW.workflow_schema_version,
                 NEW.workflow_compiler_version, NEW.idempotency_key, NEW.graph_snapshot,
                 NEW.input_schema, NEW.output_schema,
                 NEW.input_ciphertext, NEW.payload_key_version) THEN
            RAISE EXCEPTION 'execution run evidence is immutable';
          END IF;
          IF OLD.status IN ('succeeded','failed','cancelled','action_required') THEN
            RAISE EXCEPTION 'terminal execution runs are immutable';
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        CREATE TRIGGER execution_runs_protect_evidence
          BEFORE UPDATE ON execution_runs
          FOR EACH ROW EXECUTE FUNCTION protect_execution_run_evidence();

        CREATE FUNCTION protect_terminal_execution_step() RETURNS TRIGGER AS $$
        BEGIN
          IF TG_OP = 'DELETE' OR OLD.status IN ('succeeded','failed','skipped','dlq') THEN
            RAISE EXCEPTION 'terminal execution step evidence is immutable';
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        CREATE TRIGGER execution_steps_protect_terminal
          BEFORE UPDATE OR DELETE ON execution_steps
          FOR EACH ROW EXECUTE FUNCTION protect_terminal_execution_step();

        CREATE FUNCTION prevent_side_effect_checkpoint_mutation() RETURNS TRIGGER AS $$
        BEGIN
          RAISE EXCEPTION 'side-effect checkpoints are immutable';
        END;
        $$ LANGUAGE plpgsql;
        CREATE TRIGGER side_effect_checkpoints_immutable
          BEFORE UPDATE OR DELETE ON side_effect_checkpoints
          FOR EACH ROW EXECUTE FUNCTION prevent_side_effect_checkpoint_mutation();
        """
    )


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS prevent_side_effect_checkpoint_mutation() CASCADE")
    op.execute("DROP FUNCTION IF EXISTS protect_terminal_execution_step() CASCADE")
    op.execute("DROP FUNCTION IF EXISTS protect_execution_run_evidence() CASCADE")
    op.drop_table("execution_outbox")
    op.drop_table("side_effect_checkpoints")
    op.drop_table("execution_steps")
    op.drop_table("execution_runs")
