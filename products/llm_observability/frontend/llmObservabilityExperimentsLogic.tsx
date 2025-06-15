import { actions, afterMount, connect, kea, path, reducers, selectors } from 'kea'
import { TaxonomicFilterGroupType } from 'lib/components/TaxonomicFilter/types'
import { sceneLogic } from 'scenes/sceneLogic'

import { groupsModel } from '~/models/groupsModel'
import { DataTableNode, NodeKind } from '~/queries/schema/schema-general'
import { AnyPropertyFilter } from '~/types'

import type { llmObservabilityExperimentsLogicType } from './llmObservabilityExperimentsLogicType'

const INITIAL_DATE_FROM = '-7d' as string | null
const INITIAL_DATE_TO = null as string | null

export const llmObservabilityExperimentsLogic = kea<llmObservabilityExperimentsLogicType>([
    path(['products', 'llm_observability', 'frontend', 'llmObservabilityExperimentsLogic']),

    connect(() => ({ values: [sceneLogic, ['sceneKey'], groupsModel, ['groupsEnabled']] })),

    actions({
        setDates: (dateFrom: string | null, dateTo: string | null) => ({ dateFrom, dateTo }),
        setShouldFilterTestAccounts: (shouldFilterTestAccounts: boolean) => ({ shouldFilterTestAccounts }),
        setPropertyFilters: (propertyFilters: AnyPropertyFilter[]) => ({ propertyFilters }),
        setExperimentsQuery: (query: DataTableNode) => ({ query }),
    }),

    reducers({
        dateFilter: [
            {
                dateFrom: INITIAL_DATE_FROM,
                dateTo: INITIAL_DATE_TO,
            },
            {
                setDates: (_, { dateFrom, dateTo }) => ({ dateFrom, dateTo }),
            },
        ],

        shouldFilterTestAccounts: [
            false,
            {
                setShouldFilterTestAccounts: (_, { shouldFilterTestAccounts }) => shouldFilterTestAccounts,
            },
        ],

        propertyFilters: [
            [] as AnyPropertyFilter[],
            {
                setPropertyFilters: (_, { propertyFilters }) => propertyFilters,
            },
        ],

        experimentsQueryOverride: [
            null as DataTableNode | null,
            {
                setExperimentsQuery: (_, { query }) => query,
            },
        ],
    }),

    selectors({
        experimentsQuery: [
            (s) => [s.experimentsQueryOverride, s.defaultExperimentsQuery],
            (override, defQuery) => override || defQuery,
        ],
        defaultExperimentsQuery: [
            (s) => [
                s.dateFilter,
                s.shouldFilterTestAccounts,
                s.propertyFilters,
                groupsModel.selectors.groupsTaxonomicTypes,
            ],
            (dateFilter, shouldFilterTestAccounts, propertyFilters, groupsTaxonomicTypes): DataTableNode => ({
                kind: NodeKind.DataTableNode,
                source: {
                    kind: NodeKind.ExperimentsQuery,
                    dateRange: {
                        date_from: dateFilter.dateFrom || undefined,
                        date_to: dateFilter.dateTo || undefined,
                    },
                    filterTestAccounts: shouldFilterTestAccounts ?? false,
                    properties: propertyFilters,
                },
                columns: ['id', 'name', 'description', 'createdAt', 'public'],
                showDateRange: true,
                showReload: true,
                showSearch: true,
                showTestAccountFilters: true,
                showExport: true,
                showOpenEditorButton: false,
                showColumnConfigurator: false,
                showPropertyFilter: [
                    TaxonomicFilterGroupType.EventProperties,
                    TaxonomicFilterGroupType.PersonProperties,
                    ...groupsTaxonomicTypes,
                    TaxonomicFilterGroupType.Cohorts,
                ],
            }),
        ],
    }),

    afterMount(({ actions, values }) => {
        if (!values.dateFilter.dateFrom) {
            actions.setDates(INITIAL_DATE_FROM, INITIAL_DATE_TO)
        }
    }),
])
