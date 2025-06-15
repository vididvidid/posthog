"""
ViewSet for LLM Observability Experiments

Endpoints:
- POST /api/llm_experiments/{experiment_id}/insert
- POST /api/llm_experiments
- GET /api/llm_experiments
- GET /api/llm_experiments/{experiment_id}
"""

import uuid
from datetime import datetime
from rest_framework import viewsets, serializers, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from posthog.auth import SessionAuthentication
from posthog.api.utils import action_is_authenticated
from posthog.models import Team
from posthog.client import sync_execute
from posthog.clickhouse.client.connection import Workload
from typing import Any


class LLMExperimentSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255)
    description = serializers.CharField(required=False, allow_blank=True)
    dataset_id = serializers.CharField(required=False, allow_blank=True)
    base_exp_id = serializers.CharField(required=False, allow_blank=True)
    public = serializers.BooleanField(default=False, required=False)
    repo_info = serializers.DictField(required=False)
    metadata = serializers.DictField(required=False)


class LLMExperimentEventSerializer(serializers.Serializer):
    input = serializers.JSONField(required=False)
    output = serializers.JSONField(required=False)
    expected = serializers.JSONField(required=False)
    scores = serializers.DictField(required=False)
    metadata = serializers.DictField(required=False)
    tags = serializers.ListField(child=serializers.CharField(), required=False)
    metrics = serializers.DictField(required=False)


class LLMExperimentInsertSerializer(serializers.Serializer):
    events = serializers.ListField(child=LLMExperimentEventSerializer())


class LLMExperimentViewSet(viewsets.ViewSet):
    authentication_classes = [SessionAuthentication]
    permission_classes = [IsAuthenticated]

    def _get_team(self, request: Request) -> Team:
        return request.user.current_team

    def _create_experiment_event(self, team: Team, experiment_id: str, event_data: dict[str, Any]) -> str:
        """Create an experiment event using PostHog's event infrastructure"""
        event_id = str(uuid.uuid4())
        now = datetime.utcnow().isoformat()

        # Create the experiment event using PostHog's event system
        properties = {
            "$ai_experiment_id": experiment_id,
            "$ai_experiment_event_id": event_id,
            "$ai_input": event_data.get("input"),
            "$ai_output": event_data.get("output"),
            "$ai_expected": event_data.get("expected"),
            "$ai_scores": event_data.get("scores", {}),
            "$ai_metrics": event_data.get("metrics", {}),
            "$ai_tags": event_data.get("tags", []),
            "$ai_metadata": event_data.get("metadata", {}),
            "$timestamp": now,
        }

        # Insert the event into ClickHouse
        sync_execute(
            """
            INSERT INTO events (
                uuid, event, properties, team_id, distinct_id, timestamp, created_at
            ) VALUES (
                %(uuid)s, %(event)s, %(properties)s, %(team_id)s, %(distinct_id)s, %(timestamp)s, %(created_at)s
            )
            """,
            {
                "uuid": event_id,
                "event": "$ai_experiment_event",
                "properties": properties,
                "team_id": team.id,
                "distinct_id": f"experiment-{experiment_id}",
                "timestamp": now,
                "created_at": now,
            },
            workload=Workload.ONLINE,
        )

        return event_id

    def _create_experiment(self, team: Team, experiment_data: dict[str, Any]) -> str:
        """Create an experiment using PostHog's event infrastructure"""
        experiment_id = str(uuid.uuid4())
        now = datetime.utcnow().isoformat()

        # Create the experiment metadata event
        properties = {
            "$ai_experiment_id": experiment_id,
            "$ai_experiment_name": experiment_data["name"],
            "$ai_experiment_description": experiment_data.get("description"),
            "$ai_dataset_id": experiment_data.get("dataset_id"),
            "$ai_base_exp_id": experiment_data.get("base_exp_id"),
            "$ai_public": experiment_data.get("public", False),
            "$ai_repo_info": experiment_data.get("repo_info", {}),
            "$ai_metadata": experiment_data.get("metadata", {}),
            "$timestamp": now,
        }

        # Insert the experiment metadata event into ClickHouse
        sync_execute(
            """
            INSERT INTO events (
                uuid, event, properties, team_id, distinct_id, timestamp, created_at
            ) VALUES (
                %(uuid)s, %(event)s, %(properties)s, %(team_id)s, %(distinct_id)s, %(timestamp)s, %(created_at)s
            )
            """,
            {
                "uuid": str(uuid.uuid4()),
                "event": "$ai_experiment",
                "properties": properties,
                "team_id": team.id,
                "distinct_id": f"experiment-{experiment_id}",
                "timestamp": now,
                "created_at": now,
            },
            workload=Workload.ONLINE,
        )

        return experiment_id

    def create(self, request: Request) -> Response:
        """Create a new experiment"""
        serializer = LLMExperimentSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        team = self._get_team(request)
        experiment_id = self._create_experiment(team, serializer.validated_data)

        return Response(
            {
                "id": experiment_id,
                "name": serializer.validated_data["name"],
                "description": serializer.validated_data.get("description"),
                "created_at": datetime.utcnow().isoformat(),
                "project_id": str(team.id),
            },
            status=status.HTTP_201_CREATED,
        )

    @action_is_authenticated(methods=["POST"])
    def insert(self, request: Request, pk: str) -> Response:
        """Insert events into an experiment"""
        serializer = LLMExperimentInsertSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        team = self._get_team(request)
        experiment_id = pk

        # Insert each event
        event_ids = []
        for event_data in serializer.validated_data["events"]:
            event_id = self._create_experiment_event(team, experiment_id, event_data)
            event_ids.append(event_id)

        return Response(
            {
                "inserted_events": len(event_ids),
                "event_ids": event_ids,
            },
            status=status.HTTP_201_CREATED,
        )

    def list(self, request: Request) -> Response:
        """List experiments for the team"""
        team = self._get_team(request)

        # Query experiments from ClickHouse
        experiments = sync_execute(
            """
            SELECT
                properties['$ai_experiment_id'] as id,
                properties['$ai_experiment_name'] as name,
                properties['$ai_experiment_description'] as description,
                properties['$timestamp'] as created_at,
                properties['$ai_public'] as public,
                properties['$ai_dataset_id'] as dataset_id,
                properties['$ai_base_exp_id'] as base_exp_id
            FROM events
            WHERE team_id = %(team_id)s
                AND event = '$ai_experiment'
            ORDER BY timestamp DESC
            LIMIT 100
            """,
            {"team_id": team.id},
            workload=Workload.ONLINE,
        )

        results = []
        for row in experiments:
            results.append(
                {
                    "id": row[0],
                    "name": row[1],
                    "description": row[2],
                    "created_at": row[3],
                    "public": row[4],
                    "dataset_id": row[5],
                    "base_exp_id": row[6],
                    "project_id": str(team.id),
                }
            )

        return Response({"results": results})

    def retrieve(self, request: Request, pk: str) -> Response:
        """Get a specific experiment with its events"""
        team = self._get_team(request)
        experiment_id = pk

        # Get experiment metadata
        experiment_data = sync_execute(
            """
            SELECT
                properties['$ai_experiment_id'] as id,
                properties['$ai_experiment_name'] as name,
                properties['$ai_experiment_description'] as description,
                properties['$timestamp'] as created_at,
                properties['$ai_public'] as public,
                properties['$ai_dataset_id'] as dataset_id,
                properties['$ai_base_exp_id'] as base_exp_id,
                properties['$ai_metadata'] as metadata
            FROM events
            WHERE team_id = %(team_id)s
                AND event = '$ai_experiment'
                AND properties['$ai_experiment_id'] = %(experiment_id)s
            LIMIT 1
            """,
            {"team_id": team.id, "experiment_id": experiment_id},
            workload=Workload.ONLINE,
        )

        if not experiment_data:
            return Response({"error": "Experiment not found"}, status=status.HTTP_404_NOT_FOUND)

        # Get experiment events
        events_data = sync_execute(
            """
            SELECT
                properties['$ai_experiment_event_id'] as id,
                properties['$ai_input'] as input,
                properties['$ai_output'] as output,
                properties['$ai_expected'] as expected,
                properties['$ai_scores'] as scores,
                properties['$ai_metrics'] as metrics,
                properties['$ai_tags'] as tags,
                properties['$ai_metadata'] as metadata,
                properties['$timestamp'] as created_at
            FROM events
            WHERE team_id = %(team_id)s
                AND event = '$ai_experiment_event'
                AND properties['$ai_experiment_id'] = %(experiment_id)s
            ORDER BY timestamp DESC
            """,
            {"team_id": team.id, "experiment_id": experiment_id},
            workload=Workload.ONLINE,
        )

        experiment_row = experiment_data[0]
        experiment = {
            "id": experiment_row[0],
            "name": experiment_row[1],
            "description": experiment_row[2],
            "created_at": experiment_row[3],
            "public": experiment_row[4],
            "dataset_id": experiment_row[5],
            "base_exp_id": experiment_row[6],
            "metadata": experiment_row[7],
            "project_id": str(team.id),
            "events": [],
        }

        for event_row in events_data:
            experiment["events"].append(
                {
                    "id": event_row[0],
                    "input": event_row[1],
                    "output": event_row[2],
                    "expected": event_row[3],
                    "scores": event_row[4],
                    "metrics": event_row[5],
                    "tags": event_row[6],
                    "metadata": event_row[7],
                    "created_at": event_row[8],
                }
            )

        return Response(experiment)
