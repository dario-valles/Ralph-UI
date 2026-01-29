/**
 * Idea Generation Slice
 *
 * Handles AI-powered idea generation for the GSD workflow:
 * - Blank page: Generate from interests
 * - Vague notion: Generate variations
 * - Explore space: Domain exploration
 * - Validate: Feasibility and market analysis
 */
import { gsdApi } from '@/lib/api/gsd-api'
import { errorToString } from '@/lib/store-utils'
import type {
  IdeaGenerationState,
  IdeaGenMode,
  ValidatedIdea,
  QuestioningContext,
  ProjectType,
  VariationDimension,
  IdeaFeasibility,
  MarketOpportunity,
} from '@/types/gsd'
import type { SetState, GetState } from './prdChatTypes'

/**
 * Initial idea generation state
 */
export const INITIAL_IDEA_GENERATION_STATE: IdeaGenerationState = {
  mode: 'blank_page',
  interests: [],
  ideas: [],
  selectedIdeaId: undefined,
  variationDimensions: ['target_user', 'tech_stack'],
  isGenerating: false,
  isValidating: false,
  error: undefined,
}

/**
 * Creates the idea generation slice
 */
export const createIdeaGenerationSlice = (
  set: SetState,
  get: GetState
): {
  ideaGeneration: IdeaGenerationState
  setIdeaGenMode: (mode: IdeaGenMode) => void
  setInterests: (interests: string[]) => void
  setVariationDimensions: (dimensions: VariationDimension[]) => void
  generateIdeas: (projectType: ProjectType, context: QuestioningContext) => Promise<void>
  generateVariations: (
    projectType: ProjectType,
    context: QuestioningContext,
    dimensions: VariationDimension[],
    count?: number
  ) => Promise<void>
  exploreSpace: (domain: string, interests: string[], count?: number) => Promise<void>
  validateIdea: (idea: ValidatedIdea, projectType: ProjectType) => Promise<void>
  analyzeMarket: (idea: ValidatedIdea) => Promise<void>
  selectIdea: (ideaId: string) => void
  clearIdeaGeneration: () => void
  clearError: () => void
} => ({
  // Initial state
  ideaGeneration: INITIAL_IDEA_GENERATION_STATE,

  // Set the mode
  setIdeaGenMode: (mode: IdeaGenMode) => {
    set({
      ideaGeneration: { ...get().ideaGeneration, mode },
    })
  },

  // Set interests
  setInterests: (interests: string[]) => {
    set({
      ideaGeneration: { ...get().ideaGeneration, interests },
    })
  },

  // Set variation dimensions
  setVariationDimensions: (dimensions: VariationDimension[]) => {
    set({
      ideaGeneration: { ...get().ideaGeneration, variationDimensions: dimensions },
    })
  },

  // Generate ideas from blank page (interests)
  generateIdeas: async (
    projectType: ProjectType,
    context: QuestioningContext
  ): Promise<void> => {
    set({
      ideaGeneration: {
        ...get().ideaGeneration,
        isGenerating: true,
        error: undefined,
      },
    })

    try {
      const baseIdeas = await gsdApi.generateIdeaStarters(projectType, context)
      // Convert GeneratedIdea[] to ValidatedIdea[]
      const ideas: ValidatedIdea[] = baseIdeas.map((base) => ({
        base,
        feasibility: undefined,
        market: undefined,
        userScore: undefined,
        interestMatchScore: undefined,
      }))
      set({
        ideaGeneration: {
          ...get().ideaGeneration,
          ideas,
          isGenerating: false,
        },
      })
    } catch (error) {
      set({
        ideaGeneration: {
          ...get().ideaGeneration,
          isGenerating: false,
          error: errorToString(error),
        },
      })
    }
  },

  // Generate variations of a vague notion
  generateVariations: async (
    projectType: ProjectType,
    context: QuestioningContext,
    dimensions: VariationDimension[],
    count: number = 3
  ): Promise<void> => {
    set({
      ideaGeneration: {
        ...get().ideaGeneration,
        isGenerating: true,
        error: undefined,
      },
    })

    try {
      const ideas = await gsdApi.generateIdeaVariations(
        projectType,
        context,
        dimensions,
        count
      )
      set({
        ideaGeneration: {
          ...get().ideaGeneration,
          ideas,
          isGenerating: false,
        },
      })
    } catch (error) {
      set({
        ideaGeneration: {
          ...get().ideaGeneration,
          isGenerating: false,
          error: errorToString(error),
        },
      })
    }
  },

  // Explore idea space
  exploreSpace: async (
    domain: string,
    interests: string[],
    count: number = 5
  ): Promise<void> => {
    set({
      ideaGeneration: {
        ...get().ideaGeneration,
        isGenerating: true,
        error: undefined,
      },
    })

    try {
      const ideas = await gsdApi.exploreIdeaSpace(domain, interests, count)
      set({
        ideaGeneration: {
          ...get().ideaGeneration,
          ideas,
          isGenerating: false,
        },
      })
    } catch (error) {
      set({
        ideaGeneration: {
          ...get().ideaGeneration,
          isGenerating: false,
          error: errorToString(error),
        },
      })
    }
  },

  // Validate idea feasibility
  validateIdea: async (
    idea: ValidatedIdea,
    projectType: ProjectType
  ): Promise<void> => {
    set({
      ideaGeneration: {
        ...get().ideaGeneration,
        isValidating: true,
        error: undefined,
      },
    })

    try {
      const feasibility: IdeaFeasibility = await gsdApi.validateIdeaFeasibility(
        idea.base,
        projectType
      )

      // Update the idea with feasibility data
      const updatedIdeas = get().ideaGeneration.ideas.map((i: ValidatedIdea) =>
        i.base.id === idea.base.id ? { ...i, feasibility } : i
      )

      set({
        ideaGeneration: {
          ...get().ideaGeneration,
          ideas: updatedIdeas,
          isValidating: false,
        },
      })
    } catch (error) {
      set({
        ideaGeneration: {
          ...get().ideaGeneration,
          isValidating: false,
          error: errorToString(error),
        },
      })
    }
  },

  // Analyze market opportunity
  analyzeMarket: async (idea: ValidatedIdea): Promise<void> => {
    set({
      ideaGeneration: {
        ...get().ideaGeneration,
        isValidating: true,
        error: undefined,
      },
    })

    try {
      const market: MarketOpportunity = await gsdApi.analyzeMarketOpportunity(idea.base)

      // Update the idea with market data
      const updatedIdeas = get().ideaGeneration.ideas.map((i: ValidatedIdea) =>
        i.base.id === idea.base.id ? { ...i, market } : i
      )

      set({
        ideaGeneration: {
          ...get().ideaGeneration,
          ideas: updatedIdeas,
          isValidating: false,
        },
      })
    } catch (error) {
      set({
        ideaGeneration: {
          ...get().ideaGeneration,
          isValidating: false,
          error: errorToString(error),
        },
      })
    }
  },

  // Select an idea
  selectIdea: (ideaId: string) => {
    set({
      ideaGeneration: {
        ...get().ideaGeneration,
        selectedIdeaId: ideaId,
      },
    })
  },

  // Clear idea generation state
  clearIdeaGeneration: () => {
    set({
      ideaGeneration: INITIAL_IDEA_GENERATION_STATE,
    })
  },

  // Clear error
  clearError: () => {
    set({
      ideaGeneration: {
        ...get().ideaGeneration,
        error: undefined,
      },
    })
  },
})
