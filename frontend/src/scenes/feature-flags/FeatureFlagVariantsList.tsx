import { Group } from 'kea-forms'

import { IconBalance, IconPlus, IconTrash } from '@posthog/icons'
import { LemonButton } from '@posthog/lemon-ui'

import { LemonField } from 'lib/lemon-ui/LemonField'
import { LemonInput } from 'lib/lemon-ui/LemonInput/LemonInput'
import { Lettermark, LettermarkColor } from 'lib/lemon-ui/Lettermark'
import { alphabet } from 'lib/utils'

import { MultivariateFlagVariant } from '~/types'

import { JSONEditorInput } from './JSONEditorInput'

export interface FeatureFlagVariantsListProps {
    variants: MultivariateFlagVariant[]
    onAddVariant: () => void
    onRemoveVariant: (index: number) => void
    onDistributeVariantsEqually: () => void
    showPayloads?: boolean
    canEditVariant?: (index: number) => boolean
    readOnly?: boolean
    minVariants?: number
    addVariantText?: string
    distributionValidation?: boolean
    variantRolloutSum?: number
    areVariantsValid?: boolean
    disabledReason?: string
    focusVariantKeyField?: (index: number) => void
    renderAdditionalVariantFields?: (variant: MultivariateFlagVariant, index: number) => React.ReactNode
    // Form field paths for different contexts
    variantKeyPath?: (index: number) => (string | number)[] // Path to variant key field
    variantNamePath?: (index: number) => (string | number)[] // Path to variant name field  
    variantRolloutPath?: (index: number) => (string | number)[] // Path to variant rollout field
    payloadPath?: (index: number) => (string | number)[] // Path to payload field
}

export function FeatureFlagVariantsList({
    variants,
    onAddVariant,
    onRemoveVariant,
    onDistributeVariantsEqually,
    showPayloads = false,
    canEditVariant = () => true,
    readOnly = false,
    minVariants = 1,
    addVariantText = 'Add variant',
    distributionValidation = true,
    variantRolloutSum = 0,
    areVariantsValid = true,
    disabledReason,
    focusVariantKeyField,
    renderAdditionalVariantFields,
    // Default paths for feature flag context
    variantKeyPath = (index: number) => ['multivariate', 'variants', index, 'key'],
    variantNamePath = (index: number) => ['multivariate', 'variants', index, 'name'],
    variantRolloutPath = (index: number) => ['multivariate', 'variants', index, 'rollout_percentage'],
    payloadPath = (index: number) => ['payloads', index],
}: FeatureFlagVariantsListProps): JSX.Element {
    const handleAddVariant = (): void => {
        const newIndex = variants.length
        onAddVariant()
        if (focusVariantKeyField) {
            focusVariantKeyField(newIndex)
        }
    }

    const handleRemoveVariant = (index: number): void => {
        if (variants.length > minVariants) {
            onRemoveVariant(index)
        }
    }

    if (readOnly) {
        return <></>
    }

    return (
        <div className="feature-flag-variants">
            <h3 className="l4">Variant keys</h3>
            {distributionValidation && (
                <span>The rollout percentage of feature flag variants must add up to 100%</span>
            )}
            <div className="VariantFormList deprecated-space-y-2">
                <div className="VariantFormList__row grid label-row gap-2 items-center">
                    <div />
                    <div className="col-span-4">Variant key</div>
                    <div className="col-span-6">Description</div>
                    {showPayloads && (
                        <div className="col-span-8">
                            <div className="flex flex-col">
                                <b>Payload</b>
                                <span className="text-secondary font-normal">
                                    Specify return payload when the variant key matches
                                </span>
                            </div>
                        </div>
                    )}
                    <div className="col-span-3 flex justify-between items-center gap-1">
                        <span>Rollout</span>
                        <LemonButton
                            onClick={onDistributeVariantsEqually}
                            tooltip="Normalize variant rollout percentages"
                        >
                            <IconBalance />
                        </LemonButton>
                    </div>
                </div>
                {variants.map((variant: MultivariateFlagVariant, index: number) => (
                    <Group key={index} name="filters">
                        <div className="VariantFormList__row grid gap-2">
                            <div className="flex items-center justify-center">
                                <Lettermark name={alphabet[index]} color={LettermarkColor.Gray} />
                            </div>
                            <div className="col-span-4">
                                <LemonField name={variantKeyPath(index)}>
                                    <LemonInput
                                        data-attr="feature-flag-variant-key"
                                        data-key-index={index.toString()}
                                        className="ph-ignore-input"
                                        placeholder={`example-variant-${index + 1}`}
                                        autoComplete="off"
                                        autoCapitalize="off"
                                        autoCorrect="off"
                                        spellCheck={false}
                                        disabled={!canEditVariant(index)}
                                    />
                                </LemonField>
                            </div>
                            <div className="col-span-6">
                                <LemonField name={variantNamePath(index)}>
                                    <LemonInput
                                        data-attr="feature-flag-variant-name"
                                        className="ph-ignore-input"
                                        placeholder="Description"
                                        disabled={!canEditVariant(index)}
                                    />
                                </LemonField>
                            </div>
                            {showPayloads && (
                                <div className="col-span-8">
                                    <LemonField name={payloadPath(index)}>
                                        {({ value, onChange }) => {
                                            return (
                                                <JSONEditorInput
                                                    onChange={(newValue) => {
                                                        onChange(newValue === '' ? undefined : newValue)
                                                    }}
                                                    value={value}
                                                    placeholder='{"key": "value"}'
                                                />
                                            )
                                        }}
                                    </LemonField>
                                </div>
                            )}
                            <div className="col-span-3">
                                <LemonField name={variantRolloutPath(index)}>
                                    {({ value, onChange }) => (
                                        <div>
                                            <LemonInput
                                                type="number"
                                                min={0}
                                                max={100}
                                                // .toString() prevents user from typing leading zeroes
                                                value={value?.toString() || '0'}
                                                onChange={(changedValue) => {
                                                    const valueInt =
                                                        changedValue !== undefined &&
                                                        !isNaN(changedValue)
                                                            ? parseInt(changedValue.toString())
                                                            : 0

                                                    onChange(valueInt)
                                                }}
                                                suffix={<span>%</span>}
                                                data-attr="feature-flag-variant-rollout-percentage-input"
                                                disabled={!canEditVariant(index)}
                                            />
                                            {renderAdditionalVariantFields && renderAdditionalVariantFields(variant, index)}
                                        </div>
                                    )}
                                </LemonField>
                            </div>
                            <div className="flex items-center justify-center">
                                {variants.length > minVariants && (
                                    <LemonButton
                                        icon={<IconTrash />}
                                        data-attr={`delete-prop-filter-${index}`}
                                        noPadding
                                        onClick={() => handleRemoveVariant(index)}
                                        disabledReason={
                                            !canEditVariant(index)
                                                ? disabledReason
                                                : undefined
                                        }
                                        tooltipPlacement="top-end"
                                    />
                                )}
                            </div>
                        </div>
                    </Group>
                ))}
                {distributionValidation && variants.length > 0 && !areVariantsValid && (
                    <p className="text-danger">
                        Percentage rollouts for variants must sum to 100 (currently {variantRolloutSum}).
                    </p>
                )}
                <LemonButton
                    type="secondary"
                    onClick={handleAddVariant}
                    icon={<IconPlus />}
                    disabledReason={disabledReason}
                    tooltipPlacement="top-start"
                    center
                >
                    {addVariantText}
                </LemonButton>
            </div>
        </div>
    )
}