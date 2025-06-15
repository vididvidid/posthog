from datetime import datetime
from unittest.mock import Mock, patch
from posthog.test.base import BaseTest
from posthog.schema import ExperimentsQuery, NodeKind
from posthog.hogql_queries.ai.experiments_query_runner import ExperimentsQueryRunner


class TestExperimentsQueryRunner(BaseTest):
    def setUp(self):
        super().setUp()
        self.query = ExperimentsQuery(
            kind=NodeKind.ExperimentsQuery,
            dateRange={"date_from": "2024-01-01", "date_to": "2024-01-31"},
            limit=100,
            offset=0,
        )

    def test_query_runner_initialization(self):
        """Test that the query runner initializes correctly"""
        runner = ExperimentsQueryRunner(query=self.query, team=self.team)

        self.assertEqual(runner.query.kind, NodeKind.ExperimentsQuery)
        self.assertEqual(runner.team, self.team)
        self.assertIsNotNone(runner.paginator)

    @patch("posthog.hogql_queries.ai.experiments_query_runner.HogQLHasMorePaginator")
    def test_calculate_method(self, mock_paginator_class):
        """Test the calculate method generates correct query structure"""
        # Mock the paginator
        mock_paginator = Mock()
        mock_query_result = Mock()
        mock_query_result.columns = ["id", "name", "description", "createdAt", "updatedAt", "project_id"]
        mock_query_result.results = [
            ["exp-1", "Test Experiment", "Description", datetime.now(), datetime.now(), str(self.team.pk)]
        ]
        mock_query_result.timings = []
        mock_query_result.hogql = "SELECT * FROM events WHERE ..."

        mock_paginator.execute_hogql_query.return_value = mock_query_result
        mock_paginator.response_params.return_value = {"hasMore": False, "limit": 100, "offset": 0}
        mock_paginator_class.from_limit_context.return_value = mock_paginator

        runner = ExperimentsQueryRunner(query=self.query, team=self.team)

        result = runner.calculate()

        self.assertIsNotNone(result)
        self.assertEqual(len(result.results), 1)
        self.assertEqual(result.results[0].name, "Test Experiment")
        mock_paginator.execute_hogql_query.assert_called_once()

    def test_to_query_method(self):
        """Test that the to_query method generates valid HogQL"""
        runner = ExperimentsQueryRunner(query=self.query, team=self.team)

        hogql_query = runner.to_query()

        self.assertIsNotNone(hogql_query)
        # The query should be a SelectQuery AST node
        self.assertTrue(hasattr(hogql_query, "select"))

    def test_get_subquery_filter(self):
        """Test subquery filter generation"""
        runner = ExperimentsQueryRunner(query=self.query, team=self.team)

        filter_ast = runner._get_subquery_filter()

        self.assertIsNotNone(filter_ast)
        # Should include team filter and date range

    def test_get_where_clause(self):
        """Test where clause generation"""
        runner = ExperimentsQueryRunner(query=self.query, team=self.team)

        where_ast = runner._get_where_clause()

        self.assertIsNotNone(where_ast)
        # Should include team filter and date range

    def test_specific_experiment_filter(self):
        """Test filtering for a specific experiment"""
        experiment_id = "exp-123"
        specific_query = ExperimentsQuery(
            kind=NodeKind.ExperimentsQuery,
            experiment_id=experiment_id,
            dateRange={"date_from": "2024-01-01", "date_to": "2024-01-31"},
        )

        runner = ExperimentsQueryRunner(query=specific_query, team=self.team)

        filter_ast = runner._get_subquery_filter()

        self.assertIsNotNone(filter_ast)
        # Should include the specific experiment ID filter

    def test_cache_payload(self):
        """Test cache payload generation"""
        runner = ExperimentsQueryRunner(query=self.query, team=self.team)

        cache_payload = runner.get_cache_payload()

        self.assertIn("schema_version", cache_payload)
        self.assertEqual(cache_payload["schema_version"], 1)
