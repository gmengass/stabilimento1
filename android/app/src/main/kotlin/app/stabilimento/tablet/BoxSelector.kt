package app.stabilimento.tablet

/** Answers whether the box answers on an origin. */
fun interface Probe {
    fun isUp(origin: Origin): Boolean
}

/**
 * Picks the box address to load (ADR 0011): the first candidate whose probe answers, kept until
 * a load fails. Not thread-safe: call it from one thread only.
 */
class BoxSelector(private val candidates: List<Origin>, private val probe: Probe) {
    var current: Origin? = null
        private set

    /** The kept address, or the first candidate that answers now; null if none does. */
    fun select(): Origin? {
        current?.let { return it }
        current = candidates.firstOrNull(::answers)
        return current
    }

    /** Forgets the kept address, so the next [select] probes again from the first candidate. */
    fun onLoadFailed() {
        current = null
    }

    private fun answers(origin: Origin): Boolean =
        try {
            probe.isUp(origin)
        } catch (e: Exception) {
            false
        }
}
