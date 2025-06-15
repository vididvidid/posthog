import uuid
from unittest.mock import patch
from rest_framework import status
from rest_framework.test import APITestCase
from posthog.test.base import BaseTest


class TestLLMExperimentAPI(BaseTest, APITestCase):
    def setUp(self):
        super().setUp()
        self.experiment_data = {
            "name": "Test Experiment",
            "description": "A test experiment for evaluation",
            "public": False,
            "metadata": {"test": "data"},
        }

    @patch("products.llm_observability.api.experiments.sync_execute")
    def test_create_experiment(self, mock_sync_execute):
        """Test creating a new experiment"""
        response = self.client.post("/api/llm_experiments/", data=self.experiment_data, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("id", response.data)
        self.assertEqual(response.data["name"], "Test Experiment")
        self.assertEqual(response.data["project_id"], str(self.team.id))

        # Verify sync_execute was called to insert the experiment
        mock_sync_execute.assert_called_once()

    @patch("products.llm_observability.api.experiments.sync_execute")
    def test_insert_experiment_events(self, mock_sync_execute):
        """Test inserting events into an experiment"""
        experiment_id = str(uuid.uuid4())

        event_data = {
            "events": [
                {
                    "input": {"prompt": "Hello"},
                    "output": {"response": "Hi there!"},
                    "expected": {"response": "Hello!"},
                    "scores": {"accuracy": 0.8},
                    "metadata": {"model": "gpt-4"},
                }
            ]
        }

        response = self.client.post(f"/api/llm_experiments/{experiment_id}/insert/", data=event_data, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["inserted_events"], 1)
        self.assertIn("event_ids", response.data)

        # Verify sync_execute was called to insert the event
        mock_sync_execute.assert_called_once()

    def test_create_experiment_invalid_data(self):
        """Test creating experiment with invalid data"""
        invalid_data = {"description": "Missing name field"}

        response = self.client.post("/api/llm_experiments/", data=invalid_data, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("name", response.data)

    def test_insert_events_invalid_data(self):
        """Test inserting events with invalid data"""
        experiment_id = str(uuid.uuid4())

        invalid_data = {"invalid": "structure"}

        response = self.client.post(f"/api/llm_experiments/{experiment_id}/insert/", data=invalid_data, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @patch("products.llm_observability.api.experiments.sync_execute")
    def test_list_experiments(self, mock_sync_execute):
        """Test listing experiments"""
        mock_sync_execute.return_value = [
            ["exp-1", "Experiment 1", "Description 1", "2024-01-01T00:00:00Z", False, None, None],
            ["exp-2", "Experiment 2", "Description 2", "2024-01-01T01:00:00Z", True, "dataset-1", None],
        ]

        response = self.client.get("/api/llm_experiments/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("results", response.data)
        self.assertEqual(len(response.data["results"]), 2)
        self.assertEqual(response.data["results"][0]["name"], "Experiment 1")
        self.assertEqual(response.data["results"][1]["public"], True)

    @patch("products.llm_observability.api.experiments.sync_execute")
    def test_retrieve_experiment(self, mock_sync_execute):
        """Test retrieving a specific experiment"""
        experiment_id = str(uuid.uuid4())

        # Mock experiment metadata and events
        mock_sync_execute.side_effect = [
            # Experiment metadata
            [["exp-1", "Test Experiment", "Description", "2024-01-01T00:00:00Z", False, None, None, {"test": "data"}]],
            # Experiment events
            [
                [
                    "event-1",
                    {"prompt": "Hello"},
                    {"response": "Hi!"},
                    {"response": "Hello!"},
                    {"accuracy": 0.8},
                    {},
                    [],
                    {"model": "gpt-4"},
                    "2024-01-01T00:01:00Z",
                ]
            ],
        ]

        response = self.client.get(f"/api/llm_experiments/{experiment_id}/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["name"], "Test Experiment")
        self.assertEqual(len(response.data["events"]), 1)
        self.assertEqual(response.data["events"][0]["input"], {"prompt": "Hello"})

    @patch("products.llm_observability.api.experiments.sync_execute")
    def test_retrieve_experiment_not_found(self, mock_sync_execute):
        """Test retrieving a non-existent experiment"""
        experiment_id = str(uuid.uuid4())
        mock_sync_execute.return_value = []  # No experiment found

        response = self.client.get(f"/api/llm_experiments/{experiment_id}/")

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertIn("error", response.data)
