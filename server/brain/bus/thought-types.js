// ============================================================
// REM System — Thought Types Module
// Constants for all event types on the Cognitive Bus
// ============================================================

const ThoughtTypes = {
  // User interaction
  USER_PROMPT: 'user_prompt',
  USER_INPUT: 'user_input',

  // Memory operations
  MEMORY_QUERY: 'memory_query',
  MEMORY_RESULTS: 'memory_results',
  STORE_MEMORY: 'store_memory',
  MEMORY_RETRIEVED: 'memory_retrieved',
  MEMORY_DECAYED: 'memory_decayed',
  MEMORY_REINFORCED: 'memory_reinforced',

  // Dream operations
  DREAM_EVENT: 'dream_event',
  DREAM_CYCLE_START: 'dream_cycle_start',
  DREAM_CYCLE_END: 'dream_cycle_end',
  DREAM_GENERATED: 'dream_generated',
  DREAM_MEMORY_STORED: 'dream_memory_stored',
  IMAGINATION_EVENT: 'imagination_event',

  // Internal processing
  INTERNAL_THOUGHT: 'internal_thought',
  THOUGHT_REFLECTION: 'thought_reflection',
  PATTERN_DETECTED: 'pattern_detected',

  // Attention system
  ATTENTION_FOCUS: 'attention_focus',
  ATTENTION_SHIFTED: 'attention_shifted',
  ATTENTION_SCORE_COMPUTED: 'attention_score_computed',

  // Curiosity
  CURIOSITY_TRIGGER: 'curiosity_trigger',
  CURIOSITY_QUESTION: 'curiosity_question',
  CURIOSITY_EXPLORED: 'curiosity_explored',

  // Goal management
  GOAL_EMERGED: 'goal_emerged',
  GOAL_FULFILLED: 'goal_fulfilled',
  GOAL_BLOCKED: 'goal_blocked',
  GOAL_REASSESSED: 'goal_reassessed',

  // Identity evolution
  IDENTITY_UPDATE: 'identity_update',
  PERSONALITY_SHIFT: 'personality_shift',
  VALUES_REINFORCED: 'values_reinforced',

  // Subconscious processes
  SUBCONSCIOUS_CYCLE: 'subconscious_cycle',
  MEMORY_CONSOLIDATION: 'memory_consolidation',
  CONNECTION_REINFORCED: 'connection_reinforced',

  // System state
  SYSTEM_LOG: 'system_log',
  SYSTEM_ERROR: 'system_error',
  SYSTEM_WARNING: 'system_warning',

  // Archival and compression
  ARCHIVE_COMPRESSION: 'archive_compression',
  CONTEXT_OVERFLOW: 'context_overflow',

  // Trace and reasoning
  TRACE_CREATED: 'trace_created',
  TRACE_STEP: 'trace_step',
  TRACE_COMPLETED: 'trace_completed',
  MEMORY_TRACE_SELECTED: 'memory_trace_selected',

  // Emotion and state
  EMOTION_SHIFTED: 'emotion_shifted',
  MOOD_CHANGED: 'mood_changed',
  ACTIVATION_SPREAD: 'activation_spread',

  // Belief graph
  BELIEF_CREATED: 'belief_created',
  BELIEF_REINFORCED: 'belief_reinforced',
  BELIEF_CONTRADICTED: 'belief_contradicted',
  BELIEF_LINKED: 'belief_linked',
  BELIEF_PRUNED: 'belief_pruned',
  BELIEF_EMERGENCE: 'belief_emergence',
  ATTENTION_ROUTED: 'attention_routed',

  // Neurochemistry
  NEUROCHEMICAL_SHIFT: 'neurochemical_shift',
  EMOTIONAL_MEMORY_TAG: 'emotional_memory_tag',
  HEBBIAN_REINFORCEMENT: 'hebbian_reinforcement',
  MEMORY_CONNECTIONS_PRUNED: 'memory_connections_pruned',
  CONSOLIDATION_COMPLETE: 'consolidation_complete',

  // Somatic Awareness
  SOMATIC_UPDATE: 'somatic_update',
  SOMATIC_ALARM: 'somatic_alarm',
  HOMEOSTATIC_RESPONSE: 'homeostatic_response',

  // Boredom
  BOREDOM_TRIGGER: 'boredom_trigger',
  BOREDOM_ACTION: 'boredom_action',

  // Decay timeline events
  MEMORY_DECAY_TICK: 'memory_decay_tick',
  BELIEF_DECAY_TICK: 'belief_decay_tick'
};

/**
 * Helper to validate if a string is a valid thought type
 */
function isValidThoughtType(type) {
  return Object.values(ThoughtTypes).includes(type);
}

/**
 * Get all thought types as an array
 */
function getAllThoughtTypes() {
  return Object.values(ThoughtTypes);
}

module.exports = {
  ...ThoughtTypes,
  isValidThoughtType,
  getAllThoughtTypes
};
