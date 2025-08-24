import { useActions, useValues } from 'kea'

import { LemonModal } from '@posthog/lemon-ui'

import { modalsLogic } from '../modalsLogic'
import { getDefaultFunnelMetric } from '../utils'
import { createExperimentLogic } from './createExperimentLogic'

export function CreateExperimentMetricSourceModal({
    isSecondary,
}: {
    isSecondary?: boolean
}): JSX.Element {
    const { primaryMetrics, secondaryMetrics } = useValues(createExperimentLogic)
    const { addMetricsToForm } = useActions(createExperimentLogic)
    const {
        closePrimaryMetricSourceModal,
        closeSecondaryMetricSourceModal,
    } = useActions(modalsLogic)
    const { isPrimaryMetricSourceModalOpen, isSecondaryMetricSourceModalOpen } = useValues(modalsLogic)

    const isOpen = isSecondary ? isSecondaryMetricSourceModalOpen : isPrimaryMetricSourceModalOpen
    const closeCurrentModal = isSecondary ? closeSecondaryMetricSourceModal : closePrimaryMetricSourceModal

    const handleAddSingleUseMetric = () => {
        closeCurrentModal()
        
        const defaultMetric = getDefaultFunnelMetric()
        
        if (isSecondary) {
            const newSecondaryMetrics = [...(secondaryMetrics || []), defaultMetric]
            addMetricsToForm(primaryMetrics || [], newSecondaryMetrics)
        } else {
            const newPrimaryMetrics = [...(primaryMetrics || []), defaultMetric]
            addMetricsToForm(newPrimaryMetrics, secondaryMetrics || [])
        }
        
        // TODO: Open metric configuration modal after experiment is saved
        // For now, just add the default metric to the form
    }

    return (
        <LemonModal isOpen={isOpen} onClose={closeCurrentModal} width={1000} title="Choose metric source">
            <div className="flex gap-4 mb-4">
                <div
                    className="flex-1 cursor-pointer p-4 rounded border hover:border-accent"
                    onClick={handleAddSingleUseMetric}
                >
                    <div className="font-semibold">
                        <span>Single-use</span>
                    </div>
                    <div className="text-secondary text-sm leading-relaxed">
                        Create a new metric specific to this experiment. You can configure it after saving the experiment.
                    </div>
                </div>
                <div
                    className="flex-1 cursor-pointer p-4 rounded border hover:border-accent opacity-50 cursor-not-allowed"
                    title="Shared metrics require saving the experiment first"
                >
                    <div className="font-semibold">
                        <span>Shared</span>
                    </div>
                    <div className="text-secondary text-sm leading-relaxed">
                        Use a pre-configured metric that can be reused across experiments. (Available after saving)
                    </div>
                </div>
            </div>
        </LemonModal>
    )
}