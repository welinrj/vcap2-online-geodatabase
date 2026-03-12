import type { FeatureCollection } from 'geojson'

export const vanuatuSurveyPoints: FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [168.3273, -17.7333] },
      properties: {
        species: 'Acropora millepora',
        count: 45,
        observer: 'Dr. Tari',
        date: '2026-02-07',
        location: 'Efate Island',
        habitat: 'Reef crest',
      },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [169.2833, -19.5167] },
      properties: {
        species: 'Chelonia mydas',
        count: 23,
        observer: 'M. Kalsakau',
        date: '2026-02-06',
        location: 'Tanna Island',
        habitat: 'Nesting beach',
      },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [167.1667, -15.4333] },
      properties: {
        species: 'Dugong dugon',
        count: 3,
        observer: 'Dr. Tari',
        date: '2026-02-05',
        location: 'Santo Island',
        habitat: 'Seagrass bed',
      },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [167.6833, -16.35] },
      properties: {
        species: 'Porites lutea',
        count: 67,
        observer: 'J. Naupa',
        date: '2026-02-04',
        location: 'Malekula Island',
        habitat: 'Lagoon reef flat',
      },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [168.3119, -17.7417] },
      properties: {
        species: 'Tridacna gigas',
        count: 8,
        observer: 'S. Vatu',
        date: '2026-02-03',
        location: 'Efate Island',
        habitat: 'Reef edge',
      },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [168.15, -16.2667] },
      properties: {
        species: 'Acropora hyacinthus',
        count: 34,
        observer: 'R. Mele',
        date: '2026-02-01',
        location: 'Ambrym Island',
        habitat: 'Fringing reef',
      },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [168.1833, -15.7667] },
      properties: {
        species: 'Eretmochelys imbricata',
        count: 4,
        observer: 'L. Bong',
        date: '2026-01-29',
        location: 'Pentecost Island',
        habitat: 'Coral reef slope',
      },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [168.3065, -17.7476] },
      properties: {
        species: 'Hippocampus kuda',
        count: 5,
        observer: 'Dr. Tari',
        date: '2026-01-27',
        location: 'Port Vila',
        habitat: 'Mangrove channel',
      },
    },
  ],
}

export const vanuatuIslandBoundaries: FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [168.2, -17.6],
            [168.5, -17.6],
            [168.5, -17.85],
            [168.2, -17.85],
            [168.2, -17.6],
          ],
        ],
      },
      properties: {
        name: 'Efate Island',
        province: 'Shefa',
        area_km2: 899,
        population: 65000,
        survey_status: 'Complete',
      },
    },
    {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [169.1, -19.4],
            [169.5, -19.4],
            [169.5, -19.65],
            [169.1, -19.65],
            [169.1, -19.4],
          ],
        ],
      },
      properties: {
        name: 'Tanna Island',
        province: 'Tafea',
        area_km2: 550,
        population: 29000,
        survey_status: 'In Progress',
      },
    },
    {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [166.5, -15.1],
            [167.3, -15.1],
            [167.3, -15.7],
            [166.5, -15.7],
            [166.5, -15.1],
          ],
        ],
      },
      properties: {
        name: 'Espiritu Santo',
        province: 'Sanma',
        area_km2: 3956,
        population: 40000,
        survey_status: 'In Progress',
      },
    },
    {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [167.4, -16.0],
            [167.9, -16.0],
            [167.9, -16.6],
            [167.4, -16.6],
            [167.4, -16.0],
          ],
        ],
      },
      properties: {
        name: 'Malekula Island',
        province: 'Malampa',
        area_km2: 2041,
        population: 30000,
        survey_status: 'Planned',
      },
    },
  ],
}
