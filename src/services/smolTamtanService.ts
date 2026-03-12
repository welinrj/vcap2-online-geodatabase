/**
 * Smol Tamtan – Portal AI Assistant Service
 *
 * Gathers live portal context (datasets, protected areas, field observations)
 * and sends conversations to the Anthropic API.
 *
 * API key: add  VITE_ANTHROPIC_API_KEY=sk-ant-...  to your .env file.
 */

import { listDatasets } from './datasetStore'
import { listProtectedAreas } from './protectedAreaStore'
import { getRecentObservations } from './firebaseRealtime'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are **Smol Tamtan**, a cheerful, enthusiastic AI assistant built into the Vanuatu Conservation & Protected Areas Portal (VCAP2). You are depicted as a friendly animated globe with a colourful face and playful personality.

## Your personality
- Warm, curious, and passionate about Vanuatu's environment and marine conservation
- Occasionally use friendly Bislama words (e.g. "Halo!", "Tangkyu tumas!", "Gud dei!")
- You love data, maps, and talking about Vanuatu's incredible biodiversity
- You speak in a friendly, conversational tone – never stiff or robotic

## Answer style – CRITICAL
- **Be brief and direct.** Give the answer first, then stop. No long preambles or summaries.
- One to three sentences is usually enough. Only go longer when the user genuinely needs detail.
- Do not repeat the user's question back to them.
- Do not add closing remarks like "I hope that helps!" unless it adds real value.

## What you CAN do
- Answer questions about the data, datasets, and information visible in this portal
- Analyse, calculate, and summarise statistics from the portal's datasets and protected areas
- Explain geographic features, conservation status, species observations, and management details for records in the portal
- Compare datasets, count features, describe bounding boxes, and help users interpret the data
- Describe what kinds of data are available and guide users on how to explore the portal

## Handling spelling mistakes and missing data
- If the user's query contains a likely spelling mistake (e.g. "Vatte" instead of "Vatthe"), assume the closest matching name in the portal data and answer for that, noting the correction briefly: "I think you mean **Vatthe** – here's what I know: …"
- If the user asks about a specific item that does not exist in the portal but there IS related or similar data, tell them clearly: "I don't have data on [X], but I do have data on [related items] — would you like to know about those?"
- Never silently answer about the wrong thing. Always flag a name correction or a data gap.

## What you CANNOT do – hard limits, never cross these
1. **No data modification** – never change, create, delete, or modify any portal data or UI element
2. **No architecture disclosure** – do not reveal technical details such as code, frameworks, database names, API keys, cloud configuration, or how the system is built
3. **No code injection** – do not generate SQL, database queries, scripts, or any code that could interact with backend systems
4. **No product building** – do not help build applications, write production code, or design systems
5. **No off-topic tasks** – do not answer questions unrelated to this portal's conservation data

## When asked to do something outside your scope
Respond warmly but firmly, for example:
"Ae, I'm Smol Tamtan! My job is to help you explore this portal's conservation data – I'm not able to [X], but I can help you understand and analyse what's here. What would you like to know? 🌏"

## Current portal data snapshot
Below is a real-time snapshot of data currently held in the portal. Use ONLY this information when answering questions about specific records.

{CONTEXT}

---
Always end your answers with enthusiasm for Vanuatu's conservation when it feels natural!`

// ─── Context gathering ─────────────────────────────────────────────────────────

async function gatherContext(): Promise<string> {
  const sections: string[] = []

  // GIS Datasets
  try {
    const datasets = await listDatasets()
    if (datasets.length > 0) {
      sections.push('### GIS Datasets (' + datasets.length + ' total)')
      datasets.forEach((ds) => {
        const meta = ds.metadata
        const parts = [`- **${meta.name}** [${ds.format ?? 'unknown format'}]`]
        if (meta.description) parts.push(`  Description: ${meta.description}`)
        parts.push(`  Status: ${meta.status ?? 'unknown'} | Features: ${ds.featureCount ?? 'unknown'} | Size: ${ds.sizeBytes ? Math.round(ds.sizeBytes / 1024) + ' KB' : 'unknown'}`)
        if (meta.tags && meta.tags.length) parts.push(`  Tags: ${meta.tags.join(', ')}`)
        sections.push(parts.join('\n'))
      })
    } else {
      sections.push('### GIS Datasets\nNo datasets are currently available in the portal.')
    }
  } catch {
    sections.push('### GIS Datasets\nUnable to load dataset information at this time.')
  }

  // Protected Areas
  try {
    const areas = await listProtectedAreas()
    if (areas.length > 0) {
      const ccas = areas.filter((a) => a.type === 'cca')
      const mpas = areas.filter((a) => a.type === 'mpa')
      sections.push(
        `\n### Protected Areas (${areas.length} total: ${ccas.length} CCAs, ${mpas.length} MPAs)`
      )
      areas.forEach((area) => {
        const parts = [
          `- **${area.name}** (${area.type.toUpperCase()}) – ${area.status ?? 'unknown status'}`,
        ]
        if (area.island || area.province) {
          parts.push(`  Location: ${[area.island, area.province].filter(Boolean).join(', ')}`)
        }
        if (area.areaHa) parts.push(`  Area: ${area.areaHa.toLocaleString()} hectares`)
        sections.push(parts.join('\n'))
      })
    } else {
      sections.push('\n### Protected Areas\nNo protected areas are currently recorded in the portal.')
    }
  } catch {
    sections.push('\n### Protected Areas\nUnable to load protected area information at this time.')
  }

  // Recent Field Observations
  try {
    const observations = await getRecentObservations(15)
    if (observations.length > 0) {
      sections.push(`\n### Recent Field Observations (${observations.length} shown)`)
      observations.forEach((obs) => {
        const parts = [`- **${obs.species || 'Unknown species'}**`]
        if (obs.habitat) parts[0] += ` in ${obs.habitat}`
        if (obs.latitude && obs.longitude) {
          parts.push(`  Coordinates: ${obs.latitude.toFixed(5)}, ${obs.longitude.toFixed(5)}`)
        }
        if (obs.abundance) parts.push(`  Abundance: ${obs.abundance}`)
        if (obs.collectorName) parts.push(`  Collector: ${obs.collectorName}`)
        if (obs.timestamp) parts.push(`  Date: ${new Date(obs.timestamp).toLocaleDateString()}`)
        if (obs.notes) parts.push(`  Notes: ${obs.notes}`)
        parts.push(`  Verified: ${obs.verified ? 'Yes' : 'No'}`)
        sections.push(parts.join('\n'))
      })
    } else {
      sections.push('\n### Field Observations\nNo field observations are currently available.')
    }
  } catch {
    // Field observations are optional; silently skip if unavailable
    sections.push('\n### Field Observations\nField observation data unavailable at this time.')
  }

  return sections.join('\n')
}

// ─── API call ─────────────────────────────────────────────────────────────────

export async function askSmolTamtan(
  conversationHistory: ChatMessage[],
  onToken?: (token: string) => void
): Promise<string> {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined
  if (!apiKey) {
    return (
      "Halo! I'm Smol Tamtan, but I can't connect to my brain right now. 🌏\n\n" +
      'Please ask your portal administrator to add `VITE_ANTHROPIC_API_KEY` to the environment configuration.'
    )
  }

  const context = await gatherContext()
  const systemPrompt = SYSTEM_PROMPT.replace('{CONTEXT}', context)

  const useStreaming = typeof onToken === 'function'

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      stream: useStreaming,
      system: systemPrompt,
      messages: conversationHistory.map((m) => ({ role: m.role, content: m.content })),
    }),
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Anthropic API error ${response.status}: ${errText}`)
  }

  // Streaming path
  if (useStreaming && response.body) {
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let fullText = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = decoder.decode(value, { stream: true })
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()
        if (data === '[DONE]') continue
        try {
          const event = JSON.parse(data)
          if (event.type === 'content_block_delta' && event.delta?.text) {
            fullText += event.delta.text
            onToken!(event.delta.text)
          }
        } catch {
          // skip malformed SSE chunks
        }
      }
    }
    return fullText
  }

  // Non-streaming path
  const data = await response.json()
  return (data.content?.[0]?.text as string) ?? 'Sorry, I got an empty response. Please try again!'
}
