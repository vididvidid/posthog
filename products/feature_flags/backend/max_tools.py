"""
MaxTool for AI-powered feature flag creation.
"""

from typing import Any

from unittest.mock import Mock

from django.utils.text import slugify

from asgiref.sync import async_to_sync, sync_to_async
from langchain_core.prompts import ChatPromptTemplate
from nanoid import generate
from pydantic import BaseModel, Field

from posthog.schema import FeatureFlagCreationSchema

from posthog.api.feature_flag import FeatureFlagSerializer
from posthog.exceptions_capture import capture_exception
from posthog.models import FeatureFlag, Team, User

from ee.hogai.graph.taxonomy.agent import TaxonomyAgent
from ee.hogai.graph.taxonomy.nodes import TaxonomyAgentNode, TaxonomyAgentToolsNode
from ee.hogai.graph.taxonomy.toolkit import TaxonomyAgentToolkit
from ee.hogai.graph.taxonomy.tools import base_final_answer
from ee.hogai.graph.taxonomy.types import TaxonomyAgentState
from ee.hogai.tool import MaxTool

from .prompts import FEATURE_FLAG_CREATION_SYSTEM_PROMPT


class FeatureFlagCreatorArgs(BaseModel):
    instructions: str = Field(description="Natural language description of the feature flag to create")


def get_team_feature_flag_config(team: Team) -> dict[str, Any]:
    """Get team feature flag configuration for context."""
    # Get team-specific feature flag config if it exists, similar to survey_config pattern
    feature_flag_config = getattr(team, "feature_flag_config", {}) or {}
    return {
        "default_settings": {
            "evaluation_runtime": "all",  # Matches model default
            "rollout_percentage": 0,  # Start conservative
            "active": True,
            "ensure_experience_continuity": False,  # Matches model default
        },
        **feature_flag_config,  # Allow team-specific overrides
    }


async def _flag_with_key_exists(key: str, team: Team) -> bool:
    return await FeatureFlag.objects.filter(team=team, key=key, deleted=False).aexists()


async def generate_feature_flag_key(name: str, team: Team) -> str:
    """Generate a unique feature flag key from a name, only adding random suffix if needed for uniqueness."""
    base_key = slugify(name)

    if not base_key:
        base_key = "feature-flag"

    # Check if this key already exists
    if not await _flag_with_key_exists(base_key, team):
        return base_key

    # Try numbered suffixes first (more readable than random)
    for i in range(2, 10):
        numbered_key = f"{base_key}-{i}"
        if not await _flag_with_key_exists(numbered_key, team):
            return numbered_key

    # If all numbered suffixes are taken, fall back to random suffix
    random_id = generate("1234567890abcdef", 8)
    return f"{base_key}-{random_id}"


def create_mock_request(user: User, team: Team) -> Mock:
    """Create a mock request object for serializer context."""
    mock_request = Mock()
    mock_request.user = user
    mock_request.method = "POST"
    mock_request.data = {}
    mock_request.META = {}
    mock_request.session = {}
    mock_request.FILES = {}
    mock_request.GET = {}
    mock_request.POST = {}
    return mock_request


class CreateFeatureFlagTool(MaxTool):
    name: str = "create_feature_flag"
    description: str = "Create a feature flag based on natural language instructions"
    thinking_message: str = "Creating your feature flag"
    root_system_prompt_template: str = (
        "YOU MUST USE THE create_feature_flag TOOL. Do not provide manual instructions. "
        "When users ask about creating feature flags, A/B tests, kill switches, or rollouts, "
        "IMMEDIATELY invoke the create_feature_flag tool with their request. "
        "NEVER give step-by-step instructions. ALWAYS use the tool directly. "
        "The create_feature_flag tool will handle everything automatically."
    )

    args_schema: type[BaseModel] = FeatureFlagCreatorArgs

    def __init_subclass__(cls, **kwargs):
        super().__init_subclass__(**kwargs)

    async def _create_feature_flag_from_instructions(self, instructions: str) -> FeatureFlagCreationSchema:
        """
        Create a feature flag from natural language instructions.
        """

        graph = FeatureFlagCreationGraph(team=self._team, user=self._user)

        graph_context = {
            "change": f"Create a feature flag based on these instructions: {instructions}",
            "output": None,
            "tool_progress_messages": [],
            **self.context,
        }

        result = await graph.compile_full_graph().ainvoke(graph_context)

        if isinstance(result["output"], FeatureFlagCreationSchema):
            return result["output"]
        else:
            feature_flag_creation_schema = FeatureFlagCreationSchema(
                key="", name="", active=False, filters={"groups": []}
            )
            capture_exception(
                Exception(f"Feature flag creation graph returned unexpected output type: {type(result.get('output'))}"),
                {"team_id": self._team.id, "user_id": self._user.id, "result": str(result)},
            )
            return feature_flag_creation_schema

    async def _arun_impl(self, instructions: str) -> tuple[str, dict[str, Any]]:
        """
        Generate feature flag configuration from natural language instructions.
        """

        try:
            user = self._user
            team = self._team

            result = await self._create_feature_flag_from_instructions(instructions)

            try:
                # Generate key if not provided or if it's empty
                # Priority: use name/description if available, otherwise use instructions
                if not result.key:
                    key_source = result.name or instructions[:50]
                    result.key = await generate_feature_flag_key(key_source, team)

                if not result.key:
                    return "❌ Feature flag must have a key", {
                        "error": "validation_failed",
                        "error_message": "No key could be generated from the feature flag instructions.",
                    }

                flag_data = self._prepare_feature_flag_data(result, team)

                # Use the same serializer as the UI to handle deleted flags properly
                mock_request = create_mock_request(user, team)
                serializer = FeatureFlagSerializer(
                    data=flag_data,
                    context={
                        "request": mock_request,
                        "team_id": team.id,
                        "project_id": team.project_id,
                    },
                )

                # Validate and create using the serializer (handles deleted flag cleanup)
                await sync_to_async(serializer.is_valid)(raise_exception=True)
                feature_flag = await sync_to_async(serializer.save)()

                return f"✅ Feature flag '{feature_flag.name}' created successfully!", {
                    "flag_id": feature_flag.id,
                    "flag_key": feature_flag.key,
                    "flag_name": feature_flag.name,
                }

            except Exception as validation_error:
                return f"❌ Feature flag validation failed: {str(validation_error)}", {
                    "error": "validation_failed",
                    "error_message": str(validation_error),
                }

        except Exception as e:
            capture_exception(e, {"team_id": self._team.id, "user_id": self._user.id})
            return "❌ Failed to create feature flag", {"error": "creation_failed", "details": str(e)}

    def _prepare_feature_flag_data(self, flag_schema: FeatureFlagCreationSchema, team: Team) -> dict[str, Any]:
        """Prepare feature flag data with defaults applied."""
        # Convert schema to dict
        flag_data = flag_schema.model_dump(exclude_unset=True)

        # Note: schema 'name' field maps directly to model 'name' field (contains description)
        # No special handling needed since description field has been removed from schema

        # Get team configuration for defaults
        team_config = get_team_feature_flag_config(team)
        default_settings = team_config.get("default_settings", {})

        # Ensure required fields have defaults, using team config where available
        flag_data.setdefault("active", default_settings.get("active", True))
        flag_data.setdefault("name", "")  # Model field that contains description
        flag_data.setdefault("rollout_percentage", default_settings.get("rollout_percentage", None))
        flag_data.setdefault(
            "ensure_experience_continuity", default_settings.get("ensure_experience_continuity", False)
        )
        flag_data.setdefault("evaluation_runtime", default_settings.get("evaluation_runtime", "all"))

        # Ensure filters field is present (required by FeatureFlag model)
        flag_data.setdefault("filters", {"groups": []})

        # Handle variants: move from top-level to filters.multivariate.variants
        variants = flag_data.pop("variants", None)
        if variants:
            # Ensure filters.multivariate exists
            if "multivariate" not in flag_data["filters"]:
                flag_data["filters"]["multivariate"] = {}

            # Convert variants to the expected format and add to filters.multivariate
            flag_data["filters"]["multivariate"]["variants"] = [
                {
                    "key": variant.get("key", ""),
                    "name": variant.get("name", ""),
                    "rollout_percentage": variant.get("rollout_percentage", 0),
                }
                for variant in variants
            ]

        # Validate rollout percentage is within bounds (0-100)
        if flag_data.get("rollout_percentage") is not None:
            rollout = flag_data["rollout_percentage"]
            if not isinstance(rollout, int | float) or rollout < 0 or rollout > 100:
                flag_data["rollout_percentage"] = 0  # Default to safe value

        return flag_data


class FeatureFlagToolkit(TaxonomyAgentToolkit):
    """Toolkit for feature flag creation operations."""

    def __init__(self, team: Team):
        super().__init__(team)

    def get_tools(self) -> list:
        """Get all tools (default + custom). Override in subclasses to add custom tools."""
        return self._get_custom_tools()

    def _get_custom_tools(self) -> list:
        """Get custom tools for feature flag creation."""

        class final_answer(base_final_answer[FeatureFlagCreationSchema]):
            __doc__ = base_final_answer.__doc__

        return [final_answer]

    def handle_tools(self, tool_name: str, tool_input) -> tuple[str, str]:
        """Handle custom tool execution."""
        return super().handle_tools(tool_name, tool_input)


class FeatureFlagLoopNode(TaxonomyAgentNode[TaxonomyAgentState, TaxonomyAgentState[FeatureFlagCreationSchema]]):
    """Node for feature flag creation operations."""

    def __init__(self, team: Team, user: User, toolkit_class: type[FeatureFlagToolkit]):
        super().__init__(team, user, toolkit_class=toolkit_class)

    async def _get_existing_feature_flags_summary(self) -> str:
        """Get summary of existing feature flags for context."""
        try:
            flags = [
                flag
                async for flag in FeatureFlag.objects.filter(team_id=self._team.id, deleted=False).order_by(
                    "-created_at"
                )[:5]
            ]

            if not flags:
                return "No existing feature flags"

            summaries = []
            for flag in flags:
                status = "active" if flag.active else "inactive"
                rollout = f"{flag.rollout_percentage}%" if flag.rollout_percentage else "0%"
                summaries.append(f"- '{flag.name}' (key: {flag.key}, {status}, {rollout} rollout)")

            return "\n".join(summaries)
        except Exception as e:
            capture_exception(e, {"team_id": self._team.id, "user_id": self._user.id})
            return "Unable to load existing feature flags"

    def _get_system_prompt(self) -> ChatPromptTemplate:
        """Get system prompts for feature flag creation."""
        existing_flags = async_to_sync(self._get_existing_feature_flags_summary)()

        prompt = ChatPromptTemplate(
            [("system", FEATURE_FLAG_CREATION_SYSTEM_PROMPT)], template_format="mustache"
        ).format(
            existing_feature_flags=existing_flags,
            team_feature_flag_config=get_team_feature_flag_config(self._team),
        )

        return ChatPromptTemplate([("system", prompt)], template_format="mustache")

    def _construct_messages(self, state: TaxonomyAgentState) -> ChatPromptTemplate:
        """
        Construct the conversation thread for the agent. Handles both initial conversation setup
        and continuation with intermediate steps.
        """
        system_prompt = self._get_system_prompt()
        conversation = list(system_prompt.messages)
        human_content = state.change or ""
        all_messages = [*conversation, ("human", human_content)]

        progress_messages = state.tool_progress_messages or []
        all_messages.extend(progress_messages)

        return ChatPromptTemplate(all_messages, template_format="mustache")


class FeatureFlagToolsNode(TaxonomyAgentToolsNode[TaxonomyAgentState, TaxonomyAgentState[FeatureFlagCreationSchema]]):
    """Tools node for feature flag creation operations."""

    def __init__(self, team: Team, user: User, toolkit_class: type[FeatureFlagToolkit]):
        super().__init__(team, user, toolkit_class=toolkit_class)


class FeatureFlagCreationGraph(TaxonomyAgent[TaxonomyAgentState, TaxonomyAgentState[FeatureFlagCreationSchema]]):
    """Graph for feature flag creation operations."""

    def __init__(self, team: Team, user: User):
        super().__init__(
            team,
            user,
            loop_node_class=FeatureFlagLoopNode,
            tools_node_class=FeatureFlagToolsNode,
            toolkit_class=FeatureFlagToolkit,
        )
