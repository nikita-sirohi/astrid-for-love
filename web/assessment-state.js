// A reset invalidates every outstanding request. Within a view operation, only
// its most recently issued request may publish results or clear busy indicators.
export class ViewRequests {
  #generation = 0;
  #sequence = new Map();
  begin(key) {
    const sequence = (this.#sequence.get(key) || 0) + 1;
    this.#sequence.set(key, sequence);
    return { key, sequence, generation: this.#generation };
  }
  current(ticket) {
    return ticket.generation === this.#generation && this.#sequence.get(ticket.key) === ticket.sequence;
  }
  reset() {
    this.#generation++;
    this.#sequence.clear();
  }
}

export function assessmentIsCurrent(assessment, actor, other) {
  const comparison = other?.comparison;
  return Boolean(assessment && actor && other && comparison && !actor.understandingPending && !comparison.pending
    && assessment.revisions?.[actor.id] === actor.revision
    && assessment.revisions?.[actor.id] === comparison.revisions?.[actor.id]
    && assessment.revisions?.[other.id] === comparison.revisions?.[other.id]);
}
