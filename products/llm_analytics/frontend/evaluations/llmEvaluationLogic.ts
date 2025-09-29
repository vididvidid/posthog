import { actions, afterMount, kea, key, listeners, path, props, reducers, selectors } from 'kea'

import type { llmEvaluationLogicType } from './llmEvaluationLogicType'
import { EvaluationConditionSet, EvaluationConfig, EvaluationRun } from './types'

export interface LLMEvaluationLogicProps {
    evaluationId: string
}

// Mock runs data
const MOCK_RUNS: Record<string, EvaluationRun[]> = {
    'eval-1': [
        {
            id: 'run-1',
            evaluation_id: 'eval-1',
            generation_id: 'gen-abc123',
            timestamp: '2024-01-15T10:30:00Z',
            input_preview: 'How do I reset my password?',
            output_preview: 'To reset your password, go to the login page and click "Forgot Password"...',
            result: true,
            status: 'completed',
        },
        {
            id: 'run-2',
            evaluation_id: 'eval-1',
            generation_id: 'gen-def456',
            timestamp: '2024-01-15T10:25:00Z',
            input_preview: 'What is the meaning of life?',
            output_preview: 'The meaning of life is subjective and varies for each person...',
            result: false,
            status: 'completed',
        },
        {
            id: 'run-3',
            evaluation_id: 'eval-1',
            generation_id: 'gen-ghi789',
            timestamp: '2024-01-15T10:20:00Z',
            input_preview: 'How to troubleshoot network issues?',
            output_preview: 'Here are some steps to troubleshoot common network problems...',
            result: true,
            status: 'completed',
        },
    ],
    'eval-2': [
        {
            id: 'run-4',
            evaluation_id: 'eval-2',
            generation_id: 'gen-jkl012',
            timestamp: '2024-01-12T15:20:00Z',
            input_preview: 'Tell me about diabetes treatment',
            output_preview: 'I can provide general information, but please consult a healthcare professional...',
            result: true,
            status: 'completed',
        },
    ],
}

export const llmEvaluationLogic = kea<llmEvaluationLogicType>([
    path(['products', 'llm_analytics', 'evaluations', 'llmEvaluationLogic']),
    props({} as LLMEvaluationLogicProps),
    key((props) => props.evaluationId || 'new'),

    actions({
        // Evaluation configuration actions
        setEvaluationName: (name: string) => ({ name }),
        setEvaluationDescription: (description: string) => ({ description }),
        setEvaluationPrompt: (prompt: string) => ({ prompt }),
        setEvaluationEnabled: (enabled: boolean) => ({ enabled }),
        setTriggerConditions: (conditions: EvaluationConditionSet[]) => ({ conditions }),

        // Evaluation management actions
        saveEvaluation: true,
        saveEvaluationSuccess: (evaluation: EvaluationConfig) => ({ evaluation }),
        loadEvaluation: true,
        loadEvaluationSuccess: (evaluation: EvaluationConfig | null) => ({ evaluation }),
        resetEvaluation: true,

        // Evaluation runs actions
        loadEvaluationRuns: true,
        loadEvaluationRunsSuccess: (runs: EvaluationRun[]) => ({ runs }),
        refreshEvaluationRuns: true,
    }),

    reducers({
        evaluation: [
            null as EvaluationConfig | null,
            {
                setEvaluationName: (state, { name }) => (state ? { ...state, name } : null),
                setEvaluationDescription: (state, { description }) => (state ? { ...state, description } : null),
                setEvaluationPrompt: (state, { prompt }) => (state ? { ...state, prompt } : null),
                setEvaluationEnabled: (state, { enabled }) => (state ? { ...state, enabled } : null),
                setTriggerConditions: (state, { conditions }) => (state ? { ...state, conditions } : null),
                loadEvaluationSuccess: (_, { evaluation }) => evaluation,
                saveEvaluationSuccess: (_, { evaluation }) => evaluation,
                resetEvaluation: () => null,
            },
        ],
        evaluationRuns: [
            [] as EvaluationRun[],
            {
                loadEvaluationRunsSuccess: (_, { runs }) => runs,
            },
        ],
        evaluationLoading: [
            false,
            {
                loadEvaluation: () => true,
                loadEvaluationSuccess: () => false,
            },
        ],
        evaluationFormSubmitting: [
            false,
            {
                saveEvaluation: () => true,
                saveEvaluationSuccess: () => false,
            },
        ],
        runsLoading: [
            false,
            {
                loadEvaluationRuns: () => true,
                loadEvaluationRunsSuccess: () => false,
                refreshEvaluationRuns: () => true,
            },
        ],
        hasUnsavedChanges: [
            false,
            {
                setEvaluationName: () => true,
                setEvaluationDescription: () => true,
                setEvaluationPrompt: () => true,
                setEvaluationEnabled: () => true,
                setTriggerConditions: () => true,
                saveEvaluationSuccess: () => false,
                loadEvaluationSuccess: () => false,
                resetEvaluation: () => false,
            },
        ],
    }),

    listeners(({ actions, values, props }) => ({
        loadEvaluation: async () => {
            if (props.evaluationId && props.evaluationId !== 'new') {
                // Find in shared mock data store
                const evaluation = window.mockEvaluations?.find((e) => e.id === props.evaluationId) || null

                // TODO: Replace with actual backend API call
                // const evaluation = await api.evaluations.get(props.evaluationId)
                actions.loadEvaluationSuccess(evaluation)
            } else if (props.evaluationId === 'new') {
                // Initialize new evaluation
                const newEvaluation: Partial<EvaluationConfig> = {
                    name: '',
                    description: '',
                    enabled: true,
                    prompt: '',
                    conditions: [
                        {
                            id: `cond-${Date.now()}`,
                            rollout_percentage: 10,
                            properties: [],
                        },
                    ],
                }
                actions.loadEvaluationSuccess(newEvaluation as EvaluationConfig)
            }
        },

        loadEvaluationRuns: async () => {
            if (props.evaluationId && props.evaluationId !== 'new') {
                // Get mock runs for this evaluation
                const runs = MOCK_RUNS[props.evaluationId] || []
                actions.loadEvaluationRunsSuccess(runs)

                // TODO: Replace with actual backend API call
                // const runs = await api.evaluations.getRuns(props.evaluationId)
                // actions.loadEvaluationRunsSuccess(runs)
            }
        },

        refreshEvaluationRuns: async () => {
            // Reload runs data
            actions.loadEvaluationRuns()
        },

        saveEvaluation: async () => {
            // Simulate save delay
            await new Promise((resolve) => setTimeout(resolve, 300))

            if (props.evaluationId === 'new') {
                // Create new evaluation
                const newEvaluation: EvaluationConfig = {
                    ...values.evaluation!,
                    id: `eval-${Date.now()}`,
                    total_runs: 0,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                } as EvaluationConfig

                // Update shared mock store
                if (window.mockEvaluations) {
                    window.mockEvaluations.push(newEvaluation)
                }

                // TODO: Replace with actual backend API call
                // const response = await api.evaluations.create(newEvaluation)
                actions.saveEvaluationSuccess(newEvaluation)
            } else {
                // Update existing evaluation
                if (window.mockEvaluations) {
                    const index = window.mockEvaluations.findIndex((e) => e.id === props.evaluationId)
                    if (index >= 0) {
                        window.mockEvaluations[index] = {
                            ...window.mockEvaluations[index],
                            ...values.evaluation!,
                            updated_at: new Date().toISOString(),
                        }
                    }
                }

                // TODO: Replace with actual backend API call
                // const response = await api.evaluations.update(props.evaluationId, values.evaluation!)
                actions.saveEvaluationSuccess(values.evaluation!)
            }
        },
    })),

    selectors({
        isNewEvaluation: [() => [(props) => props.evaluationId], (evaluationId: string) => evaluationId === 'new'],

        formValid: [
            (s) => [s.evaluation],
            (evaluation) => {
                if (!evaluation) {
                    return false
                }
                return (
                    evaluation.name.length >= 3 &&
                    evaluation.prompt.length >= 10 &&
                    evaluation.conditions.length > 0 &&
                    evaluation.conditions.every((c) => c.rollout_percentage > 0 && c.rollout_percentage <= 100)
                )
            },
        ],

        runsSummary: [
            (s) => [s.evaluationRuns],
            (runs) => {
                if (runs.length === 0) {
                    return null
                }

                const successfulRuns = runs.filter((r) => r.result === true).length
                const failedRuns = runs.filter((r) => r.result === false).length
                const errorRuns = runs.filter((r) => r.status === 'failed').length

                return {
                    total: runs.length,
                    successful: successfulRuns,
                    failed: failedRuns,
                    errors: errorRuns,
                    successRate: runs.length > 0 ? Math.round((successfulRuns / runs.length) * 100) : 0,
                }
            },
        ],
    }),

    afterMount(({ actions, props }) => {
        actions.loadEvaluation()
        if (props.evaluationId !== 'new') {
            actions.loadEvaluationRuns()
        }
    }),
])
