"""Unit evidence for execution observability security and failure semantics."""

import os
import unittest
from unittest.mock import AsyncMock, patch

os.environ.setdefault(
    "OBSERVABILITY_METRICS_TOKEN",
    "isolated-test-metrics-token-at-least-32-characters",
)

from config import settings
from middleware.session import resolve_correlation_id
from services.metrics import (
    Gauge,
    escape_label,
    metrics_token_is_valid,
    render_execution_metrics,
    render_gauges,
)


class MetricsAuthenticationTests(unittest.TestCase):
    def test_accepts_only_the_configured_bearer_secret(self):
        configured = settings.OBSERVABILITY_METRICS_TOKEN.get_secret_value()
        replacement = "x" if configured[0] != "x" else "y"
        invalid = replacement + configured[1:]

        self.assertTrue(metrics_token_is_valid(f"Bearer {configured}"))
        self.assertFalse(metrics_token_is_valid(None))
        self.assertFalse(metrics_token_is_valid(configured))
        self.assertFalse(metrics_token_is_valid(f"Bearer {invalid}"))
        self.assertFalse(metrics_token_is_valid(f"Bearer {configured} "))


class CorrelationBoundaryTests(unittest.TestCase):
    def test_preserves_bounded_ids_and_replaces_unsafe_values(self):
        expected = "01J8VXW6F1J2G3H4K5M6N7P8Q9"
        self.assertEqual(resolve_correlation_id(expected), expected)

        for unsafe in ("short", "contains whitespace", "line\nbreak", "x" * 129):
            resolved = resolve_correlation_id(unsafe)
            self.assertNotEqual(resolved, unsafe)
            self.assertEqual(len(resolved), 36)


class MetricsRenderingTests(unittest.IsolatedAsyncioTestCase):
    def test_escapes_prometheus_label_values(self):
        self.assertEqual(escape_label('a"b\\c\nd'), 'a\\"b\\\\c\\nd')
        self.assertEqual(
            render_gauges([Gauge("metric_name", {"status": 'a"b'}, 2)]),
            ['metric_name{status="a\\"b"} 2'],
        )

    async def test_database_failure_is_explicit_and_emits_no_stale_gauges(self):
        with patch(
            "services.metrics.collect_execution_gauges",
            new=AsyncMock(side_effect=RuntimeError("database unavailable")),
        ):
            output = await render_execution_metrics()

        self.assertIn(
            'gigalibs_execution_metrics_collection_success{collector="database"} 0',
            output,
        )
        self.assertNotIn("gigalibs_execution_runs{", output)


if __name__ == "__main__":
    unittest.main()
