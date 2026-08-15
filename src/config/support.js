/**
 * How a member reaches a human.
 *
 * WYN has no support inbox and no ticket system, so the honest answer is a
 * WhatsApp thread — the normal way to reach anyone in Qatar, and it costs
 * nothing to run. Anywhere the app tells someone to "contact support" has
 * to link here; a promise of support with nowhere to go is worse than no
 * promise at all.
 */

export const SUPPORT_WHATSAPP = '+974 5518 2858'

/** wa.me wants digits only — no +, spaces or dashes. */
const digits = SUPPORT_WHATSAPP.replace(/\D/g, '')

/**
 * A prefilled message carrying who is writing. The id fragment is short
 * enough to read out but long enough to find the account with, so nobody
 * has to be asked "which account?" as the opening move.
 */
export function supportLink(member, topic = '') {
  const who = member
    ? `${member.name} (${String(member.id).slice(0, 8)})`
    : 'Not signed in'
  const text = [`Hi WYN — I need help.`, topic, '', who].filter(Boolean).join('\n')
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
}

/** The one case we know sends people to support: a gender set by mistake. */
export const GENDER_TOPIC = 'My gender was set incorrectly when I joined.'
