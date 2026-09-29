/**
 * The two demos on the page: one job Jev is built for (sorting), one job an LLM is built for (writing).
 */

/** Jev's best job: put a message in the right box. */
export const SORT = {
  question: {
    mood: {
      type: 'choice',
      instructions: 'How does the person feel?',
      criteria: {
        happy: 'Glad, excited, or pleased',
        sad: 'Upset, disappointed, or hurt',
        angry: 'Mad or annoyed at someone',
      },
    },
  },
  examples: [
    'My ice cream fell on the floor 😢',
    'I got a puppy for my birthday!!!',
    'Stop taking my crayons without asking!',
  ],
};

/** An LLM's best job: write something new. */
export const WRITE = {
  examples: [
    'Write a 2-line poem about a puppy.',
    'Tell a 3-sentence bedtime story about a sleepy moon.',
    'Explain why the sky is blue to a 5-year-old.',
  ],
};
