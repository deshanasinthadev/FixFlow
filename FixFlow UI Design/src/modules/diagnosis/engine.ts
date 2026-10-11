/**
 * Rule-based diagnosis engine (§8).
 *
 * This is deliberately **not** AI. It is a keyword rule base over symptoms, and
 * the spec requires that a mocked or rule-based assistant never be presented as
 * a connected model. `DiagnosisResult.engine` says `rule-based` so the UI has to
 * label it truthfully, and the score is keyword coverage rather than a
 * statistical confidence — the previous screen showed a fabricated "86%
 * confidence" for a result that did not depend on the input at all.
 *
 * Pure functions, no I/O, so the whole thing is testable.
 */

export interface DiagnosisRule {
  id: string
  /** Lowercase terms. Any one of them can match. */
  keywords: string[]
  /** Restrict to these device categories; empty means any device. */
  deviceCategories?: string[]
  title: string
  explanation: string
  inspectionSteps: string[]
  /** 1-10. Common failures rank above rare ones when evidence is equal. */
  weight: number
}

export interface DiagnosisMatch {
  ruleId: string
  title: string
  explanation: string
  inspectionSteps: string[]
  /**
   * 0-1. Derived from how many of the rule's keywords appeared, scaled by the
   * rule's weight. It is a ranking signal, not a probability.
   */
  score: number
  matchedKeywords: string[]
}

export interface DiagnosisInput {
  complaint: string
  observations?: string
  deviceCategory?: string
}

export interface DiagnosisResult {
  engine: 'rule-based'
  matches: DiagnosisMatch[]
  /** Terms in the input no rule recognised — useful, and honest. */
  unmatchedTerms: string[]
  noMatch: boolean
}

export const DIAGNOSIS_RULES: DiagnosisRule[] = [
  {
    id: 'thermal',
    keywords: ['hot', 'heat', 'overheat', 'overheats', 'burning', 'thermal', 'fan noise', 'loud fan'],
    title: 'Thermal system degradation',
    explanation:
      'Dust build-up or dried thermal compound is restricting heat transfer, so the device throttles or shuts down to protect itself.',
    inspectionSteps: [
      'Run a CPU thermal stress test and record the peak temperature',
      'Inspect the heatsink fins for dust obstruction',
      'Check fan RPM and listen for bearing noise',
      'Inspect and replace the thermal compound',
    ],
    weight: 9,
  },
  {
    id: 'power-shutdown',
    keywords: ['shuts down', 'shutdown', 'turns off', 'powers off', 'dies', 'restarts', 'random restart'],
    title: 'Unexpected power loss',
    explanation:
      'The device is losing power under load. The usual causes are a failing battery, a loose power connector, or thermal protection tripping.',
    inspectionSteps: [
      'Test on mains power with the battery disconnected',
      'Check the battery health report and cycle count',
      'Inspect the DC jack and internal power connector for movement',
      'Monitor for a thermal shutdown under sustained load',
    ],
    weight: 8,
  },
  {
    id: 'battery',
    keywords: ['battery', 'charge', 'charging', 'drains', 'drain', 'dies quickly', 'not holding'],
    title: 'Battery capacity loss',
    explanation:
      'The battery is no longer holding a usable charge, or the charging circuit is not delivering current to it.',
    inspectionSteps: [
      'Read the battery health and cycle count',
      'Test with a known-good charger and cable',
      'Measure charge current into the battery',
      'Inspect the battery for swelling before any further work',
    ],
    weight: 8,
  },
  {
    id: 'display',
    keywords: ['screen', 'display', 'flicker', 'flickers', 'lines', 'black screen', 'blank', 'cracked', 'dead pixels'],
    title: 'Display or display path fault',
    explanation:
      'The fault is in the panel itself, the panel cable, or the graphics output driving it.',
    inspectionSteps: [
      'Connect an external display to separate panel from GPU faults',
      'Flex the lid and watch for flicker, which points at the cable',
      'Inspect the panel connector seating',
      'Check for backlight bleed versus a dead panel',
    ],
    weight: 7,
  },
  {
    id: 'charging-port',
    keywords: ['port', 'loose', 'wobbly', 'only charges at angle', 'usb-c', 'charging port'],
    title: 'Charging port damage',
    explanation:
      'The connector is worn or the solder joints have cracked, so charge only makes contact at certain angles.',
    inspectionSteps: [
      'Inspect the port for bent or missing pins',
      'Test with a different cable and a different orientation',
      'Check the port solder joints under magnification',
      'Confirm the fault is not the cable before replacing the port',
    ],
    weight: 6,
  },
  {
    id: 'liquid',
    keywords: ['water', 'liquid', 'spill', 'spilled', 'coffee', 'rain', 'wet', 'corrosion'],
    title: 'Liquid ingress',
    explanation:
      'Liquid damage corrodes over time, so a device that works now can fail later. Treat it as urgent and do not apply power until inspected.',
    inspectionSteps: [
      'Do not power on until the board has been inspected',
      'Open the device and inspect for residue and corrosion',
      'Check the liquid contact indicators',
      'Clean affected areas with isopropyl alcohol and re-test',
    ],
    weight: 10,
  },
  {
    id: 'storage',
    keywords: ['slow', 'freezes', 'hanging', 'spin', 'clicking', 'no boot', 'boot', 'blue screen', 'bsod'],
    title: 'Storage or boot failure',
    explanation:
      'The drive is failing, or the operating system cannot complete its boot sequence.',
    inspectionSteps: [
      'Read the drive SMART attributes',
      'Boot from external media to separate drive from OS faults',
      'Check the boot order and boot record',
      'Back up user data before any repair work begins',
    ],
    weight: 7,
  },
  {
    id: 'keyboard',
    keywords: ['keyboard', 'keys', 'key', 'typing', 'stuck key', 'not typing'],
    title: 'Keyboard fault',
    explanation:
      'Individual keys, a whole region, or the controller has failed — often after liquid exposure or debris ingress.',
    inspectionSteps: [
      'Map which keys fail using a key-test utility',
      'Check whether a whole row or column is dead, which indicates a trace fault',
      'Inspect under the keys for debris or residue',
      'Test with an external keyboard to rule out software',
    ],
    weight: 5,
  },
  {
    id: 'wifi',
    keywords: ['wifi', 'wi-fi', 'wireless', 'internet', 'network', 'disconnects', 'no signal'],
    title: 'Wireless connectivity fault',
    explanation:
      'The wireless adapter, its antenna cables, or its driver is at fault.',
    inspectionSteps: [
      'Confirm other devices work on the same network',
      'Check the adapter is detected and its driver is current',
      'Inspect the antenna cable connections at the card',
      'Test with a USB adapter to isolate the card',
    ],
    weight: 5,
  },
  {
    id: 'hinge',
    keywords: ['hinge', 'lid', 'wobbly', 'loose lid', 'crack', 'chassis'],
    title: 'Hinge or chassis damage',
    explanation:
      'The hinge mounts have failed. Left alone this tears the display cable and the lid itself.',
    inspectionSteps: [
      'Assess how far the hinge mounts have pulled out of the chassis',
      'Check the display cable for stress at the hinge point',
      'Quote chassis or lid replacement if the mounts are gone',
      'Advise the customer on handling until repaired',
    ],
    weight: 6,
  },
  {
    id: 'audio',
    keywords: ['sound', 'audio', 'speaker', 'no sound', 'distorted', 'crackling'],
    title: 'Audio fault',
    explanation:
      'The speaker, the audio codec, or the output setting is at fault.',
    inspectionSteps: [
      'Test with headphones to separate speaker from codec',
      'Check the output device and mute state in software',
      'Inspect the speaker for debris or a torn cone',
      'Verify the audio driver is loaded',
    ],
    weight: 4,
  },
  {
    id: 'software',
    keywords: ['virus', 'malware', 'popup', 'popups', 'adware', 'browser', 'update', 'driver', 'slow after'],
    title: 'Software or malware',
    explanation:
      'The hardware may be sound. Rule this out before quoting parts.',
    inspectionSteps: [
      'Run a full malware scan',
      'Check startup programs and browser extensions',
      'Review recent software or driver changes',
      'Confirm the fault persists in safe mode',
    ],
    weight: 4,
  },
]

/** Splits free text into comparable lowercase terms. */
export const tokenize = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/[^a-z0-9-]+/)
    .map((t) => t.trim())
    // Hyphens are kept inside terms ("wi-fi") but a run of them on its own is
    // punctuation, not a word.
    .filter((t) => t && !/^-+$/.test(t))

/**
 * Ranks the rule base against the reported symptoms.
 *
 * A rule scores on the fraction of its keywords that appear, scaled by its
 * weight, so a rule matched on several terms outranks one matched on a single
 * incidental word. Rules are returned only when at least one keyword matched —
 * the engine does not guess.
 */
export const suggestDiagnosis = (input: DiagnosisInput): DiagnosisResult => {
  const haystack = `${input.complaint} ${input.observations ?? ''}`.toLowerCase()
  const category = (input.deviceCategory ?? '').toLowerCase()
  const terms = tokenize(haystack)

  const matches: DiagnosisMatch[] = []
  const matchedTerms = new Set<string>()

  for (const rule of DIAGNOSIS_RULES) {
    if (
      rule.deviceCategories?.length &&
      category &&
      !rule.deviceCategories.includes(category)
    ) {
      continue
    }

    const hit = rule.keywords.filter((keyword) => haystack.includes(keyword))
    if (!hit.length) continue

    hit.forEach((keyword) => {
      tokenize(keyword).forEach((t) => matchedTerms.add(t))
    })

    // Coverage rewards a rule whose evidence is broad; weight breaks ties
    // between equally-supported rules by how commonly they occur.
    const coverage = hit.length / rule.keywords.length
    const score = Math.min(1, coverage * (rule.weight / 10))

    matches.push({
      ruleId: rule.id,
      title: rule.title,
      explanation: rule.explanation,
      inspectionSteps: rule.inspectionSteps,
      score,
      matchedKeywords: hit,
    })
  }

  matches.sort((a, b) => b.score - a.score)

  const unmatchedTerms = terms.filter((t) => !matchedTerms.has(t) && t.length > 3)

  return {
    engine: 'rule-based',
    matches,
    unmatchedTerms,
    noMatch: matches.length === 0,
  }
}

/**
 * Every inspection step across the matched rules, deduplicated and in rank
 * order, so a technician gets one ordered plan rather than four overlapping
 * lists.
 */
export const inspectionPlan = (result: DiagnosisResult): string[] => {
  const seen = new Set<string>()
  const steps: string[] = []
  for (const match of result.matches) {
    for (const step of match.inspectionSteps) {
      if (!seen.has(step)) {
        seen.add(step)
        steps.push(step)
      }
    }
  }
  return steps
}
