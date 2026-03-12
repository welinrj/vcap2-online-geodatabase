import { useState, type FC } from 'react'
import type { FeatureCollection } from 'geojson'

interface AttributeTableProps {
  data: FeatureCollection
  properties: string[]
}

const PAGE_SIZE = 20

const AttributeTable: FC<AttributeTableProps> = ({ data, properties }) => {
  const [page, setPage] = useState(0)
  const [sortField, setSortField] = useState<string | null>(null)
  const [sortAsc, setSortAsc] = useState(true)

  const features = [...data.features]

  if (sortField) {
    features.sort((a, b) => {
      const aVal = a.properties?.[sortField] ?? ''
      const bVal = b.properties?.[sortField] ?? ''
      const cmp = String(aVal).localeCompare(String(bVal), undefined, { numeric: true })
      return sortAsc ? cmp : -cmp
    })
  }

  const totalPages = Math.max(1, Math.ceil(features.length / PAGE_SIZE))
  const pageFeatures = features.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  function handleSort(field: string) {
    if (sortField === field) {
      setSortAsc(!sortAsc)
    } else {
      setSortField(field)
      setSortAsc(true)
    }
    setPage(0)
  }

  return (
    <div className="attribute-table-container">
      <div className="attribute-table-header">
        <h3>Attribute Table</h3>
        <span className="feature-count">
          {data.features.length} feature{data.features.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div className="attribute-table-scroll">
        <table className="data-table attribute-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Geometry</th>
              {properties.map((prop) => (
                <th key={prop} className="sortable-header">
                  <button
                    type="button"
                    className="sort-button"
                    onClick={() => handleSort(prop)}
                    aria-label={`Sort by ${prop}`}
                  >
                    {prop}
                    {sortField === prop && (
                      <span className="sort-indicator" aria-hidden="true">
                        {sortAsc ? ' \u25B2' : ' \u25BC'}
                      </span>
                    )}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageFeatures.map((feature, i) => (
              <tr key={page * PAGE_SIZE + i}>
                <td>{page * PAGE_SIZE + i + 1}</td>
                <td>
                  <span className="badge badge-format">
                    {feature.geometry?.type ?? 'null'}
                  </span>
                </td>
                {properties.map((prop) => (
                  <td key={prop}>
                    {feature.properties?.[prop] != null
                      ? String(feature.properties[prop])
                      : ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="pagination">
          <button
            className="btn btn-sm"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </button>
          <span>
            Page {page + 1} of {totalPages}
          </span>
          <button
            className="btn btn-sm"
            disabled={page >= totalPages - 1}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}

export default AttributeTable
