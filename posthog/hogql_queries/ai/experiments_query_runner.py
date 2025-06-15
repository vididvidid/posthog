from datetime import datetime
from functools import cached_property
from typing import Any, cast

import structlog

from posthog.hogql import ast
from posthog.hogql.constants import LimitContext
from posthog.hogql.parser import parse_select
from posthog.hogql.property import property_to_expr
from posthog.hogql_queries.insights.paginators import HogQLHasMorePaginator
from posthog.hogql_queries.query_runner import QueryRunner
from posthog.hogql_queries.utils.query_date_range import QueryDateRange
from posthog.schema import (
    CachedExperimentsQueryResponse,
    IntervalType,
    LLMExperiment,
    LLMExperimentEvent,
    NodeKind,
    ExperimentsQuery,
    ExperimentsQueryResponse,
)

logger = structlog.get_logger(__name__)


class ExperimentsQueryRunner(QueryRunner):
    query: ExperimentsQuery
    response: ExperimentsQueryResponse
    cached_response: CachedExperimentsQueryResponse
    paginator: HogQLHasMorePaginator

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.paginator = HogQLHasMorePaginator.from_limit_context(
            limit_context=LimitContext.QUERY,
            limit=self.query.limit if self.query.limit else None,
            offset=self.query.offset,
        )

    def calculate(self):
        with self.timings.measure("experiments_query_hogql_execute"):
            # Calculate max number of experiments needed with current offset and limit
            limit_value = self.query.limit if self.query.limit else 100
            offset_value = self.query.offset if self.query.offset else 0
            pagination_limit = limit_value + offset_value + 1

            query_result = self.paginator.execute_hogql_query(
                query=self.to_query(),
                placeholders={
                    "subquery_conditions": self._get_subquery_filter(),
                    "filter_conditions": self._get_where_clause(),
                    "return_full_experiment": ast.Constant(value=1 if self.query.experiment_id is not None else 0),
                    "pagination_limit": ast.Constant(value=pagination_limit),
                },
                team=self.team,
                query_type=NodeKind.EXPERIMENTS_QUERY,
                timings=self.timings,
                modifiers=self.modifiers,
                limit_context=self.limit_context,
            )

        columns: list[str] = query_result.columns or []
        results = self._map_results(columns, query_result.results)

        return ExperimentsQueryResponse(
            columns=columns,
            results=results,
            timings=query_result.timings,
            hogql=query_result.hogql,
            modifiers=self.modifiers,
            **self.paginator.response_params(),
        )

    def to_query(self):
        query = parse_select(
            """
            WITH relevant_experiment_ids AS (
                SELECT properties.$ai_experiment_id as experiment_id
                FROM events
                WHERE event IN ('$ai_experiment', '$ai_experiment_event')
                  AND properties.$ai_experiment_id IS NOT NULL
                  AND {subquery_conditions}
                ORDER BY timestamp DESC
                LIMIT 1 BY properties.$ai_experiment_id
                LIMIT {pagination_limit}
            )
            SELECT
                properties.$ai_experiment_id AS id,
                argMaxIf(properties.$ai_experiment_name, timestamp, event = '$ai_experiment') AS name,
                argMaxIf(properties.$ai_experiment_description, timestamp, event = '$ai_experiment') AS description,
                min(timestamp) AS createdAt,
                max(timestamp) AS updatedAt,
                '{team_id}' AS project_id,
                argMaxIf(properties.$ai_dataset_id, timestamp, event = '$ai_experiment') AS dataset_id,
                argMaxIf(properties.$ai_base_exp_id, timestamp, event = '$ai_experiment') AS base_exp_id,
                argMaxIf(properties.$ai_public, timestamp, event = '$ai_experiment') AS public,
                argMaxIf(properties.$ai_repo_info, timestamp, event = '$ai_experiment') AS repo_info,
                argMaxIf(properties.$ai_metadata, timestamp, event = '$ai_experiment') AS metadata,
                IF({return_full_experiment},
                    arraySort(
                        x -> x.9,
                        groupArrayIf(
                            tuple(
                                properties.$ai_experiment_event_id, -- event_id
                                properties.$ai_input, -- input
                                properties.$ai_output, -- output
                                properties.$ai_expected, -- expected
                                properties.$ai_scores, -- scores
                                properties.$ai_metrics, -- metrics
                                properties.$ai_tags, -- tags
                                properties.$ai_metadata, -- metadata
                                timestamp  -- timestamp
                            ),
                            event = '$ai_experiment_event'
                        )
                    ),
                    []
                ) AS events
            FROM events
            WHERE event IN ('$ai_experiment', '$ai_experiment_event')
              AND properties.$ai_experiment_id IN (SELECT experiment_id FROM relevant_experiment_ids)
              AND {filter_conditions}
            GROUP BY properties.$ai_experiment_id
            ORDER BY min(timestamp) DESC
            """,
        )
        return cast(ast.SelectQuery, query)

    def get_cache_payload(self):
        return {
            **super().get_cache_payload(),
            # When the response schema changes, increment this version to invalidate the cache.
            "schema_version": 1,
        }

    @cached_property
    def _date_range(self):
        return QueryDateRange(
            date_range=self.query.dateRange,
            team=self.team,
            interval=IntervalType.DAY,
            now=datetime.now(),
        )

    def _get_subquery_filter(self):
        conditions = []

        # Team filter
        conditions.append(
            ast.CompareOperation(
                op=ast.CompareOperationOp.Eq,
                left=ast.Field(chain=["team_id"]),
                right=ast.Constant(value=self.team.pk),
            )
        )

        # Date range filter
        conditions.append(
            ast.CompareOperation(
                op=ast.CompareOperationOp.GtEq,
                left=ast.Field(chain=["timestamp"]),
                right=ast.Constant(value=self._date_range.date_from()),
            )
        )
        conditions.append(
            ast.CompareOperation(
                op=ast.CompareOperationOp.LtEq,
                left=ast.Field(chain=["timestamp"]),
                right=ast.Constant(value=self._date_range.date_to()),
            )
        )

        # Property filters
        if self.query.properties:
            for prop in self.query.properties:
                prop_expr = property_to_expr(prop, self.team)
                if prop_expr is not None:
                    conditions.append(prop_expr)

        # Specific experiment filter
        if self.query.experiment_id:
            conditions.append(
                ast.CompareOperation(
                    op=ast.CompareOperationOp.Eq,
                    left=ast.Field(chain=["properties", "$ai_experiment_id"]),
                    right=ast.Constant(value=self.query.experiment_id),
                )
            )

        return ast.And(exprs=conditions) if conditions else ast.Constant(value=True)

    def _get_where_clause(self):
        conditions = []

        # Team filter
        conditions.append(
            ast.CompareOperation(
                op=ast.CompareOperationOp.Eq,
                left=ast.Field(chain=["team_id"]),
                right=ast.Constant(value=self.team.pk),
            )
        )

        # Date range filter
        conditions.append(
            ast.CompareOperation(
                op=ast.CompareOperationOp.GtEq,
                left=ast.Field(chain=["timestamp"]),
                right=ast.Constant(value=self._date_range.date_from()),
            )
        )
        conditions.append(
            ast.CompareOperation(
                op=ast.CompareOperationOp.LtEq,
                left=ast.Field(chain=["timestamp"]),
                right=ast.Constant(value=self._date_range.date_to()),
            )
        )

        return ast.And(exprs=conditions) if conditions else ast.Constant(value=True)

    def _map_results(self, columns: list[str], results: list[list[Any]]) -> list[LLMExperiment]:
        """
        Map query results to LLMExperiment objects
        """
        mapped_results = []

        for row in results:
            row_dict = dict(zip(columns, row))

            # Parse events if present
            events = []
            if row_dict.get("events"):
                for event_tuple in row_dict["events"]:
                    if len(event_tuple) >= 9:
                        events.append(
                            LLMExperimentEvent(
                                id=event_tuple[0] or "",
                                experiment_id=row_dict["id"],
                                input=event_tuple[1],
                                output=event_tuple[2],
                                expected=event_tuple[3],
                                scores=event_tuple[4] or {},
                                metadata=event_tuple[7] or {},
                                tags=event_tuple[6] or [],
                                metrics=event_tuple[5] or {},
                                createdAt=event_tuple[8].isoformat() if event_tuple[8] else "",
                            )
                        )

            experiment = LLMExperiment(
                id=row_dict["id"],
                name=row_dict["name"] or "",
                description=row_dict["description"] or "",
                createdAt=row_dict["createdAt"].isoformat() if row_dict["createdAt"] else "",
                updatedAt=row_dict["updatedAt"].isoformat() if row_dict["updatedAt"] else "",
                project_id=str(self.team.pk),
                dataset_id=row_dict.get("dataset_id"),
                base_exp_id=row_dict.get("base_exp_id"),
                public=bool(row_dict.get("public", False)),
                repo_info=row_dict.get("repo_info") or {},
                metadata=row_dict.get("metadata") or {},
            )

            mapped_results.append(experiment)

        return mapped_results
