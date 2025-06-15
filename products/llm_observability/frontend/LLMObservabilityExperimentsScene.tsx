import { useActions, useValues } from 'kea'
import { TZLabel } from 'lib/components/TZLabel'

import { DataTable } from '~/queries/nodes/DataTable/DataTable'
import { LLMExperiment } from '~/queries/schema/schema-general'
import { QueryContextColumnComponent } from '~/queries/types'
import { isExperimentsQuery } from '~/queries/utils'

import { llmObservabilityExperimentsLogic } from './llmObservabilityExperimentsLogic'

export function LLMObservabilityExperiments(): JSX.Element {
    const { setDates, setShouldFilterTestAccounts, setPropertyFilters, setExperimentsQuery } = useActions(
        llmObservabilityExperimentsLogic
    )
    const { experimentsQuery } = useValues(llmObservabilityExperimentsLogic)

    return (
        <DataTable
            query={experimentsQuery}
            setQuery={(query) => {
                if (!isExperimentsQuery(query.source)) {
                    throw new Error('Invalid query')
                }
                setDates(query.source.dateRange?.date_from || null, query.source.dateRange?.date_to || null)
                setShouldFilterTestAccounts(query.source.filterTestAccounts || false)
                setPropertyFilters(query.source.properties || [])
                setExperimentsQuery(query)
            }}
            context={{
                emptyStateHeading: 'There were no experiments in this period',
                emptyStateDetail: 'Try changing the date range or filters.',
                columns: {
                    id: {
                        title: 'ID',
                        render: IDColumn,
                    },
                    name: {
                        title: 'Name',
                        render: NameColumn,
                    },
                    description: {
                        title: 'Description',
                        render: DescriptionColumn,
                    },
                    createdAt: {
                        title: 'Created',
                        render: CreatedAtColumn,
                    },
                    public: {
                        title: 'Public',
                        render: PublicColumn,
                    },
                },
            }}
            uniqueKey="llm-observability-experiments"
        />
    )
}

const IDColumn: QueryContextColumnComponent = ({ record }) => {
    const row = record as LLMExperiment
    return (
        <strong className="ph-no-capture">
            {row.id.slice(0, 8)}...{row.id.slice(-8)}
        </strong>
    )
}

const NameColumn: QueryContextColumnComponent = ({ record }) => {
    const row = record as LLMExperiment
    return <strong>{row.name || '–'}</strong>
}

const DescriptionColumn: QueryContextColumnComponent = ({ record }) => {
    const row = record as LLMExperiment
    return <span className="text-muted">{row.description || '–'}</span>
}

const CreatedAtColumn: QueryContextColumnComponent = ({ record }) => {
    const row = record as LLMExperiment
    return <TZLabel time={row.createdAt} />
}

const PublicColumn: QueryContextColumnComponent = ({ record }) => {
    const row = record as LLMExperiment
    return <span>{row.public ? 'Yes' : 'No'}</span>
}
