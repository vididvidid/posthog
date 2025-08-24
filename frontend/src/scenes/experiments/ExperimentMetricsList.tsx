import { IconPlus, IconTrash } from '@posthog/icons'
import { LemonButton } from '@posthog/lemon-ui'

import { 
    ExperimentMetric, 
    ExperimentFunnelsQuery, 
    ExperimentTrendsQuery, 
    isExperimentFunnelMetric, 
    isExperimentMeanMetric, 
    isExperimentRatioMetric,
    NodeKind
} from '~/queries/schema/schema-general'

type ExperimentMetricQuery = ExperimentFunnelsQuery | ExperimentTrendsQuery | ExperimentMetric

export interface ExperimentMetricsListProps {
    metrics: ExperimentMetricQuery[]
    onAddMetric: () => void
    onRemoveMetric: (index: number) => void
    readOnly?: boolean
    isPrimary?: boolean
    addMetricText?: string
    disabledReason?: string
}

function getMetricDisplayInfo(metric: ExperimentMetricQuery): { type: string; description: string } {
    // Handle new ExperimentMetric types
    if (metric.kind === NodeKind.ExperimentMetric) {
        if (isExperimentFunnelMetric(metric)) {
            const stepCount = metric.series?.length || 0
            return {
                type: 'Funnel',
                description: stepCount > 0 ? `${stepCount} steps` : 'No steps configured'
            }
        } else if (isExperimentMeanMetric(metric)) {
            const eventName = metric.source && 'event' in metric.source ? metric.source.event || 'No event' : 'No event'
            return {
                type: 'Mean', 
                description: eventName
            }
        } else if (isExperimentRatioMetric(metric)) {
            return {
                type: 'Ratio',
                description: 'Custom ratio metric'
            }
        }
    }
    
    // Handle legacy query types
    if (metric.kind === NodeKind.ExperimentFunnelsQuery) {
        return {
            type: 'Funnel',
            description: 'Legacy funnel query'
        }
    }
    
    if (metric.kind === NodeKind.ExperimentTrendsQuery) {
        return {
            type: 'Trends',
            description: 'Legacy trends query'
        }
    }
    
    return {
        type: 'Unknown',
        description: 'Metric type not recognized'
    }
}

export function ExperimentMetricsList({
    metrics,
    onAddMetric,
    onRemoveMetric,
    readOnly = false,
    isPrimary = true,
    addMetricText,
    disabledReason,
}: ExperimentMetricsListProps): JSX.Element {
    const metricTypeLabel = isPrimary ? 'primary' : 'secondary'
    const defaultAddText = `Add ${metricTypeLabel} metric`

    if (readOnly) {
        return <></>
    }

    return (
        <div className="space-y-3">
            {metrics.length === 0 ? (
                <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
                    <div className="text-muted mb-2">No {metricTypeLabel} metrics added</div>
                    <div className="text-sm text-muted">
                        {isPrimary 
                            ? 'Add a primary metric to measure the main impact of your experiment'
                            : 'Secondary metrics help you understand the broader impact of your experiment'
                        }
                    </div>
                </div>
            ) : (
                <div className="space-y-3">
                    {metrics.map((metric, index) => {
                        const { type, description } = getMetricDisplayInfo(metric)
                        return (
                            <div key={index} className="border rounded-lg p-4 flex items-center justify-between">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        <div className="font-semibold">
                                            {'name' in metric && metric.name ? metric.name : `Unnamed ${type.toLowerCase()} metric`}
                                        </div>
                                        <div className="text-xs bg-accent-3000 text-accent-dark px-2 py-1 rounded">
                                            {type}
                                        </div>
                                    </div>
                                    <div className="text-sm text-muted mt-1">{description}</div>
                                </div>
                                <LemonButton
                                    type="secondary"
                                    size="small"
                                    icon={<IconTrash />}
                                    onClick={() => onRemoveMetric(index)}
                                    disabledReason={disabledReason}
                                    tooltipPlacement="top-end"
                                >
                                    Remove
                                </LemonButton>
                            </div>
                        )
                    })}
                </div>
            )}
            <LemonButton
                type="secondary"
                onClick={onAddMetric}
                icon={<IconPlus />}
                disabledReason={disabledReason}
                center
            >
                {addMetricText || defaultAddText}
            </LemonButton>
        </div>
    )
}