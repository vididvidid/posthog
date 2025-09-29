import { actions, afterMount, kea, listeners, path, reducers, selectors } from 'kea'

import type { llmEvaluationsLogicType } from './llmEvaluationsLogicType'
import { EvaluationConfig } from './types'

// Shared mock data store for prototyping
declare global {
    interface Window {
        mockEvaluations?: EvaluationConfig[]
    }
}

// Initialize shared mock data store
const MOCK_EVALUATIONS: EvaluationConfig[] = [
    {
        id: 'eval-1',
        name: 'Helpfulness Check',
        description: 'Evaluates if responses are helpful to users',
        enabled: true,
        prompt: 'Is this response helpful and accurate? Return true if yes, false if no.',
        conditions: [
            {
                id: 'cond-1',
                rollout_percentage: 10,
                properties: [{ key: 'model', operator: 'exact', value: 'gpt-4', type: 'event' }],
            },
        ],
        total_runs: 47,
        last_run_at: '2024-01-15T10:30:00Z',
        created_at: '2024-01-10T09:00:00Z',
        updated_at: '2024-01-15T10:30:00Z',
    },
    {
        id: 'eval-2',
        name: 'Safety Check',
        description: 'Ensures responses are safe and appropriate',
        enabled: false,
        prompt: 'Is this response safe and appropriate? Return true if safe, false if not.',
        conditions: [
            {
                id: 'cond-2',
                rollout_percentage: 5,
                properties: [{ key: 'topic', operator: 'exact', value: 'medical', type: 'event' }],
            },
        ],
        total_runs: 12,
        last_run_at: '2024-01-12T15:20:00Z',
        created_at: '2024-01-08T14:30:00Z',
        updated_at: '2024-01-12T15:20:00Z',
    },
]

export const llmEvaluationsLogic = kea<llmEvaluationsLogicType>([
    path(['products', 'llm_analytics', 'evaluations', 'llmEvaluationsLogic']),

    actions({
        loadEvaluations: true,
        loadEvaluationsSuccess: (evaluations: EvaluationConfig[]) => ({ evaluations }),
        createEvaluation: (evaluation: Partial<EvaluationConfig>) => ({ evaluation }),
        createEvaluationSuccess: (evaluation: EvaluationConfig) => ({ evaluation }),
        updateEvaluation: (id: string, evaluation: Partial<EvaluationConfig>) => ({ id, evaluation }),
        updateEvaluationSuccess: (id: string, evaluation: Partial<EvaluationConfig>) => ({ id, evaluation }),
        deleteEvaluation: (id: string) => ({ id }),
        deleteEvaluationSuccess: (id: string) => ({ id }),
        duplicateEvaluation: (id: string) => ({ id }),
        duplicateEvaluationSuccess: (evaluation: EvaluationConfig) => ({ evaluation }),
        toggleEvaluationEnabled: (id: string) => ({ id }),
        toggleEvaluationEnabledSuccess: (id: string) => ({ id }),
        setEvaluationsFilter: (filter: string) => ({ filter }),
    }),

    reducers({
        evaluations: [
            MOCK_EVALUATIONS as EvaluationConfig[],
            {
                loadEvaluationsSuccess: (_, { evaluations }) => evaluations,
                createEvaluationSuccess: (state, { evaluation }) => [...state, evaluation],
                updateEvaluationSuccess: (state, { id, evaluation }) =>
                    state.map((e: EvaluationConfig) =>
                        e.id === id ? { ...e, ...evaluation, updated_at: new Date().toISOString() } : e
                    ),
                deleteEvaluationSuccess: (state, { id }) => state.filter((e: EvaluationConfig) => e.id !== id),
                duplicateEvaluationSuccess: (state, { evaluation }) => [...state, evaluation],
                toggleEvaluationEnabledSuccess: (state, { id }) =>
                    state.map((e: EvaluationConfig) =>
                        e.id === id ? { ...e, enabled: !e.enabled, updated_at: new Date().toISOString() } : e
                    ),
            },
        ],
        evaluationsLoading: [
            false,
            {
                loadEvaluations: () => true,
                loadEvaluationsSuccess: () => false,
            },
        ],
        evaluationsFilter: [
            '',
            {
                setEvaluationsFilter: (_, { filter }) => filter,
            },
        ],
    }),

    listeners(({ actions }) => ({
        loadEvaluations: async () => {
            // Simulate loading delay
            await new Promise((resolve) => setTimeout(resolve, 500))
            // TODO: Replace with actual backend API call
            // const evaluations = await api.evaluations.list()
            actions.loadEvaluationsSuccess(window.mockEvaluations || [])
        },

        createEvaluation: ({ evaluation }) => {
            // Create new evaluation with generated ID
            const newEvaluation: EvaluationConfig = {
                ...evaluation,
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
            actions.createEvaluationSuccess(newEvaluation)
        },

        updateEvaluation: ({ id, evaluation }) => {
            // Update shared mock store
            if (window.mockEvaluations) {
                const index = window.mockEvaluations.findIndex((e) => e.id === id)
                if (index >= 0) {
                    window.mockEvaluations[index] = {
                        ...window.mockEvaluations[index],
                        ...evaluation,
                        updated_at: new Date().toISOString(),
                    }
                }
            }

            // TODO: Replace with actual backend API call
            // const response = await api.evaluations.update(id, evaluation)
            actions.updateEvaluationSuccess(id, evaluation)
        },

        deleteEvaluation: ({ id }) => {
            // Update shared mock store
            if (window.mockEvaluations) {
                window.mockEvaluations = window.mockEvaluations.filter((e) => e.id !== id)
            }

            // TODO: Replace with actual backend API call
            // await api.evaluations.delete(id)
            actions.deleteEvaluationSuccess(id)
        },

        duplicateEvaluation: ({ id }) => {
            const original = window.mockEvaluations?.find((e: EvaluationConfig) => e.id === id)
            if (original) {
                const duplicate: EvaluationConfig = {
                    ...original,
                    id: `eval-${Date.now()}`,
                    name: `${original.name} (Copy)`,
                    total_runs: 0,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                }

                // Update shared mock store
                if (window.mockEvaluations) {
                    window.mockEvaluations.push(duplicate)
                }

                // TODO: Replace with actual backend API call
                // const response = await api.evaluations.create(duplicate)
                actions.duplicateEvaluationSuccess(duplicate)
            }
        },

        toggleEvaluationEnabled: ({ id }) => {
            // Update shared mock store
            if (window.mockEvaluations) {
                const index = window.mockEvaluations.findIndex((e) => e.id === id)
                if (index >= 0) {
                    window.mockEvaluations[index].enabled = !window.mockEvaluations[index].enabled
                    window.mockEvaluations[index].updated_at = new Date().toISOString()
                }
            }

            // TODO: Replace with actual backend API call
            // const evaluation = await api.evaluations.get(id)
            // await api.evaluations.update(id, { enabled: !evaluation.enabled })
            actions.toggleEvaluationEnabledSuccess(id)
        },
    })),

    selectors({
        filteredEvaluations: [
            (s) => [s.evaluations, s.evaluationsFilter],
            (evaluations: EvaluationConfig[], filter: string) => {
                if (!filter) {
                    return evaluations
                }
                return evaluations.filter(
                    (e: EvaluationConfig) =>
                        e.name.toLowerCase().includes(filter.toLowerCase()) ||
                        e.description?.toLowerCase().includes(filter.toLowerCase()) ||
                        e.prompt.toLowerCase().includes(filter.toLowerCase())
                )
            },
        ],
    }),

    afterMount(({ actions }) => {
        // Initialize shared mock data store for prototyping
        if (!window.mockEvaluations) {
            window.mockEvaluations = [...MOCK_EVALUATIONS]
        }
        actions.loadEvaluations()
    }),
])
