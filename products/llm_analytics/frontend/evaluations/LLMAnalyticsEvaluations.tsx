import { BindLogic, useActions, useValues } from 'kea'
import { router } from 'kea-router'

import { IconCopy, IconPencil, IconPlus, IconSearch, IconTrash } from '@posthog/icons'
import { LemonButton, LemonInput, LemonSwitch, LemonTable, LemonTag, Link } from '@posthog/lemon-ui'

import { More } from 'lib/lemon-ui/LemonButton/More'
import { LemonTableColumns } from 'lib/lemon-ui/LemonTable'
import { humanFriendlyDuration } from 'lib/utils'

import { urls } from '~/scenes/urls'

import { llmEvaluationsLogic } from './llmEvaluationsLogic'
import { EvaluationConfig } from './types'

export function LLMAnalyticsEvaluations(): JSX.Element {
    const { filteredEvaluations, evaluationsLoading, evaluationsFilter } = useValues(llmEvaluationsLogic)
    const { setEvaluationsFilter, toggleEvaluationEnabled, deleteEvaluation, duplicateEvaluation } =
        useActions(llmEvaluationsLogic)
    const { push } = useActions(router)

    const columns: LemonTableColumns<EvaluationConfig> = [
        {
            title: 'Name',
            key: 'name',
            render: (_, evaluation) => (
                <div className="flex flex-col">
                    <Link to={urls.llmAnalyticsEvaluation(evaluation.id)} className="font-semibold text-primary">
                        {evaluation.name}
                    </Link>
                    {evaluation.description && <div className="text-muted text-sm">{evaluation.description}</div>}
                </div>
            ),
            sorter: (a, b) => a.name.localeCompare(b.name),
        },
        {
            title: 'Status',
            key: 'enabled',
            render: (_, evaluation) => (
                <div className="flex items-center gap-2">
                    <LemonSwitch
                        checked={evaluation.enabled}
                        onChange={() => toggleEvaluationEnabled(evaluation.id)}
                        size="small"
                    />
                    <span className={evaluation.enabled ? 'text-success' : 'text-muted'}>
                        {evaluation.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                </div>
            ),
            sorter: (a, b) => Number(b.enabled) - Number(a.enabled),
        },
        {
            title: 'Prompt',
            key: 'prompt',
            render: (_, evaluation) => (
                <div className="max-w-md">
                    <div className="text-sm font-mono bg-bg-light border rounded px-2 py-1 truncate">
                        {evaluation.prompt || '(No prompt)'}
                    </div>
                </div>
            ),
        },
        {
            title: 'Triggers',
            key: 'conditions',
            render: (_, evaluation) => (
                <div className="flex flex-wrap gap-1">
                    {evaluation.conditions.map((condition) => (
                        <LemonTag key={condition.id} type="option">
                            {condition.rollout_percentage}%
                            {condition.properties.length > 0 &&
                                ` when ${condition.properties.length} condition${condition.properties.length !== 1 ? 's' : ''}`}
                        </LemonTag>
                    ))}
                    {evaluation.conditions.length === 0 && <span className="text-muted text-sm">No triggers</span>}
                </div>
            ),
        },
        {
            title: 'Runs',
            key: 'total_runs',
            render: (_, evaluation) => (
                <div className="flex flex-col items-center">
                    <div className="font-semibold">{evaluation.total_runs}</div>
                    {evaluation.last_run_at && (
                        <div className="text-muted text-xs">Last: {humanFriendlyDuration(evaluation.last_run_at)}</div>
                    )}
                </div>
            ),
            sorter: (a, b) => b.total_runs - a.total_runs,
        },
        {
            title: 'Actions',
            key: 'actions',
            render: (_, evaluation) => (
                <More
                    overlay={
                        <>
                            <LemonButton
                                icon={<IconPencil />}
                                onClick={() => push(urls.llmAnalyticsEvaluation(evaluation.id))}
                                fullWidth
                            >
                                Edit
                            </LemonButton>
                            <LemonButton
                                icon={<IconCopy />}
                                onClick={() => duplicateEvaluation(evaluation.id)}
                                fullWidth
                            >
                                Duplicate
                            </LemonButton>
                            <LemonButton
                                icon={<IconTrash />}
                                status="danger"
                                onClick={() => {
                                    if (window.confirm(`Are you sure you want to delete "${evaluation.name}"?`)) {
                                        deleteEvaluation(evaluation.id)
                                    }
                                }}
                                fullWidth
                            >
                                Delete
                            </LemonButton>
                        </>
                    }
                />
            ),
        },
    ]

    return (
        <BindLogic logic={llmEvaluationsLogic}>
            <div className="space-y-4">
                {/* Header */}
                <div className="flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-semibold">Evaluations</h2>
                        <p className="text-muted">
                            Configure evaluation prompts and triggers to automatically assess your LLM generations.
                        </p>
                    </div>
                    <LemonButton
                        type="primary"
                        icon={<IconPlus />}
                        onClick={() => push(urls.llmAnalyticsEvaluationNew())}
                    >
                        Create Evaluation
                    </LemonButton>
                </div>

                {/* Search */}
                <div className="flex items-center gap-2">
                    <LemonInput
                        type="search"
                        placeholder="Search evaluations..."
                        value={evaluationsFilter}
                        onChange={setEvaluationsFilter}
                        prefix={<IconSearch />}
                        className="max-w-sm"
                    />
                </div>

                {/* Table */}
                <LemonTable
                    columns={columns}
                    dataSource={filteredEvaluations}
                    loading={evaluationsLoading}
                    rowKey="id"
                    pagination={{
                        pageSize: 50,
                    }}
                    emptyState={
                        evaluationsFilter ? (
                            <div className="text-center">
                                <div className="text-muted">No evaluations match your search</div>
                                <LemonButton type="secondary" onClick={() => setEvaluationsFilter('')} className="mt-2">
                                    Clear search
                                </LemonButton>
                            </div>
                        ) : (
                            <div className="text-center">
                                <div className="text-muted mb-2">No evaluations configured yet</div>
                                <LemonButton
                                    type="primary"
                                    icon={<IconPlus />}
                                    onClick={() => push(urls.llmAnalyticsEvaluationNew())}
                                >
                                    Create your first evaluation
                                </LemonButton>
                            </div>
                        )
                    }
                />
            </div>
        </BindLogic>
    )
}
