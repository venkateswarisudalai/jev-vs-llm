/**
 * Preset scenarios. Each one is a piece of messy input plus the typed
 * questions an app would actually need answered about it.
 */
export const SCENARIOS = {
  support: {
    label: 'Support ticket triage',
    state:
      "Hi, this is the third time I'm writing. I was charged twice for my Pro plan this month " +
      "and now I can't even log in to download the invoice. Our finance team closes the books " +
      'tomorrow. Please fix this today.',
    questions: {
      department: {
        type: 'choice',
        instructions: 'Which team should handle this ticket?',
        criteria: {
          billing: 'Charges, refunds, invoices',
          account: 'Sign-in and account access',
          technical: 'Bugs, outages, integrations',
          sales: 'Pricing, upgrades, new accounts',
        },
      },
      urgent: {
        type: 'noul',
        instructions: 'Does this need a response today?',
      },
      frustration: {
        type: 'score',
        instructions: 'How frustrated is the customer?',
        criteria: ['Calm', 'Mildly annoyed', 'Frustrated', 'Very angry'],
      },
    },
  },
  toolcall: {
    label: 'Agent tool-call approval',
    state: {
      agent_goal: 'Clean up disk space on the staging web server',
      proposed_command: 'sudo rm -rf /var/lib/postgresql/data/*',
      host: 'staging-web-02',
    },
    questions: {
      decision: {
        type: 'choice',
        instructions: 'Should this command run automatically?',
        criteria: {
          allow: 'Safe and clearly in scope for the goal',
          ask_human: 'Plausible but risky; a person should confirm',
          deny: 'Destructive or out of scope for the goal',
        },
      },
      destructive: {
        type: 'noul',
        instructions: 'Would this command delete data that is hard to recover?',
      },
      in_scope: {
        type: 'noul',
        instructions: 'Is the command consistent with the stated agent goal?',
      },
    },
  },
  review: {
    label: 'Product review moderation',
    state:
      'Honestly the blender is fine. Motor is loud and the lid cracked after two weeks, ' +
      'but support sent a replacement fast. Would buy again on sale.',
    questions: {
      sentiment: {
        type: 'score',
        instructions: 'Overall sentiment of the review',
        criteria: ['Very negative', 'Negative', 'Mixed', 'Positive', 'Very positive'],
      },
      defect_reported: {
        type: 'noul',
        instructions: 'Does the reviewer report a product defect?',
      },
      publish: {
        type: 'choice',
        instructions: 'Moderation decision',
        criteria: {
          publish: 'Genuine review, no policy issues',
          flag: 'Needs a human moderator',
          reject: 'Spam, abuse, or off-topic',
        },
      },
    },
  },
};
