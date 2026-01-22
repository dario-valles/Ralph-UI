/**
 * Prompt Templates for Deep Questioning Phase
 *
 * These prompts help guide users to provide more concrete, specific answers
 * during the deep questioning phase of the GSD workflow.
 */

/** Probing questions to help users think more concretely */
export interface ProbingQuestion {
  /** The main question */
  question: string
  /** Examples of good concrete answers */
  examples: string[]
  /** Follow-up prompts if the answer is too vague */
  followUps: string[]
}

/** Probing questions for each context area */
export const PROBING_QUESTIONS: Record<'what' | 'why' | 'who' | 'done', ProbingQuestion[]> = {
  what: [
    {
      question: "Can you describe the main action or workflow a user would take?",
      examples: [
        "Users upload a CSV file, see a preview, map columns to fields, then import to database",
        "Developers paste a PR URL, AI analyzes the code, generates review comments with suggestions",
        "Managers select team members, assign tasks with deadlines, track progress on a Kanban board"
      ],
      followUps: [
        "What's the first thing a user does when they open the app?",
        "What happens after they complete that first action?",
        "Can you walk me through a complete session from start to finish?"
      ]
    },
    {
      question: "What existing tools or products is this similar to?",
      examples: [
        "Like Notion's database feature, but focused specifically on project timelines",
        "Similar to GitHub Copilot, but for writing documentation instead of code",
        "Combines Trello's task management with Slack's communication features"
      ],
      followUps: [
        "What would you keep from that tool?",
        "What would you do differently?",
        "What feature is missing from existing tools that you want to add?"
      ]
    },
    {
      question: "What are the 3-5 core features that must exist for v1?",
      examples: [
        "1. User authentication, 2. Create/edit documents, 3. Share via link, 4. Basic search",
        "1. Connect to GitHub, 2. Analyze PR diffs, 3. Generate comments, 4. Post to PR",
        "1. Import data from CSV, 2. Visualize as chart, 3. Export to PDF"
      ],
      followUps: [
        "If you could only ship ONE of those features, which would it be?",
        "What would users complain about most if that feature was missing?",
        "Which feature is technically riskiest?"
      ]
    }
  ],
  why: [
    {
      question: "What problem does the user have RIGHT NOW that this solves?",
      examples: [
        "Developers waste 2+ hours per week manually reviewing PRs for style issues",
        "Product managers lose context when switching between 5+ different tools",
        "Small business owners can't afford enterprise CRM but need contact tracking"
      ],
      followUps: [
        "How are they solving this problem today?",
        "What's broken or frustrating about their current solution?",
        "How much time/money does this problem cost them?"
      ]
    },
    {
      question: "What triggered you to want to build this?",
      examples: [
        "I spent 3 hours doing manual data entry and thought 'this should be automated'",
        "A client asked for this feature repeatedly and I realized it was a common need",
        "I tried 10 existing tools and none of them handled my specific use case"
      ],
      followUps: [
        "What specific moment made you decide to build it?",
        "Did someone ask you to build this, or is it for yourself?",
        "What will change in your life/work once this exists?"
      ]
    },
    {
      question: "Why hasn't this been built already? Or if it has, why build another one?",
      examples: [
        "Existing tools are too expensive for indie developers ($300+/mo)",
        "Current solutions require technical expertise that my users don't have",
        "Nobody has combined X and Y into a single workflow yet"
      ],
      followUps: [
        "What's your unfair advantage in building this?",
        "What do you understand about the problem that others don't?",
        "Why will users switch from their current solution to yours?"
      ]
    }
  ],
  who: [
    {
      question: "Can you describe a specific person who would use this?",
      examples: [
        "Sarah, a 28-year-old startup PM who juggles 15 projects and uses Notion, Slack, and Jira daily",
        "Mike, a solo developer who maintains 5 open source projects and reviews 20+ PRs weekly",
        "Lisa, a freelance designer who needs to send proposals to 10+ clients per month"
      ],
      followUps: [
        "What's their job title?",
        "How tech-savvy are they?",
        "Where would they discover your product?"
      ]
    },
    {
      question: "What tools does your target user already use?",
      examples: [
        "VS Code for coding, GitHub for version control, Slack for communication",
        "Figma for design, Notion for documentation, Linear for issue tracking",
        "Excel for data, Gmail for communication, Zoom for meetings"
      ],
      followUps: [
        "Would your product replace one of those tools or integrate with them?",
        "How would your product fit into their existing workflow?",
        "What would they have to stop doing to start using your product?"
      ]
    },
    {
      question: "How many potential users are there, and how would you reach them?",
      examples: [
        "~500K active GitHub users who review PRs weekly, reachable through dev Twitter and HN",
        "~2M small business owners in the US, reachable through Facebook ads and local networking",
        "~50K startup PMs, reachable through Product Hunt and PM-focused Slack communities"
      ],
      followUps: [
        "Who would be your first 10 users?",
        "Do you already know people in your target audience?",
        "What communities or channels do they hang out in?"
      ]
    }
  ],
  done: [
    {
      question: "What would a user be able to accomplish that they couldn't before?",
      examples: [
        "Review a PR in 2 minutes instead of 30 minutes",
        "Generate a proposal document in 5 clicks instead of starting from scratch",
        "Track all client communications in one place instead of searching email threads"
      ],
      followUps: [
        "What's the before and after for the user?",
        "How would you measure that improvement?",
        "What would make users say 'I can't go back to the old way'?"
      ]
    },
    {
      question: "What does the MVP look like? What's the smallest thing you could ship?",
      examples: [
        "A CLI tool that takes a PR URL and prints suggested comments to stdout",
        "A web form that generates a PDF proposal from 5 input fields",
        "A Chrome extension that highlights keywords in emails and adds them to a contact database"
      ],
      followUps: [
        "What could you ship in 1 week?",
        "What's the single most important workflow to nail?",
        "What features could wait until v2?"
      ]
    },
    {
      question: "How will you know this is successful?",
      examples: [
        "10 paying users within the first month",
        "Users complete the core workflow 3+ times per week",
        "NPS score of 50+ from beta testers"
      ],
      followUps: [
        "What metrics would you track?",
        "What would make you consider this a failure?",
        "At what point would you decide to pivot or stop?"
      ]
    }
  ]
}

/** Get a random probing question for a context area */
export function getRandomProbingQuestion(area: 'what' | 'why' | 'who' | 'done'): ProbingQuestion {
  const questions = PROBING_QUESTIONS[area]
  return questions[Math.floor(Math.random() * questions.length)]
}

/** Get all probing questions for a context area */
export function getAllProbingQuestions(area: 'what' | 'why' | 'who' | 'done'): ProbingQuestion[] {
  return PROBING_QUESTIONS[area]
}

/** Detect if an answer might be too vague and needs follow-up */
export function detectVagueAnswer(answer: string): { isVague: boolean; reason?: string } {
  const trimmed = answer.trim().toLowerCase()

  // Too short
  if (trimmed.length < 20) {
    return { isVague: true, reason: "This seems a bit brief. Can you add more detail?" }
  }

  // Contains vague words without specifics
  const vaguePatterns = [
    { pattern: /^(an?|the) app$/i, reason: "What kind of app? What does it do specifically?" },
    { pattern: /make (it |things )?easier/i, reason: "Easier how? What specific pain point does it address?" },
    { pattern: /^(users|people|everyone)$/i, reason: "Can you be more specific about who? What's their job or situation?" },
    { pattern: /better (than|experience)/i, reason: "Better in what measurable way?" },
    { pattern: /simple|easy|intuitive/i, reason: "What specific design choices would make it simple?" },
    { pattern: /^it works$/i, reason: "What does 'works' look like? What can users accomplish?" },
  ]

  for (const { pattern, reason } of vaguePatterns) {
    if (pattern.test(trimmed)) {
      return { isVague: true, reason }
    }
  }

  return { isVague: false }
}

/** Suggested prompts based on what's already been filled in */
export function getSuggestedFollowUp(context: {
  what?: string
  why?: string
  who?: string
  done?: string
}): { area: 'what' | 'why' | 'who' | 'done'; prompt: string } | null {
  // Priority order for missing items
  const priorities: ('what' | 'why' | 'who' | 'done')[] = ['what', 'who', 'why', 'done']

  for (const area of priorities) {
    if (!context[area]?.trim()) {
      const question = getRandomProbingQuestion(area)
      return { area, prompt: question.question }
    }
  }

  // All filled - suggest refinement for the shortest/vaguest one
  const entries = Object.entries(context).filter(([, v]) => v?.trim()) as [string, string][]
  const shortest = entries.sort((a, b) => a[1].length - b[1].length)[0]

  if (shortest && shortest[1].length < 50) {
    const area = shortest[0] as 'what' | 'why' | 'who' | 'done'
    const question = getRandomProbingQuestion(area)
    return { area, prompt: `Let's expand on "${shortest[1]}": ${question.followUps[0]}` }
  }

  return null
}
