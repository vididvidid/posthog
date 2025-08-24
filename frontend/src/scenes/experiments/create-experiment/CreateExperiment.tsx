import { useActions, useValues } from 'kea'
import { Form } from 'kea-forms'

import { 
    LemonButton, 
    LemonCollapse, 
    LemonInput, 
    LemonTextArea, 
    LemonTable,
    Link 
} from '@posthog/lemon-ui'

import { PageHeader } from 'lib/components/PageHeader'
import { LemonField } from 'lib/lemon-ui/LemonField'
import { IconOpenInNew } from 'lib/lemon-ui/icons'
import { urls } from 'scenes/urls'

import { FeatureFlagType } from '~/types'

import { FeatureFlagVariantsList } from '../../feature-flags/FeatureFlagVariantsList'
import { createExperimentLogic } from './createExperimentLogic'

export const CreateExperiment = (): JSX.Element => {
    const { 
        selectedSection, 
        featureFlagMode, 
        availableFeatureFlags,
        featureFlagKeyValidationError,
        existingFeatureFlagsLoading,
        selectedFeatureFlag,
        variants,
        variantPercentageSum
    } = useValues(createExperimentLogic)
    const { 
        setSelectedSection, 
        cancelExperiment, 
        saveAsDraft,
        setFeatureFlagMode,
        updateFeatureFlagKey,
        setSelectedFeatureFlag,
        generateFeatureFlagKeyFromName,
        addVariant,
        removeVariant,
        distributeVariantsEqually
    } = useActions(createExperimentLogic)

    return (
        <div>
            <PageHeader
                buttons={
                    <div className="flex items-center gap-2">
                        <LemonButton type="secondary" onClick={cancelExperiment}>
                            Cancel
                        </LemonButton>
                        <LemonButton type="primary" onClick={saveAsDraft}>
                            Save as draft
                        </LemonButton>
                    </div>
                }
            />
            
            <div className="mt-4">
                <Form logic={createExperimentLogic} formKey="experimentForm" enableFormOnSubmit>
                    <div className="flex flex-col gap-4">
                        <LemonField name="name" label="Name">
                            <LemonInput 
                                data-attr="experiment-name" 
                                placeholder="e.g., Pricing page conversion"
                            />
                        </LemonField>
                        
                        <LemonField name="description" label="Description (optional)">
                            <LemonTextArea 
                                data-attr="experiment-description" 
                                placeholder="Describe the goal of this experiment..."
                                minRows={3}
                            />
                        </LemonField>
                        
                        <LemonCollapse
                            activeKey={selectedSection || undefined}
                            onChange={(section) => setSelectedSection(section)}
                            className="bg-surface-primary mt-4"
                            panels={[
                                {
                                    key: 'exposure',
                                    header: 'Exposure',
                                    content: (
                                        <div className="p-4 space-y-4">
                                            <div className="text-muted max-w-xl">
                                                Experiments are controlled by feature flags. You can create a new feature flag for this experiment or use an existing one.
                                            </div>

                                            <div>
                                                <div className="font-semibold mb-2">Create new feature flag</div>
                                                <div className="flex items-center justify-between p-3 border rounded bg-bg-light">
                                                    <div className="flex-1 mr-3">
                                                        <LemonField name="feature_flag_key">
                                                            <LemonInput 
                                                                data-attr="feature-flag-key"
                                                                placeholder="e.g., pricing-page-conversion"
                                                                onChange={(value) => updateFeatureFlagKey(value)}
                                                                className="font-semibold text-secondary"
                                                            />
                                                        </LemonField>
                                                        {featureFlagKeyValidationError && (
                                                            <div className="text-danger text-xs mt-1">
                                                                {featureFlagKeyValidationError}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <LemonButton
                                                            type="secondary"
                                                            size="xsmall"
                                                            onClick={generateFeatureFlagKeyFromName}
                                                        >
                                                            Auto-generate
                                                        </LemonButton>
                                                        <LemonButton 
                                                            type="primary" 
                                                            size="xsmall"
                                                            onClick={() => setFeatureFlagMode('new')}
                                                            className={featureFlagMode === 'new' ? 'bg-primary' : ''}
                                                        >
                                                            {featureFlagMode === 'new' ? 'Selected' : 'Select'}
                                                        </LemonButton>
                                                    </div>
                                                </div>
                                                <div className="text-xs text-muted mt-2">
                                                    A new feature flag will be created when you save the experiment.
                                                </div>
                                            </div>

                                            <div>
                                                <div className="font-semibold mb-2">Use existing feature flag</div>
                                                {featureFlagMode === 'existing' ? (
                                                    <div className="space-y-3">
                                                        <LemonTable
                                                            loading={existingFeatureFlagsLoading}
                                                            dataSource={availableFeatureFlags.map(option => option.flag)}
                                                            useURLForSorting={false}
                                                            pagination={{
                                                                pageSize: 5,
                                                                hideOnSinglePage: false,
                                                            }}
                                                            columns={[
                                                                {
                                                                    title: 'Key',
                                                                    dataIndex: 'key',
                                                                    sorter: (a: FeatureFlagType, b: FeatureFlagType) => (a.key || '').localeCompare(b.key || ''),
                                                                    render: (_, flag: FeatureFlagType) => (
                                                                        <div className="flex items-center">
                                                                            <div className="font-semibold">{flag.key}</div>
                                                                            <Link
                                                                                to={urls.featureFlag(flag.id as number)}
                                                                                target="_blank"
                                                                                className="flex items-center"
                                                                            >
                                                                                <IconOpenInNew className="ml-1" />
                                                                            </Link>
                                                                        </div>
                                                                    ),
                                                                },
                                                                {
                                                                    title: 'Name',
                                                                    dataIndex: 'name',
                                                                    sorter: (a: FeatureFlagType, b: FeatureFlagType) => (a.name || '').localeCompare(b.name || ''),
                                                                },
                                                                {
                                                                    title: null,
                                                                    width: 80,
                                                                    render: function RenderActions(_, flag: FeatureFlagType) {
                                                                        const isSelected = selectedFeatureFlag?.id === flag.id
                                                                        return (
                                                                            <LemonButton
                                                                                size="xsmall"
                                                                                type={isSelected ? "secondary" : "primary"}
                                                                                onClick={() => {
                                                                                    setSelectedFeatureFlag(flag)
                                                                                }}
                                                                                className={isSelected ? 'bg-primary-alt text-primary-dark' : ''}
                                                                            >
                                                                                {isSelected ? 'Selected' : 'Select'}
                                                                            </LemonButton>
                                                                        )
                                                                    },
                                                                },
                                                            ]}
                                                        />
                                                        {selectedFeatureFlag && (
                                                            <div className="p-3 border rounded bg-primary-highlight">
                                                                <div className="font-semibold text-primary-dark">
                                                                    Selected: {selectedFeatureFlag.key}
                                                                </div>
                                                                <div className="text-xs text-muted mt-1">
                                                                    {selectedFeatureFlag.name || 'Untitled feature flag'}
                                                                </div>
                                                            </div>
                                                        )}
                                                        <div className="text-xs text-muted">
                                                            The experiment will use the targeting and rollout settings from the selected feature flag.
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center justify-between p-3 border rounded bg-surface-secondary">
                                                        <div className="text-muted">
                                                            Choose from your existing feature flags
                                                        </div>
                                                        <LemonButton 
                                                            type="primary" 
                                                            size="xsmall"
                                                            onClick={() => setFeatureFlagMode('existing')}
                                                        >
                                                            Select
                                                        </LemonButton>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ),
                                },
                                {
                                    key: 'variants',
                                    header: 'Variants',
                                    content: (
                                        <div className="p-4 space-y-4">
                                            {featureFlagMode === 'existing' ? (
                                                <div className="text-muted">
                                                    Variant configuration is controlled by the selected feature flag. 
                                                    You can modify variants by editing the feature flag directly.
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="text-muted max-w-xl">
                                                        Configure the variants for your experiment. Each variant represents a different version 
                                                        your users might see. The rollout percentages must add up to 100%.
                                                    </div>
                                                    
                                                    <FeatureFlagVariantsList
                                                        variants={variants}
                                                        onAddVariant={addVariant}
                                                        onRemoveVariant={removeVariant}
                                                        onDistributeVariantsEqually={distributeVariantsEqually}
                                                        showPayloads={false}
                                                        canEditVariant={() => true}
                                                        readOnly={false}
                                                        minVariants={2}
                                                        addVariantText="Add variant"
                                                        distributionValidation={true}
                                                        variantRolloutSum={variantPercentageSum}
                                                        areVariantsValid={variantPercentageSum === 100}
                                                        disabledReason={undefined}
                                                        // Use experiment form paths instead of feature flag paths
                                                        variantKeyPath={(index) => ['parameters', 'feature_flag_variants', index, 'key']}
                                                        variantNamePath={(index) => ['parameters', 'feature_flag_variants', index, 'name']}
                                                        variantRolloutPath={(index) => ['parameters', 'feature_flag_variants', index, 'rollout_percentage']}
                                                    />
                                                </>
                                            )}
                                        </div>
                                    ),
                                },
                                {
                                    key: 'metrics',
                                    header: 'Metrics',
                                    content: <div className="p-4 text-muted">Metrics configuration coming soon...</div>,
                                },
                            ]}
                        />
                    </div>
                </Form>
            </div>
        </div>
    )
}
