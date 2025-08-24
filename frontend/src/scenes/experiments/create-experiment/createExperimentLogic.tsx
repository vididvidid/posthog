import { actions, connect, kea, listeners, path, reducers, selectors } from 'kea'
import { forms } from 'kea-forms'
import { loaders } from 'kea-loaders'
import { router } from 'kea-router'

import api from 'lib/api'
import { lemonToast } from 'lib/lemon-ui/LemonToast/LemonToast'
import { hasFormErrors, debounce } from 'lib/utils'
import { projectLogic } from 'scenes/projectLogic'
import { urls } from 'scenes/urls'

import { Experiment, FeatureFlagType, MultivariateFlagVariant } from '~/types'

import type { createExperimentLogicType } from './createExperimentLogicType'

// Utility function to generate feature flag key from experiment name
const generateFeatureFlagKey = (name: string, unavailableKeys: Set<string>): string => {
    const baseKey = name
        .toLowerCase()
        .replace(/[^A-Za-z0-9-_]+/g, '-')
        .replace(/-+$/, '')
        .replace(/^-+/, '')

    let key = baseKey
    let counter = 1

    while (unavailableKeys.has(key)) {
        key = `${baseKey}-${counter}`
        counter++
    }
    return key
}

const NEW_EXPERIMENT = {
    name: '',
    description: '',
    type: 'product',
    feature_flag_key: '',
    filters: {},
    metrics: [],
    metrics_secondary: [],
    saved_metrics_ids: [],
    saved_metrics: [],
    parameters: {
        feature_flag_variants: [
            { key: 'control', rollout_percentage: 50 },
            { key: 'test', rollout_percentage: 50 },
        ],
    },
    secondary_metrics: [],
    created_at: null,
    created_by: null,
    updated_at: null,
    holdout_id: null,
    exposure_criteria: {
        filterTestAccounts: true,
    },
}

export const createExperimentLogic = kea<createExperimentLogicType>([
    path(['scenes', 'experiments', 'create-experiment', 'createExperimentLogic']),
    connect(() => ({
        values: [projectLogic, ['currentProjectId']],
    })),
    actions({
        setSelectedSection: (section: string | null) => ({ section }),
        cancelExperiment: true,
        saveAsDraft: true,
        setFeatureFlagMode: (mode: 'new' | 'existing') => ({ mode }),
        updateFeatureFlagKey: (key: string) => ({ key }),
        setSelectedFeatureFlag: (flag: FeatureFlagType | null) => ({ flag }),
        validateFeatureFlagKey: (key: string) => ({ key }),
        generateFeatureFlagKeyFromName: true,
        addVariant: true,
        removeVariant: (index: number) => ({ index }),
        distributeVariantsEqually: true,
    }),
    reducers({
        selectedSection: [
            null as string | null,
            {
                setSelectedSection: (_, { section }) => section,
            },
        ],
        featureFlagMode: [
            'new' as 'new' | 'existing',
            {
                setFeatureFlagMode: (_, { mode }) => mode,
            },
        ],
        selectedFeatureFlag: [
            null as FeatureFlagType | null,
            {
                setSelectedFeatureFlag: (_, { flag }) => flag,
            },
        ],
        featureFlagKeyValidationError: [
            null as string | null,
            {
                validateFeatureFlagKeySuccess: () => null,
                validateFeatureFlagKeyFailure: (_, { error }) => error,
            },
        ],
    }),
    forms({
        experimentForm: {
            defaults: NEW_EXPERIMENT,
            errors: ({ name, feature_flag_key }) => ({
                name: !name?.trim() && 'Please enter a name',
                feature_flag_key: !feature_flag_key?.trim() && 'Please enter a feature flag key',
            }),
            submit: async (formValues) => {
                const currentProjectId = projectLogic.values.currentProjectId
                try {
                    const response: Experiment = await api.create(
                        `api/projects/${currentProjectId}/experiments`,
                        {
                            ...formValues,
                            name: formValues.name.trim(),
                            // Always save as draft initially
                            start_date: null,
                        }
                    )

                    if (response?.id) {
                        lemonToast.success('Experiment saved as draft')
                        router.actions.push(urls.experiment(response.id))
                    }
                } catch (error: any) {
                    lemonToast.error(error.detail || 'Failed to create experiment')
                }
            },
        },
    }),
    loaders(({ actions }) => ({
        existingFeatureFlags: [
            [] as FeatureFlagType[],
            {
                loadExistingFeatureFlags: async () => {
                    const currentProjectId = projectLogic.values.currentProjectId
                    // Load more flags for better browsing experience
                    const response = await api.get(`api/projects/${currentProjectId}/feature_flags/?limit=50`)
                    return response.results || []
                },
            },
        ],
        featureFlagValidation: [
            null as { available: boolean } | null,
            {
                validateFeatureFlagKey: async ({ key }) => {
                    if (!key?.trim()) {
                        actions.validateFeatureFlagKeyFailure('Feature flag key is required')
                        return null
                    }

                    const currentProjectId = projectLogic.values.currentProjectId
                    try {
                        const response = await api.get(
                            `api/projects/${currentProjectId}/feature_flags/?search=${encodeURIComponent(key)}`
                        )
                        const existingFlag = response.results?.find((flag: FeatureFlagType) => flag.key === key)
                        
                        if (existingFlag) {
                            actions.validateFeatureFlagKeyFailure('This feature flag key is already in use')
                            return { available: false }
                        } else {
                            actions.validateFeatureFlagKeySuccess({ available: true }, { key })
                            return { available: true }
                        }
                    } catch (error) {
                        actions.validateFeatureFlagKeyFailure('Error validating feature flag key')
                        return null
                    }
                },
            },
        ],
    })),
    listeners(({ actions, values }) => ({
        saveAsDraft: () => {
            // Touch form fields to show validation errors
            actions.touchExperimentFormField('name')
            
            // Validate based on mode
            if (values.featureFlagMode === 'new') {
                actions.touchExperimentFormField('feature_flag_key')
            } else if (values.featureFlagMode === 'existing' && !values.selectedFeatureFlag) {
                lemonToast.error('Please select an existing feature flag')
                return
            }
            
            // Check if form has validation errors
            if (hasFormErrors(values.experimentFormErrors)) {
                // Don't proceed if there are validation errors
                return
            }
            
            // Update form with selected flag key if using existing mode
            if (values.featureFlagMode === 'existing' && values.selectedFeatureFlag) {
                actions.setExperimentFormValue('feature_flag_key', values.selectedFeatureFlag.key)
            }
            
            // If validation passes, submit the form
            actions.submitExperimentForm()
        },
        cancelExperiment: () => {
            router.actions.push(urls.experiments())
        },
        generateFeatureFlagKeyFromName: () => {
            const experimentName = values.experimentForm.name
            if (experimentName?.trim()) {
                const unavailableKeys = new Set(values.existingFeatureFlags.map(flag => flag.key))
                const generatedKey = generateFeatureFlagKey(experimentName.trim(), unavailableKeys)
                actions.setExperimentFormValue('feature_flag_key', generatedKey)
                // Validate the generated key
                actions.validateFeatureFlagKey(generatedKey)
            }
        },
        updateFeatureFlagKey: debounce(({ key }: { key: string }) => {
            if (key?.trim()) {
                actions.validateFeatureFlagKey(key.trim())
            }
        }, 500),
        setFeatureFlagMode: ({ mode }) => {
            if (mode === 'new') {
                // Clear any selected existing flag
                actions.setSelectedFeatureFlag(null)
                // Generate key from name if we have one
                if (values.experimentForm.name?.trim()) {
                    actions.generateFeatureFlagKeyFromName()
                }
            } else if (mode === 'existing') {
                // Clear the form field for feature flag key
                actions.setExperimentFormValue('feature_flag_key', '')
                // Load existing flags for selection
                actions.loadExistingFeatureFlags()
            }
        },
        setExperimentFormValue: ({ name, value }) => {
            // Auto-generate feature flag key when name changes and we're in 'new' mode
            if (name === 'name' && value?.trim() && values.featureFlagMode === 'new') {
                actions.generateFeatureFlagKeyFromName()
            }
        },
        addVariant: () => {
            const variants = values.experimentForm.parameters.feature_flag_variants || []
            const newVariant: MultivariateFlagVariant = {
                key: `variant-${variants.length + 1}`,
                name: '',
                rollout_percentage: 0,
            }
            actions.setExperimentFormValue('parameters', {
                ...values.experimentForm.parameters,
                feature_flag_variants: [...variants, newVariant],
            })
        },
        removeVariant: ({ index }) => {
            const variants = values.experimentForm.parameters.feature_flag_variants || []
            if (variants.length <= 2) {
                lemonToast.error('Experiments must have at least 2 variants')
                return
            }
            const updatedVariants = variants.filter((_, i) => i !== index)
            actions.setExperimentFormValue('parameters', {
                ...values.experimentForm.parameters,
                feature_flag_variants: updatedVariants,
            })
        },
        distributeVariantsEqually: () => {
            const variants = values.experimentForm.parameters.feature_flag_variants || []
            const numVariants = variants.length
            if (numVariants === 0) return
            
            const percentageRounded = Math.round(100 / numVariants)
            const totalRounded = percentageRounded * numVariants
            const delta = totalRounded - 100
            
            const updatedVariants = variants.map((variant, index) => {
                const adjustedPercentage = index === numVariants - 1 
                    ? percentageRounded - delta  // Apply rounding error to last variant
                    : percentageRounded
                return { ...variant, rollout_percentage: adjustedPercentage }
            })
            
            actions.setExperimentFormValue('parameters', {
                ...values.experimentForm.parameters,
                feature_flag_variants: updatedVariants,
            })
        },
    })),
    selectors({
        availableFeatureFlags: [
            (s) => [s.existingFeatureFlags],
            (existingFeatureFlags: FeatureFlagType[]): { label: string; value: string; flag: FeatureFlagType }[] => {
                return existingFeatureFlags.map((flag: FeatureFlagType) => ({
                    label: `${flag.key} - ${flag.name || 'Untitled'}`,
                    value: flag.key,
                    flag,
                }))
            },
        ],
        variants: [
            (s) => [s.experimentForm],
            (experimentForm): MultivariateFlagVariant[] => {
                return experimentForm.parameters?.feature_flag_variants || []
            },
        ],
        variantPercentageSum: [
            (s) => [s.variants],
            (variants): number => {
                return variants.reduce((sum, variant) => sum + (variant.rollout_percentage || 0), 0)
            },
        ],
        breadcrumbs: [
            () => [],
            () => [
                {
                    key: 'experiments',
                    name: 'Experiments',
                    path: urls.experiments(),
                },
                {
                    key: 'new',
                    name: 'New Experiment',
                },
            ],
        ],
    }),
])
